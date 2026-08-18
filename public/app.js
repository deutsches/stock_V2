import {
  createSnapshotIfMissing,
  deleteAnnualSummary,
  deleteTransaction,
  observeAuthentication,
  observeAnnualSummaries,
  observeCashBalances,
  observeConnection,
  observeHoldings,
  observeSnapshots,
  observeTransactions,
  observeServerTimeOffset,
  replaceHoldings,
  replaceSnapshot,
  saveCashBalances,
  saveAnnualSummary,
  saveManualAssetRecord,
  saveTransaction,
  signInWithGoogle,
  signOutUser,
  updateAnnualSummary
} from "./firebase-service.js";
import { buildAssetSnapshot, getCurrentSnapshotSlot } from "./snapshot-scheduler.js";
import { sortHoldings } from "./holding-sort.js";
import { buildHistoryChartModel, calculateHistoryStats, filterSnapshotsByRange, normalizeSnapshots } from "./history-chart.js";
import { createHistoryDemoSnapshots } from "./history-demo-data.js";
import { filterTransactions, normalizeTransactions, summarizeTransactions, transactionMetrics } from "./transaction-records.js";
import { annualSummaryTotal, canLinkAnnualSummary, normalizeAnnualSummaries, resolveAnnualSummaries, summarizeAnnualRecords } from "./annual-summary.js";
import { routeFromHash, titleForRoute } from "./router.js";

const STORAGE_KEY = "stockv2-portfolio-v1";
const USD_TO_TWD = 30.33;

const state = {
  market: "ALL",
  holdings: [],
  cash: { twd: 0, usd: 0 },
  user: null,
  unsubscribeHoldings: null,
  unsubscribeCash: null,
  unsubscribeSnapshots: null,
  unsubscribeTransactions: null,
  unsubscribeAnnualSummaries: null,
  snapshots: [],
  transactions: [],
  annualSummaries: [],
  editingAnnualSummaryId: null,
  transactionMarket: "TW",
  transactionYearFilter: "ALL",
  historyRange: "YTD",
  historyDemo: false,
  firebaseLoaded: false,
  cashLoaded: false,
  serverTimeOffset: 0,
  snapshotCheckInFlight: false,
  snapshotReplacePending: false
};

const elements = {
  body: document.querySelector("#holdings-body"),
  count: document.querySelector("#holding-count"),
  empty: document.querySelector("#empty-state"),
  dialog: document.querySelector("#price-dialog"),
  form: document.querySelector("#price-form"),
  symbol: document.querySelector("#price-symbol"),
  updateStockSymbol: document.querySelector("#update-stock-symbol"),
  updateStockName: document.querySelector("#update-stock-name"),
  updateShares: document.querySelector("#update-shares"),
  updateTotalCost: document.querySelector("#update-total-cost"),
  updateCostCurrency: document.querySelector("#update-cost-currency"),
  updateCalculatedAverage: document.querySelector("#update-calculated-average"),
  price: document.querySelector("#new-price"),
  currency: document.querySelector("#price-currency"),
  holdingDialog: document.querySelector("#holding-dialog"),
  holdingForm: document.querySelector("#holding-form"),
  holdingMarket: document.querySelector("#holding-market"),
  holdingSymbol: document.querySelector("#holding-symbol"),
  holdingName: document.querySelector("#holding-name"),
  holdingShares: document.querySelector("#holding-shares"),
  holdingTotalCost: document.querySelector("#holding-total-cost"),
  holdingCalculatedAverage: document.querySelector("#holding-calculated-average"),
  holdingPrice: document.querySelector("#holding-price"),
  holdingFormError: document.querySelector("#holding-form-error"),
  authScreen: document.querySelector("#auth-screen"),
  appShell: document.querySelector("#app-shell"),
  authMessage: document.querySelector("#auth-message"),
  firebaseStatus: document.querySelector("#firebase-status"),
  firebaseStatusDot: document.querySelector("#firebase-status-dot"),
  signedInEmail: document.querySelector("#signed-in-email"),
  cashDialog: document.querySelector("#cash-dialog"),
  cashForm: document.querySelector("#cash-form"),
  cashTwd: document.querySelector("#cash-twd"),
  cashUsd: document.querySelector("#cash-usd"),
  cashTotalPreview: document.querySelector("#cash-total-preview"),
  cashFormError: document.querySelector("#cash-form-error"),
  historyRecordDialog: document.querySelector("#history-record-dialog"),
  historyRecordForm: document.querySelector("#history-record-form"),
  historyRecordDate: document.querySelector("#history-record-date"),
  historyRecordAssets: document.querySelector("#history-record-assets"),
  historyRecordError: document.querySelector("#history-record-error"),
  historyChart: document.querySelector("#history-chart"),
  historyChartWrap: document.querySelector("#history-chart-wrap"),
  historyEmpty: document.querySelector("#history-empty"),
  historySummary: document.querySelector("#history-summary"),
  historyDemoToggle: document.querySelector("#history-demo-toggle"),
  historyDemoNotice: document.querySelector("#history-demo-notice"),
  historyRecordsBody: document.querySelector("#history-records-body"),
  historyRecordCount: document.querySelector("#history-record-count"),
  transactionDialog: document.querySelector("#transaction-dialog"),
  transactionForm: document.querySelector("#transaction-form"),
  transactionMarket: document.querySelector("#transaction-market"),
  transactionYear: document.querySelector("#transaction-year"),
  transactionSymbol: document.querySelector("#transaction-symbol"),
  transactionName: document.querySelector("#transaction-name"),
  transactionProfit: document.querySelector("#transaction-profit"),
  transactionProfitRate: document.querySelector("#transaction-profit-rate"),
  transactionSellPrice: document.querySelector("#transaction-sell-price"),
  transactionYearFilter: document.querySelector("#transaction-year-filter"),
  transactionFormError: document.querySelector("#transaction-form-error"),
  transactionYearBody: document.querySelector("#transaction-year-body"),
  transactionAllBody: document.querySelector("#transaction-all-body"),
  transactionYearEmpty: document.querySelector("#transaction-year-empty"),
  transactionAllEmpty: document.querySelector("#transaction-all-empty"),
  annualSummaryDialog: document.querySelector("#annual-summary-dialog"),
  annualSummaryDialogTitle: document.querySelector("#annual-summary-dialog-title"),
  annualSummarySubmit: document.querySelector("#annual-summary-submit"),
  annualSummaryForm: document.querySelector("#annual-summary-form"),
  annualSummaryLabel: document.querySelector("#annual-summary-label"),
  annualSummaryOrder: document.querySelector("#annual-summary-order"),
  annualSummaryLinked: document.querySelector("#annual-summary-linked"),
  annualSummaryLinkedHint: document.querySelector("#annual-summary-linked-hint"),
  annualSummaryTwProfit: document.querySelector("#annual-summary-tw-profit"),
  annualSummaryDividend: document.querySelector("#annual-summary-dividend"),
  annualSummaryTwRate: document.querySelector("#annual-summary-tw-rate"),
  annualSummaryUsProfit: document.querySelector("#annual-summary-us-profit"),
  annualSummaryUsRate: document.querySelector("#annual-summary-us-rate"),
  annualSummaryUsTwd: document.querySelector("#annual-summary-us-twd"),
  annualSummaryFormError: document.querySelector("#annual-summary-form-error"),
  annualSummaryBody: document.querySelector("#annual-summary-body"),
  annualSummaryEmpty: document.querySelector("#annual-summary-empty"),
  toast: document.querySelector("#toast")
};

function loadLocalHoldings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function holdingKey(item) {
  return `${item.market}:${item.symbol}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

function saveHoldings() {
  if (!state.user) return Promise.reject(new Error("尚未登入 Firebase"));
  state.holdings = sortHoldings(state.holdings);
  return replaceHoldings(state.user.uid, state.holdings);
}

function inTwd(value, market) {
  return market === "US" ? value * USD_TO_TWD : value;
}

function cashTotalTwd() {
  return state.cash.twd + state.cash.usd * USD_TO_TWD;
}

function money(value, market = "TW", includeSign = false) {
  const locale = market === "US" ? "en-US" : "zh-TW";
  const currency = market === "US" ? "USD" : "TWD";
  const options = { style: "currency", currency, maximumFractionDigits: market === "US" ? 2 : 0 };
  const formatted = new Intl.NumberFormat(locale, options).format(Math.abs(value));
  if (!includeSign || value === 0) return formatted;
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

function percent(value, includeSign = true) {
  const sign = includeSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function number(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0
  }).format(value);
}

function totals() {
  const total = state.holdings.reduce((result, item) => {
    const marketValue = inTwd(item.shares * item.price, item.market);
    const cost = inTwd(item.shares * item.averageCost, item.market);
    const previous = inTwd(item.shares * item.previousClose, item.market);
    result.value += marketValue;
    result.cost += cost;
    result.previous += previous;
    result[item.market] += marketValue;
    return result;
  }, { value: 0, cost: 0, previous: 0, TW: 0, US: 0 });
  total.cash = cashTotalTwd();
  total.assets = total.value + total.cash;
  return total;
}

function marketTotals(market) {
  return state.holdings
    .filter(item => item.market === market)
    .reduce((result, item) => {
      result.count += 1;
      result.value += item.shares * item.price;
      result.cost += item.shares * item.averageCost;
      return result;
    }, { count: 0, value: 0, cost: 0 });
}

function renderSummary() {
  const total = totals();
  const profit = total.value - total.cost;
  const profitRate = total.cost ? (profit / total.cost) * 100 : 0;
  const change = total.value - total.previous;
  const changeRate = total.previous ? (change / total.previous) * 100 : 0;
  const twPercent = total.assets ? (total.TW / total.assets) * 100 : 0;
  const usPercent = total.assets ? (total.US / total.assets) * 100 : 0;
  const cashPercent = total.assets ? (total.cash / total.assets) * 100 : 0;

  document.querySelector("#total-assets").textContent = money(total.assets);
  document.querySelector("#current-cash").textContent = money(total.cash);
  document.querySelector("#total-cost").textContent = money(total.cost);
  setSignedMetric("#unrealized-profit", profit, "TW");
  document.querySelector("#unrealized-rate").textContent = `報酬率 ${percent(profitRate)}`;
  setSignedMetric("#daily-change", change, "TW");
  document.querySelector("#daily-rate").textContent = `較前一個收盤價 ${percent(changeRate)}`;
  document.querySelector("#total-change").className = `metric-change ${change >= 0 ? "positive" : "negative"}`;
  document.querySelector("#total-change").textContent = `今日 ${money(change, "TW", true)}（${percent(changeRate)}）`;
  document.querySelector("#tw-allocation").style.width = `${twPercent}%`;
  document.querySelector("#us-allocation").style.width = `${usPercent}%`;
  document.querySelector("#cash-allocation").style.width = `${cashPercent}%`;
  document.querySelector("#tw-percent").textContent = `${twPercent.toFixed(0)}%`;
  document.querySelector("#us-percent").textContent = `${usPercent.toFixed(0)}%`;
  document.querySelector("#cash-percent").textContent = `${cashPercent.toFixed(0)}%`;
  renderMarketSummary("TW", marketTotals("TW"));
  renderMarketSummary("US", marketTotals("US"));
}

function renderMarketSummary(market, summary) {
  const prefix = market.toLowerCase();
  const profit = summary.value - summary.cost;
  const rate = summary.cost ? (profit / summary.cost) * 100 : 0;
  document.querySelector(`#${prefix}-holding-count`).textContent = `${summary.count} 檔持股`;
  document.querySelector(`#${prefix}-market-value`).textContent = money(summary.value, market);
  document.querySelector(`#${prefix}-market-cost`).textContent = money(summary.cost, market);
  if (market === "US") {
    document.querySelector("#us-market-cost-twd").textContent = money(inTwd(summary.cost, "US"));
  }
  const profitNode = document.querySelector(`#${prefix}-market-profit`);
  const rateNode = document.querySelector(`#${prefix}-market-rate`);
  profitNode.textContent = money(profit, market, true);
  rateNode.textContent = percent(rate);
  [profitNode, rateNode].forEach(node => {
    node.classList.toggle("positive", profit >= 0);
    node.classList.toggle("negative", profit < 0);
  });
}

function setSignedMetric(selector, value, market) {
  const node = document.querySelector(selector);
  node.textContent = money(value, market, true);
  node.classList.toggle("positive", value >= 0);
  node.classList.toggle("negative", value < 0);
}

function renderHoldings() {
  const holdings = state.holdings.filter(item => state.market === "ALL" || item.market === state.market);
  const portfolioValue = totals().value;
  elements.body.innerHTML = holdings.map(item => {
    const value = item.shares * item.price;
    const cost = item.shares * item.averageCost;
    const profit = value - cost;
    const rate = cost ? (profit / cost) * 100 : 0;
    const twdCost = inTwd(cost, item.market);
    const twdValue = inTwd(value, item.market);
    const change = item.price - item.previousClose;
    const changeRate = item.previousClose ? (change / item.previousClose) * 100 : 0;
    const allocation = portfolioValue ? (twdValue / portfolioValue) * 100 : 0;
    const profitClass = profit >= 0 ? "positive" : "negative";
    const changeClass = change >= 0 ? "positive" : "negative";
    const displayLabel = item.market === "TW" ? item.name : item.symbol;
    return `
      <tr>
        <td><strong class="stock-symbol" title="${escapeHtml(item.symbol)}">${escapeHtml(displayLabel)}</strong></td>
        <td>${number(item.shares, 4)}</td>
        <td>${number(item.averageCost)}</td>
        <td>${number(cost)}</td>
        <td class="${profitClass}">${number(profit)}</td>
        <td class="${profitClass}">${percent(rate, false)}</td>
        <td>${number(item.price)}</td>
        <td class="${changeClass}">${number(change)}</td>
        <td class="${changeClass}">${percent(changeRate, false)}</td>
        <td>${number(twdCost, 0)}</td>
        <td>${percent(allocation, false)}</td>
        <td class="action-column"><button class="row-action" data-update-key="${escapeHtml(holdingKey(item))}" aria-label="管理 ${escapeHtml(item.name)}" title="更新或刪除">⋯</button></td>
      </tr>`;
  }).join("");

  elements.count.textContent = `${holdings.length} 檔持股`;
  elements.empty.hidden = holdings.length > 0;
  document.querySelector("table").hidden = holdings.length === 0;
}

function render() {
  renderSummary();
  renderHoldings();
}

function renderRoute() {
  const route = routeFromHash(window.location.hash);
  document.querySelectorAll("[data-route-page]").forEach(page => {
    page.hidden = page.dataset.routePage !== route;
  });
  document.querySelectorAll("[data-route-link]").forEach(link => {
    const isActive = link.dataset.routeLink === route;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = titleForRoute(route);
}

function shortMoney(value) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function snapshotLabel(snapshot) {
  const [, month, day] = snapshot.localDate.split("-");
  if (snapshot.slot === "manual") return `${month}/${day} 手動基準`;
  return `${month}/${day} ${snapshot.slot === "0630" ? "06:30" : "14:30"}`;
}

const historyDemoSnapshots = createHistoryDemoSnapshots();

function renderHistoryStats(snapshots) {
  const stats = calculateHistoryStats(snapshots);
  const fields = ["history-latest", "history-period-change", "history-highest", "history-drawdown"];
  if (!stats) {
    fields.forEach(id => { document.querySelector(`#${id}`).textContent = "—"; });
    document.querySelector("#history-latest-date").textContent = "尚無資料";
    document.querySelector("#history-period-rate").textContent = "—";
    document.querySelector("#history-highest-date").textContent = "—";
    document.querySelector("#history-drawdown-rate").textContent = "—";
    return;
  }
  document.querySelector("#history-latest").textContent = money(stats.latest.totalAssetsTwd);
  document.querySelector("#history-latest-date").textContent = snapshotLabel(stats.latest);
  const changeNode = document.querySelector("#history-period-change");
  changeNode.textContent = money(stats.change, "TW", true);
  changeNode.className = stats.change >= 0 ? "positive" : "negative";
  document.querySelector("#history-period-rate").textContent = percent(stats.changeRate);
  document.querySelector("#history-highest").textContent = money(stats.highest.totalAssetsTwd);
  document.querySelector("#history-highest-date").textContent = snapshotLabel(stats.highest);
  document.querySelector("#history-drawdown").textContent = money(-stats.maxDrawdown, "TW", true);
  document.querySelector("#history-drawdown-rate").textContent = `−${stats.maxDrawdownRate.toFixed(2)}%`;
}

function renderHistoryRecords(snapshots) {
  elements.historyRecordCount.textContent = `${snapshots.length} 筆紀錄`;
  elements.historyRecordsBody.innerHTML = snapshots.slice().reverse().map((snapshot, index, reversed) => {
    const previous = reversed[index + 1];
    const change = previous ? snapshot.totalAssetsTwd - previous.totalAssetsTwd : 0;
    return `<tr>
      <td>${snapshotLabel(snapshot)}</td>
      <td>${money(snapshot.totalAssetsTwd)}</td>
      <td>${Number.isFinite(snapshot.marketValueTwd) ? money(snapshot.marketValueTwd) : "—"}</td>
      <td>${Number.isFinite(snapshot.cashTwd) ? money(snapshot.cashTwd) : "—"}</td>
      <td class="${change >= 0 ? "positive" : "negative"}">${previous ? money(change, "TW", true) : "—"}</td>
    </tr>`;
  }).join("");
}

function renderHistoryChart() {
  const source = state.historyDemo ? historyDemoSnapshots : state.snapshots;
  const snapshots = filterSnapshotsByRange(source, state.historyRange);
  const model = buildHistoryChartModel(snapshots);
  renderHistoryStats(snapshots);
  renderHistoryRecords(snapshots);
  elements.historyChartWrap.hidden = !model;
  elements.historyEmpty.hidden = Boolean(model);

  if (!model) {
    elements.historySummary.textContent = "等待歷史快照資料";
    elements.historyChart.innerHTML = "";
    return;
  }

  const first = snapshots[0];
  const latest = snapshots.at(-1);
  const change = latest.totalAssetsTwd - first.totalAssetsTwd;
  const changeRate = first.totalAssetsTwd ? (change / first.totalAssetsTwd) * 100 : 0;
  elements.historySummary.innerHTML = `最新 ${money(latest.totalAssetsTwd)} <span class="${change >= 0 ? "positive" : "negative"}">${money(change, "TW", true)}（${percent(changeRate)}）</span> · ${snapshots.length} 筆快照`;

  const grid = model.yTicks.map(tick => `
    <line class="chart-grid-line" x1="${model.bounds.left}" y1="${tick.y}" x2="${model.width - model.bounds.right}" y2="${tick.y}"></line>
    <text class="chart-axis-label chart-y-label" x="${model.bounds.left - 14}" y="${tick.y + 4}">${shortMoney(tick.value)}</text>
  `).join("");
  const labels = model.xLabels.map(point => `
    <text class="chart-axis-label" x="${point.x}" y="${model.height - 13}" text-anchor="middle">${snapshotLabel(point)}</text>
  `).join("");
  const points = model.points.map(point => {
    const details = Number.isFinite(point.marketValueTwd)
      ? `｜持股 ${money(point.marketValueTwd)}｜現金 ${money(point.cashTwd)}`
      : "｜手動補登，無明細";
    return `
    <circle class="chart-point" cx="${point.x}" cy="${point.assetsY}" r="4" tabindex="0">
      <title>${snapshotLabel(point)}｜總資產 ${money(point.totalAssetsTwd)}${details}</title>
    </circle>
  `;
  }).join("");

  elements.historyChart.innerHTML = `
    <title id="history-chart-title">資產歷史曲線圖</title>
    <desc id="history-chart-description">${snapshotLabel(first)} 到 ${snapshotLabel(latest)}，共 ${snapshots.length} 筆資產快照</desc>
    ${grid}
    ${labels}
    <path class="chart-line chart-holdings-line" d="${model.holdingsPath}"></path>
    <path class="chart-line chart-value-line" d="${model.assetsPath}"></path>
    ${points}
  `;
}

function taipeiYear() {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Taipei", year: "numeric" }).format(new Date()));
}

function transactionLabel(record) {
  return record.market === "TW" ? record.name : record.symbol;
}

function transactionRows(records, includeYear = false) {
  return records.map(record => {
    const metrics = transactionMetrics(record, USD_TO_TWD);
    const profitClass = metrics.profit >= 0 ? "positive" : "negative";
    return `<tr>
      ${includeYear ? `<td>${record.year}</td>` : ""}
      <td><strong title="${escapeHtml(record.symbol)}">${escapeHtml(transactionLabel(record))}</strong></td>
      <td class="${profitClass}">${money(metrics.profit, record.market, true)}</td>
      <td>${record.sellPrice === null ? "—" : money(record.sellPrice, record.market)}</td>
      <td class="${profitClass}">${percent(metrics.profitRate)}</td>
      <td class="action-column"><button class="row-action" data-delete-transaction="${escapeHtml(record.id)}" aria-label="刪除 ${escapeHtml(transactionLabel(record))} 紀錄" title="刪除紀錄">×</button></td>
    </tr>`;
  }).join("");
}

function setTransactionMetric(id, value, market, signed = false) {
  const node = document.querySelector(`#${id}`);
  node.textContent = money(value, market, signed);
  if (signed) {
    node.classList.toggle("positive", value >= 0);
    node.classList.toggle("negative", value < 0);
  }
}

function renderTransactions() {
  const market = state.transactionMarket;
  const marketRecords = filterTransactions(state.transactions, market);
  const yearRecords = filterTransactions(state.transactions, market, taipeiYear());
  const availableYears = [...new Set(marketRecords.map(record => record.year))].sort((a, b) => b - a);
  if (state.transactionYearFilter !== "ALL" && !availableYears.includes(Number(state.transactionYearFilter))) {
    state.transactionYearFilter = "ALL";
  }
  elements.transactionYearFilter.innerHTML = `<option value="ALL">全選</option>${availableYears.map(year => `<option value="${year}">${year}</option>`).join("")}`;
  elements.transactionYearFilter.value = state.transactionYearFilter;
  const allRecords = state.transactionYearFilter === "ALL"
    ? marketRecords
    : filterTransactions(state.transactions, market, Number(state.transactionYearFilter));
  const yearSummary = summarizeTransactions(yearRecords, USD_TO_TWD);
  const allSummary = summarizeTransactions(allRecords, USD_TO_TWD);

  setTransactionMetric("transaction-year-profit", yearSummary.profit, market, true);
  setTransactionMetric("transaction-all-profit", allSummary.profit, market, true);
  document.querySelector("#transaction-year-rate").textContent = percent(yearSummary.profitRate);
  document.querySelector("#transaction-all-rate").textContent = percent(allSummary.profitRate);
  document.querySelector("#transaction-year-rate").className = yearSummary.profit >= 0 ? "positive" : "negative";
  document.querySelector("#transaction-all-rate").className = allSummary.profit >= 0 ? "positive" : "negative";
  const yearProfitTwd = document.querySelector("#transaction-year-profit-twd");
  const allProfitTwd = document.querySelector("#transaction-all-profit-twd");
  yearProfitTwd.textContent = `約 ${money(yearSummary.profitTwd, "TW", true)} · 匯率 30.33`;
  yearProfitTwd.className = yearSummary.profitTwd >= 0 ? "positive" : "negative";
  allProfitTwd.textContent = `約 ${money(allSummary.profitTwd, "TW", true)} · 匯率 30.33`;
  allProfitTwd.className = allSummary.profitTwd >= 0 ? "positive" : "negative";
  document.querySelectorAll(".transaction-twd-rate").forEach(node => {
    node.hidden = market !== "US";
  });
  document.querySelector("#transaction-all-summary-label").textContent = state.transactionYearFilter === "ALL" ? "歷年實際損益" : `${state.transactionYearFilter} 年實際損益`;

  elements.transactionYearBody.innerHTML = transactionRows(yearRecords);
  elements.transactionAllBody.innerHTML = transactionRows(allRecords, true);
  elements.transactionYearEmpty.hidden = yearRecords.length > 0;
  elements.transactionAllEmpty.hidden = allRecords.length > 0;
  elements.transactionYearBody.closest("table").hidden = yearRecords.length === 0;
  elements.transactionAllBody.closest("table").hidden = allRecords.length === 0;
  document.querySelector("#transaction-year-count").textContent = `${yearRecords.length} 筆紀錄`;
  document.querySelector("#transaction-all-count").textContent = `${allRecords.length} 筆紀錄`;
}

function syncTransactionForm() {
  const market = elements.transactionMarket.value;
  const currency = market === "US" ? "US$" : "NT$";
  document.querySelectorAll(".transaction-currency").forEach(node => { node.textContent = currency; });
  elements.transactionName.required = market === "TW";
  elements.transactionName.placeholder = market === "TW" ? "例如 台積電" : "可留空，頁面顯示股票代號";
}

function openTransactionDialog() {
  elements.transactionForm.reset();
  elements.transactionMarket.value = state.transactionMarket;
  elements.transactionYear.value = taipeiYear();
  elements.transactionFormError.textContent = "";
  syncTransactionForm();
  elements.transactionDialog.showModal();
  setTimeout(() => elements.transactionSymbol.focus(), 50);
}

async function addTransaction(event) {
  event.preventDefault();
  const market = elements.transactionMarket.value;
  const transaction = {
    market,
    year: Number(elements.transactionYear.value),
    symbol: elements.transactionSymbol.value.trim().toUpperCase(),
    name: elements.transactionName.value.trim() || elements.transactionSymbol.value.trim().toUpperCase(),
    profit: Number(elements.transactionProfit.value),
    profitRate: Number(elements.transactionProfitRate.value),
    sellPrice: elements.transactionSellPrice.value === "" ? null : Number(elements.transactionSellPrice.value)
  };
  if (!transaction.symbol || !Number.isInteger(transaction.year) || transaction.year < 1900 || transaction.year > 2200 || (market === "TW" && !elements.transactionName.value.trim()) || !Number.isFinite(transaction.profit) || !Number.isFinite(transaction.profitRate) || (transaction.sellPrice !== null && (!Number.isFinite(transaction.sellPrice) || transaction.sellPrice < 0))) {
    elements.transactionFormError.textContent = "請確認年份、標的、損益與報酬率均已正確填寫。";
    return;
  }
  try {
    await saveTransaction(state.user.uid, transaction);
    elements.transactionDialog.close();
    showToast(`${transaction.name} 的賣出紀錄已新增`);
  } catch (error) {
    elements.transactionFormError.textContent = `儲存失敗：${friendlyFirebaseError(error)}`;
  }
}

async function removeTransactionRecord(transactionId) {
  const record = state.transactions.find(transaction => transaction.id === transactionId);
  if (!record || !window.confirm(`確定刪除 ${transactionLabel(record)} ${record.year} 年的賣出紀錄？`)) return;
  try {
    await deleteTransaction(state.user.uid, transactionId);
    showToast(`${transactionLabel(record)} 的紀錄已刪除`);
  } catch (error) {
    showToast(`刪除失敗：${friendlyFirebaseError(error)}`);
  }
}

function annualValueClass(value) {
  return value >= 0 ? "positive" : "negative";
}

function optionalPercent(value) {
  return value === null ? "—" : percent(value);
}

function renderAnnualSummaries() {
  const resolvedRecords = resolveAnnualSummaries(state.annualSummaries, state.transactions, USD_TO_TWD);
  const summary = summarizeAnnualRecords(resolvedRecords);
  const totalNode = document.querySelector("#annual-summary-total");
  totalNode.textContent = money(summary.totalProfitTwd, "TW", true);
  totalNode.className = annualValueClass(summary.totalProfitTwd);
  document.querySelector("#annual-summary-count").textContent = `${state.annualSummaries.length} 筆獨立項目`;
  elements.annualSummaryBody.innerHTML = resolvedRecords.map(record => {
    const total = annualSummaryTotal(record);
    return `<tr>
      <td><strong>${escapeHtml(record.label)}</strong>${record.linkedToTransactions ? '<span class="annual-linked-badge">自動連動</span>' : ""}</td>
      <td class="${annualValueClass(record.twProfit)}">${money(record.twProfit, "TW", true)}</td>
      <td class="${annualValueClass(record.dividend)}">${money(record.dividend, "TW", true)}</td>
      <td class="${record.twReturnRate === null ? "" : annualValueClass(record.twReturnRate)}">${optionalPercent(record.twReturnRate)}</td>
      <td class="${annualValueClass(record.usProfitUsd)}">${money(record.usProfitUsd, "US", true)}</td>
      <td class="${record.usReturnRate === null ? "" : annualValueClass(record.usReturnRate)}">${optionalPercent(record.usReturnRate)}</td>
      <td class="${annualValueClass(record.usProfitTwd)}">${money(record.usProfitTwd, "TW", true)}</td>
      <td class="${annualValueClass(total)}"><strong>${money(total, "TW", true)}</strong></td>
      <td class="action-column annual-actions-column"><div class="annual-row-actions"><button class="row-edit" data-edit-annual-summary="${escapeHtml(record.id)}" type="button" aria-label="編輯 ${escapeHtml(record.label)} 總記錄" title="編輯總記錄">✎</button><button class="row-action" data-delete-annual-summary="${escapeHtml(record.id)}" type="button" aria-label="刪除 ${escapeHtml(record.label)} 總記錄" title="刪除總記錄">×</button></div></td>
    </tr>`;
  }).join("");
  elements.annualSummaryEmpty.hidden = state.annualSummaries.length > 0;
  elements.annualSummaryBody.closest("table").hidden = state.annualSummaries.length === 0;
}

function setAnnualFormValue(input, value) {
  input.value = value === null || value === undefined ? "" : value;
}

function syncAnnualLinkForm() {
  const linkable = canLinkAnnualSummary({ label: elements.annualSummaryLabel.value });
  elements.annualSummaryLinked.disabled = !linkable;
  if (!linkable) elements.annualSummaryLinked.checked = false;
  const linked = linkable && elements.annualSummaryLinked.checked;
  const autoInputs = [elements.annualSummaryTwProfit, elements.annualSummaryTwRate, elements.annualSummaryUsProfit, elements.annualSummaryUsRate, elements.annualSummaryUsTwd];
  autoInputs.forEach(input => {
    input.disabled = linked;
    input.closest("label").classList.toggle("annual-auto-input", linked);
  });
  elements.annualSummaryLinkedHint.textContent = linked
    ? `${elements.annualSummaryLabel.value.trim()} 年的台股與美股數字將依交易紀錄自動更新；股利仍可手動輸入。`
    : linkable
      ? "啟用後，台股與美股數字會依同年度交易紀錄自動更新；股利仍手動輸入。"
      : "僅四位數年度可啟用；獨立個股資料維持手動輸入。";
}

function openAnnualSummaryDialog(recordId = null) {
  elements.annualSummaryForm.reset();
  state.editingAnnualSummaryId = recordId;
  const record = recordId ? state.annualSummaries.find(item => item.id === recordId) : null;
  elements.annualSummaryDialogTitle.textContent = record ? `編輯 ${record.label}` : "新增年度總記錄";
  elements.annualSummarySubmit.textContent = record ? "儲存修改" : "儲存總記錄";
  if (record) {
    setAnnualFormValue(elements.annualSummaryLabel, record.label);
    setAnnualFormValue(elements.annualSummaryOrder, record.order);
    setAnnualFormValue(elements.annualSummaryTwProfit, record.twProfit);
    setAnnualFormValue(elements.annualSummaryDividend, record.dividend);
    setAnnualFormValue(elements.annualSummaryTwRate, record.twReturnRate);
    setAnnualFormValue(elements.annualSummaryUsProfit, record.usProfitUsd);
    setAnnualFormValue(elements.annualSummaryUsRate, record.usReturnRate);
    setAnnualFormValue(elements.annualSummaryUsTwd, record.usProfitTwd);
    elements.annualSummaryLinked.checked = record.linkedToTransactions;
  } else {
    elements.annualSummaryOrder.value = state.annualSummaries.length + 1;
  }
  syncAnnualLinkForm();
  elements.annualSummaryFormError.textContent = "";
  elements.annualSummaryDialog.showModal();
  setTimeout(() => elements.annualSummaryLabel.focus(), 50);
}

function numericInputOrZero(input) {
  return input.value === "" ? 0 : Number(input.value);
}

function optionalNumericInput(input) {
  return input.value === "" ? null : Number(input.value);
}

async function addAnnualSummary(event) {
  event.preventDefault();
  const record = {
    label: elements.annualSummaryLabel.value.trim(),
    order: elements.annualSummaryOrder.value === "" ? state.annualSummaries.length + 1 : Number(elements.annualSummaryOrder.value),
    twProfit: numericInputOrZero(elements.annualSummaryTwProfit),
    dividend: numericInputOrZero(elements.annualSummaryDividend),
    twReturnRate: optionalNumericInput(elements.annualSummaryTwRate),
    usProfitUsd: numericInputOrZero(elements.annualSummaryUsProfit),
    usReturnRate: optionalNumericInput(elements.annualSummaryUsRate),
    usProfitTwd: numericInputOrZero(elements.annualSummaryUsTwd),
    linkedToTransactions: elements.annualSummaryLinked.checked
  };
  const numericValues = [record.order, record.twProfit, record.dividend, record.usProfitUsd, record.usProfitTwd];
  const optionalValues = [record.twReturnRate, record.usReturnRate].filter(value => value !== null);
  if (!record.label || !numericValues.every(Number.isFinite) || !optionalValues.every(Number.isFinite)) {
    elements.annualSummaryFormError.textContent = "請確認名稱、金額、報酬率與排序均已正確填寫。";
    return;
  }
  try {
    const editing = state.editingAnnualSummaryId;
    if (editing) await updateAnnualSummary(state.user.uid, editing, record);
    else await saveAnnualSummary(state.user.uid, record);
    elements.annualSummaryDialog.close();
    state.editingAnnualSummaryId = null;
    showToast(`${record.label} 的年度總記錄已${editing ? "更新" : "新增"}`);
  } catch (error) {
    elements.annualSummaryFormError.textContent = `儲存失敗：${friendlyFirebaseError(error)}`;
  }
}

async function removeAnnualSummaryRecord(recordId) {
  const record = state.annualSummaries.find(item => item.id === recordId);
  if (!record || !window.confirm(`確定刪除 ${record.label} 的年度總記錄？`)) return;
  try {
    await deleteAnnualSummary(state.user.uid, recordId);
    showToast(`${record.label} 的年度總記錄已刪除`);
  } catch (error) {
    showToast(`刪除失敗：${friendlyFirebaseError(error)}`);
  }
}

function openPriceDialog(key = state.holdings[0] ? holdingKey(state.holdings[0]) : "") {
  elements.symbol.innerHTML = state.holdings.map(item => `<option value="${escapeHtml(holdingKey(item))}">${escapeHtml(item.symbol)} · ${escapeHtml(item.name)}</option>`).join("");
  elements.symbol.value = key;
  syncPriceInput();
  elements.dialog.showModal();
  setTimeout(() => elements.price.focus(), 50);
}

function syncPriceInput() {
  const selected = state.holdings.find(item => holdingKey(item) === elements.symbol.value);
  if (!selected) return;
  elements.currency.textContent = selected.market === "US" ? "US$" : "NT$";
  elements.updateCostCurrency.textContent = selected.market === "US" ? "US$" : "NT$";
  elements.updateStockSymbol.value = selected.symbol;
  elements.updateStockName.value = selected.name;
  elements.updateShares.value = selected.shares;
  elements.updateTotalCost.value = selected.shares * selected.averageCost;
  elements.price.value = selected.price;
  elements.price.step = "any";
  renderCalculatedAverage(elements.updateShares, elements.updateTotalCost, elements.updateCalculatedAverage, selected.market);
}

async function savePrice(event) {
  event.preventDefault();
  const holdingIndex = state.holdings.findIndex(item => holdingKey(item) === elements.symbol.value);
  const holding = state.holdings[holdingIndex];
  const newSymbol = elements.updateStockSymbol.value.trim().toUpperCase();
  const newName = elements.updateStockName.value.trim();
  const newShares = Number(elements.updateShares.value);
  const newTotalCost = Number(elements.updateTotalCost.value);
  const newPrice = Number(elements.price.value);
  if (!holding || !newSymbol || !newName || !Number.isFinite(newShares) || newShares <= 0 || !Number.isFinite(newTotalCost) || newTotalCost < 0 || !Number.isFinite(newPrice) || newPrice <= 0) return;
  if (state.holdings.some((item, index) => index !== holdingIndex && item.market === holding.market && item.symbol === newSymbol)) {
    showToast(`儲存失敗：${newSymbol} 已存在於目前持股`);
    return;
  }

  const previousHoldings = state.holdings.map(item => ({ ...item }));
  holding.symbol = newSymbol;
  holding.name = newName;
  holding.shares = newShares;
  holding.averageCost = newTotalCost / newShares;
  if (newPrice !== holding.price) holding.previousClose = holding.price;
  holding.price = newPrice;
  state.holdings = sortHoldings(state.holdings);
  try {
    await saveHoldings();
    await checkAssetSnapshot(true);
  } catch (error) {
    state.holdings = previousHoldings;
    showToast(`儲存失敗：${friendlyFirebaseError(error)}`);
    return;
  }
  elements.dialog.close();
  render();
  showToast(`${holding.name} 的持股資料已更新`);
}

function openHoldingDialog() {
  elements.holdingForm.reset();
  elements.holdingMarket.value = state.market === "US" ? "US" : "TW";
  elements.holdingFormError.textContent = "";
  syncHoldingCurrency();
  elements.holdingDialog.showModal();
  setTimeout(() => elements.holdingSymbol.focus(), 50);
}

function syncHoldingCurrency() {
  const isUsMarket = elements.holdingMarket.value === "US";
  const currency = isUsMarket ? "US$" : "NT$";
  document.querySelectorAll(".holding-currency").forEach(node => { node.textContent = currency; });
  elements.holdingName.required = !isUsMarket;
  elements.holdingName.placeholder = isUsMarket ? "可留空，首頁顯示股票代號" : "請輸入中文名稱，例如台積電";
  renderCalculatedAverage(elements.holdingShares, elements.holdingTotalCost, elements.holdingCalculatedAverage, elements.holdingMarket.value);
}

function renderCalculatedAverage(sharesInput, costInput, output, market) {
  const shares = Number(sharesInput.value);
  const totalCost = Number(costInput.value);
  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(totalCost) || totalCost < 0) {
    output.textContent = "—";
    return;
  }
  output.textContent = `${market === "US" ? "US$" : "NT$"}${number(totalCost / shares)}`;
}

function renderCashPreview() {
  const twd = Number(elements.cashTwd.value);
  const usd = Number(elements.cashUsd.value);
  const total = (Number.isFinite(twd) ? twd : 0) + (Number.isFinite(usd) ? usd : 0) * USD_TO_TWD;
  elements.cashTotalPreview.textContent = money(total);
}

function openCashDialog() {
  elements.cashTwd.value = state.cash.twd;
  elements.cashUsd.value = state.cash.usd;
  elements.cashFormError.textContent = "";
  renderCashPreview();
  elements.cashDialog.showModal();
  setTimeout(() => elements.cashTwd.focus(), 50);
}

async function saveCash(event) {
  event.preventDefault();
  const twd = Number(elements.cashTwd.value);
  const usd = Number(elements.cashUsd.value);
  if (![twd, usd].every(Number.isFinite) || twd < 0 || usd < 0) {
    elements.cashFormError.textContent = "請輸入大於或等於 0 的現金金額。";
    return;
  }

  const previousCash = { ...state.cash };
  state.cash = { twd, usd };
  renderSummary();
  try {
    await saveCashBalances(state.user.uid, state.cash);
    await checkAssetSnapshot(true);
  } catch (error) {
    state.cash = previousCash;
    renderSummary();
    elements.cashFormError.textContent = `儲存失敗：${friendlyFirebaseError(error)}`;
    return;
  }
  elements.cashDialog.close();
  showToast(`現金已更新為 ${money(cashTotalTwd())}`);
}

function openHistoryRecordDialog() {
  elements.historyRecordForm.reset();
  elements.historyRecordDate.value = new Date().toISOString().slice(0, 10);
  elements.historyRecordError.textContent = "";
  elements.historyRecordDialog.showModal();
  setTimeout(() => elements.historyRecordDate.focus(), 50);
}

async function saveHistoryRecord(event) {
  event.preventDefault();
  const localDate = elements.historyRecordDate.value;
  const totalAssetsTwd = Number(elements.historyRecordAssets.value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isFinite(totalAssetsTwd) || totalAssetsTwd < 0) {
    elements.historyRecordError.textContent = "請確認日期與總資產金額。";
    return;
  }
  try {
    await saveManualAssetRecord(state.user.uid, localDate, totalAssetsTwd);
  } catch (error) {
    elements.historyRecordError.textContent = `儲存失敗：${friendlyFirebaseError(error)}`;
    return;
  }
  elements.historyRecordDialog.close();
  showToast(`${localDate} 的總資產基準已儲存`);
}

async function addHolding(event) {
  event.preventDefault();
  const market = elements.holdingMarket.value;
  const symbol = elements.holdingSymbol.value.trim().toUpperCase();
  const name = elements.holdingName.value.trim() || symbol;
  const shares = Number(elements.holdingShares.value);
  const totalCost = Number(elements.holdingTotalCost.value);
  const price = Number(elements.holdingPrice.value);
  const averageCost = totalCost / shares;
  const newHolding = { market, symbol, name, shares, averageCost, price, previousClose: price };

  if (!symbol || (market === "TW" && !elements.holdingName.value.trim()) || ![shares, totalCost, price].every(Number.isFinite) || shares <= 0 || totalCost < 0 || price < 0) {
    elements.holdingFormError.textContent = "請確認代號、股數、持有成本與股價均已正確填寫。";
    return;
  }
  if (state.holdings.some(item => holdingKey(item) === holdingKey(newHolding))) {
    elements.holdingFormError.textContent = "這個市場已經有相同股票代號。";
    return;
  }

  const previousHoldings = state.holdings.map(item => ({ ...item }));
  state.holdings.push(newHolding);
  try {
    await saveHoldings();
    await checkAssetSnapshot(true);
  } catch (error) {
    state.holdings = previousHoldings;
    elements.holdingFormError.textContent = `儲存失敗：${friendlyFirebaseError(error)}`;
    return;
  }
  elements.holdingDialog.close();
  render();
  showToast(`${name} 已加入持股`);
}

async function deleteHolding() {
  const index = state.holdings.findIndex(item => holdingKey(item) === elements.symbol.value);
  if (index < 0) return;
  const holding = state.holdings[index];
  if (!window.confirm(`確定要刪除 ${holding.symbol} ${holding.name}？此操作不會保留交易紀錄。`)) return;
  state.holdings.splice(index, 1);
  try {
    await saveHoldings();
    await checkAssetSnapshot(true);
  } catch (error) {
    state.holdings.splice(index, 0, holding);
    showToast(`刪除失敗：${friendlyFirebaseError(error)}`);
    return;
  }
  elements.dialog.close();
  render();
  showToast(`${holding.name} 已刪除`);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function friendlyFirebaseError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied") || code.includes("PERMISSION_DENIED")) return "Firebase 權限不足，請檢查 Database Rules";
  if (code.includes("network-request-failed")) return "目前無法連接網路";
  if (code.includes("popup-blocked")) return "登入視窗被瀏覽器封鎖";
  if (code.includes("unauthorized-domain")) return "目前網址尚未加入 Firebase 授權網域";
  if (code.includes("operation-not-allowed")) return "Firebase 尚未啟用 Google 登入提供者";
  return error?.message || "未知錯誤";
}

async function checkAssetSnapshot(replaceExisting = false) {
  if (!state.user || !state.firebaseLoaded || !state.cashLoaded) return;
  if (state.snapshotCheckInFlight) {
    if (replaceExisting) state.snapshotReplacePending = true;
    return;
  }
  const slot = getCurrentSnapshotSlot(new Date(), state.serverTimeOffset);
  if (!slot) return;

  state.snapshotCheckInFlight = true;
  try {
    const snapshot = buildAssetSnapshot(state.holdings, USD_TO_TWD, slot, state.cash);
    if (replaceExisting) {
      await replaceSnapshot(state.user.uid, slot.id, snapshot);
    } else {
      const created = await createSnapshotIfMissing(state.user.uid, slot.id, snapshot);
      if (created) showToast(`已建立 ${slot.slot === "0630" ? "06:30" : "14:30"} 總資產快照`);
    }
  } catch (error) {
    showToast(`快照建立失敗：${friendlyFirebaseError(error)}`);
  } finally {
    state.snapshotCheckInFlight = false;
    if (state.snapshotReplacePending) {
      state.snapshotReplacePending = false;
      checkAssetSnapshot(true);
    }
  }
}

document.querySelectorAll("[data-market]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-market]").forEach(tab => tab.classList.remove("active"));
    button.classList.add("active");
    state.market = button.dataset.market;
    renderHoldings();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach(button => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.querySelector("#open-holding-dialog").addEventListener("click", openHoldingDialog);
document.querySelector("#open-cash-dialog").addEventListener("click", openCashDialog);
document.querySelector("#open-history-record-dialog").addEventListener("click", openHistoryRecordDialog);
document.querySelector("#open-transaction-dialog").addEventListener("click", openTransactionDialog);
document.querySelector("#open-annual-summary-dialog").addEventListener("click", () => openAnnualSummaryDialog());
document.querySelector("#delete-holding").addEventListener("click", deleteHolding);
elements.cashTwd.addEventListener("input", renderCashPreview);
elements.cashUsd.addEventListener("input", renderCashPreview);
elements.cashForm.addEventListener("submit", saveCash);
elements.historyRecordForm.addEventListener("submit", saveHistoryRecord);
elements.transactionMarket.addEventListener("change", syncTransactionForm);
elements.transactionForm.addEventListener("submit", addTransaction);
elements.annualSummaryForm.addEventListener("submit", addAnnualSummary);
elements.annualSummaryLabel.addEventListener("input", syncAnnualLinkForm);
elements.annualSummaryLinked.addEventListener("change", syncAnnualLinkForm);
elements.transactionYearFilter.addEventListener("change", () => {
  state.transactionYearFilter = elements.transactionYearFilter.value;
  renderTransactions();
});
elements.holdingMarket.addEventListener("change", syncHoldingCurrency);
elements.holdingShares.addEventListener("input", syncHoldingCurrency);
elements.holdingTotalCost.addEventListener("input", syncHoldingCurrency);
elements.holdingForm.addEventListener("submit", addHolding);
elements.symbol.addEventListener("change", syncPriceInput);
elements.updateShares.addEventListener("input", () => {
  const selected = state.holdings.find(item => holdingKey(item) === elements.symbol.value);
  if (selected) renderCalculatedAverage(elements.updateShares, elements.updateTotalCost, elements.updateCalculatedAverage, selected.market);
});
elements.updateTotalCost.addEventListener("input", () => {
  const selected = state.holdings.find(item => holdingKey(item) === elements.symbol.value);
  if (selected) renderCalculatedAverage(elements.updateShares, elements.updateTotalCost, elements.updateCalculatedAverage, selected.market);
});
elements.form.addEventListener("submit", savePrice);
elements.body.addEventListener("click", event => {
  const button = event.target.closest("[data-update-key]");
  if (button) openPriceDialog(button.dataset.updateKey);
});
document.querySelectorAll("[data-transaction-market]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-transaction-market]").forEach(tab => tab.classList.remove("active"));
    button.classList.add("active");
    state.transactionMarket = button.dataset.transactionMarket;
    state.transactionYearFilter = "ALL";
    renderTransactions();
  });
});
document.querySelector(".transactions-page").addEventListener("click", event => {
  const button = event.target.closest("[data-delete-transaction]");
  if (button) removeTransactionRecord(button.dataset.deleteTransaction);
});
document.querySelector(".annual-summary-page").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-annual-summary]");
  if (editButton) openAnnualSummaryDialog(editButton.dataset.editAnnualSummary);
  const annualButton = event.target.closest("[data-delete-annual-summary]");
  if (annualButton) removeAnnualSummaryRecord(annualButton.dataset.deleteAnnualSummary);
});
document.querySelectorAll("[data-history-range]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-history-range]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    state.historyRange = button.dataset.historyRange;
    renderHistoryChart();
  });
});
elements.historyDemoToggle.addEventListener("click", () => {
  state.historyDemo = !state.historyDemo;
  elements.historyDemoNotice.hidden = !state.historyDemo;
  elements.historyDemoToggle.textContent = state.historyDemo ? "返回真實資料" : "預覽範例資料";
  renderHistoryChart();
});
window.addEventListener("hashchange", () => {
  renderRoute();
  window.scrollTo({ top: 0, behavior: "auto" });
});
renderRoute();

document.querySelector("#google-sign-in").addEventListener("click", async () => {
  elements.authMessage.textContent = "正在開啟 Google 登入視窗…";
  try {
    await signInWithGoogle();
  } catch (error) {
    elements.authMessage.textContent = friendlyFirebaseError(error);
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  try {
    await signOutUser();
  } catch (error) {
    showToast(`登出失敗：${friendlyFirebaseError(error)}`);
  }
});

observeConnection(isConnected => {
  elements.firebaseStatus.textContent = isConnected ? "Firebase 已連線" : "Firebase 離線";
  elements.firebaseStatusDot.classList.toggle("offline", !isConnected);
});

observeServerTimeOffset(offset => {
  state.serverTimeOffset = offset;
});

observeAuthentication(user => {
  state.unsubscribeHoldings?.();
  state.unsubscribeCash?.();
  state.unsubscribeSnapshots?.();
  state.unsubscribeTransactions?.();
  state.unsubscribeAnnualSummaries?.();
  state.unsubscribeHoldings = null;
  state.unsubscribeCash = null;
  state.unsubscribeSnapshots = null;
  state.unsubscribeTransactions = null;
  state.unsubscribeAnnualSummaries = null;
  state.user = user;
  state.firebaseLoaded = false;
  state.cashLoaded = false;

  if (!user) {
    state.holdings = [];
    state.cash = { twd: 0, usd: 0 };
    state.snapshots = [];
    state.transactions = [];
    state.annualSummaries = [];
    renderHistoryChart();
    renderTransactions();
    renderAnnualSummaries();
    elements.appShell.hidden = true;
    elements.authScreen.hidden = false;
    elements.authMessage.textContent = "請使用已啟用的 Google 帳號登入";
    return;
  }

  elements.authScreen.hidden = true;
  elements.appShell.hidden = false;
  elements.signedInEmail.textContent = user.email || "已登入";
  state.unsubscribeCash = observeCashBalances(user.uid, cash => {
    state.cash = cash;
    state.cashLoaded = true;
    renderSummary();
    checkAssetSnapshot();
  }, error => {
    state.cash = { twd: 0, usd: 0 };
    state.cashLoaded = true;
    renderSummary();
    showToast(`現金讀取失敗：${friendlyFirebaseError(error)}`);
  });
  state.unsubscribeSnapshots = observeSnapshots(user.uid, records => {
    state.snapshots = normalizeSnapshots(records);
    renderHistoryChart();
  }, error => {
    state.snapshots = [];
    renderHistoryChart();
    showToast(`歷史資料讀取失敗：${friendlyFirebaseError(error)}`);
  });
  state.unsubscribeTransactions = observeTransactions(user.uid, records => {
    state.transactions = normalizeTransactions(records);
    renderTransactions();
    renderAnnualSummaries();
  }, error => {
    state.transactions = [];
    renderTransactions();
    renderAnnualSummaries();
    showToast(`交易紀錄讀取失敗：${friendlyFirebaseError(error)}`);
  });
  state.unsubscribeAnnualSummaries = observeAnnualSummaries(user.uid, records => {
    state.annualSummaries = normalizeAnnualSummaries(records);
    renderAnnualSummaries();
  }, error => {
    state.annualSummaries = [];
    renderAnnualSummaries();
    showToast(`年度總記錄讀取失敗：${friendlyFirebaseError(error)}`);
  });
  state.unsubscribeHoldings = observeHoldings(user.uid, async holdings => {
    if (!state.firebaseLoaded) {
      state.firebaseLoaded = true;
      const localHoldings = loadLocalHoldings();
      const migrationDismissed = localStorage.getItem(`${STORAGE_KEY}-migration-dismissed`) === "true";
      if (holdings.length === 0 && localHoldings.length > 0 && !migrationDismissed) {
        const shouldMigrate = window.confirm(`發現瀏覽器中有 ${localHoldings.length} 檔持股，是否搬移到 Firebase？`);
        if (shouldMigrate) {
          state.holdings = sortHoldings(localHoldings);
          try {
            await saveHoldings();
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(`${STORAGE_KEY}-updated-at`);
            showToast("本機持股已搬移到 Firebase");
            return;
          } catch (error) {
            showToast(`搬移失敗：${friendlyFirebaseError(error)}`);
          }
        } else {
          localStorage.setItem(`${STORAGE_KEY}-migration-dismissed`, "true");
        }
      }
    }
    state.holdings = sortHoldings(holdings);
    render();
    checkAssetSnapshot();
  }, error => {
    state.holdings = [];
    render();
    showToast(`讀取失敗：${friendlyFirebaseError(error)}`);
  });
});

setInterval(checkAssetSnapshot, 5 * 60 * 1000);
window.addEventListener("focus", () => checkAssetSnapshot());
window.addEventListener("online", () => checkAssetSnapshot());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkAssetSnapshot();
});
