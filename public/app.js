import {
  createSnapshotIfMissing,
  observeAuthentication,
  observeConnection,
  observeHoldings,
  observeSnapshots,
  observeServerTimeOffset,
  replaceHoldings,
  signInWithGoogle,
  signOutUser
} from "./firebase-service.js";
import { buildAssetSnapshot, getCurrentSnapshotSlot } from "./snapshot-scheduler.js";
import { buildHistoryChartModel, calculateHistoryStats, filterSnapshotsByRange, normalizeSnapshots } from "./history-chart.js";
import { createHistoryDemoSnapshots } from "./history-demo-data.js";
import { routeFromHash, titleForRoute } from "./router.js";

const STORAGE_KEY = "stockv2-portfolio-v1";
const USD_TO_TWD = 30.33;

const state = {
  market: "ALL",
  holdings: [],
  user: null,
  unsubscribeHoldings: null,
  unsubscribeSnapshots: null,
  snapshots: [],
  historyRange: "7",
  historyDemo: false,
  firebaseLoaded: false,
  serverTimeOffset: 0,
  snapshotCheckInFlight: false
};

const elements = {
  body: document.querySelector("#holdings-body"),
  count: document.querySelector("#holding-count"),
  empty: document.querySelector("#empty-state"),
  dialog: document.querySelector("#price-dialog"),
  form: document.querySelector("#price-form"),
  symbol: document.querySelector("#price-symbol"),
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
  historyChart: document.querySelector("#history-chart"),
  historyChartWrap: document.querySelector("#history-chart-wrap"),
  historyEmpty: document.querySelector("#history-empty"),
  historySummary: document.querySelector("#history-summary"),
  historyDemoToggle: document.querySelector("#history-demo-toggle"),
  historyDemoNotice: document.querySelector("#history-demo-notice"),
  historyRecordsBody: document.querySelector("#history-records-body"),
  historyRecordCount: document.querySelector("#history-record-count"),
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
  return replaceHoldings(state.user.uid, state.holdings);
}

function inTwd(value, market) {
  return market === "US" ? value * USD_TO_TWD : value;
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
  return state.holdings.reduce((result, item) => {
    const marketValue = inTwd(item.shares * item.price, item.market);
    const cost = inTwd(item.shares * item.averageCost, item.market);
    const previous = inTwd(item.shares * item.previousClose, item.market);
    result.value += marketValue;
    result.cost += cost;
    result.previous += previous;
    result[item.market] += marketValue;
    return result;
  }, { value: 0, cost: 0, previous: 0, TW: 0, US: 0 });
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
  const twPercent = total.value ? (total.TW / total.value) * 100 : 0;
  const usPercent = 100 - twPercent;

  document.querySelector("#total-assets").textContent = money(total.value);
  document.querySelector("#total-cost").textContent = money(total.cost);
  setSignedMetric("#unrealized-profit", profit, "TW");
  document.querySelector("#unrealized-rate").textContent = `報酬率 ${percent(profitRate)}`;
  setSignedMetric("#daily-change", change, "TW");
  document.querySelector("#daily-rate").textContent = `較前一個收盤價 ${percent(changeRate)}`;
  document.querySelector("#total-change").className = `metric-change ${change >= 0 ? "positive" : "negative"}`;
  document.querySelector("#total-change").textContent = `今日 ${money(change, "TW", true)}（${percent(changeRate)}）`;
  document.querySelector("#tw-allocation").style.width = `${twPercent}%`;
  document.querySelector("#us-allocation").style.width = `${usPercent}%`;
  document.querySelector("#tw-percent").textContent = `${twPercent.toFixed(0)}%`;
  document.querySelector("#us-percent").textContent = `${usPercent.toFixed(0)}%`;
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
  document.querySelector("#history-latest").textContent = money(stats.latest.marketValueTwd);
  document.querySelector("#history-latest-date").textContent = snapshotLabel(stats.latest);
  const changeNode = document.querySelector("#history-period-change");
  changeNode.textContent = money(stats.change, "TW", true);
  changeNode.className = stats.change >= 0 ? "positive" : "negative";
  document.querySelector("#history-period-rate").textContent = percent(stats.changeRate);
  document.querySelector("#history-highest").textContent = money(stats.highest.marketValueTwd);
  document.querySelector("#history-highest-date").textContent = snapshotLabel(stats.highest);
  document.querySelector("#history-drawdown").textContent = money(-stats.maxDrawdown, "TW", true);
  document.querySelector("#history-drawdown-rate").textContent = `−${stats.maxDrawdownRate.toFixed(2)}%`;
}

function renderHistoryRecords(snapshots) {
  elements.historyRecordCount.textContent = `${snapshots.length} 筆紀錄`;
  elements.historyRecordsBody.innerHTML = snapshots.slice().reverse().map((snapshot, index, reversed) => {
    const previous = reversed[index + 1];
    const change = previous ? snapshot.marketValueTwd - previous.marketValueTwd : 0;
    const profit = Number.isFinite(snapshot.unrealizedProfitTwd) ? snapshot.unrealizedProfitTwd : snapshot.marketValueTwd - snapshot.costTwd;
    return `<tr>
      <td>${snapshotLabel(snapshot)}</td>
      <td>${money(snapshot.marketValueTwd)}</td>
      <td>${money(snapshot.costTwd)}</td>
      <td class="${profit >= 0 ? "positive" : "negative"}">${money(profit, "TW", true)}</td>
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
  const change = latest.marketValueTwd - first.marketValueTwd;
  const changeRate = first.marketValueTwd ? (change / first.marketValueTwd) * 100 : 0;
  elements.historySummary.innerHTML = `最新 ${money(latest.marketValueTwd)} <span class="${change >= 0 ? "positive" : "negative"}">${money(change, "TW", true)}（${percent(changeRate)}）</span> · ${snapshots.length} 筆快照`;

  const grid = model.yTicks.map(tick => `
    <line class="chart-grid-line" x1="${model.bounds.left}" y1="${tick.y}" x2="${model.width - model.bounds.right}" y2="${tick.y}"></line>
    <text class="chart-axis-label chart-y-label" x="${model.bounds.left - 14}" y="${tick.y + 4}">${shortMoney(tick.value)}</text>
  `).join("");
  const labels = model.xLabels.map(point => `
    <text class="chart-axis-label" x="${point.x}" y="${model.height - 13}" text-anchor="middle">${snapshotLabel(point)}</text>
  `).join("");
  const points = model.points.map(point => `
    <circle class="chart-point" cx="${point.x}" cy="${point.valueY}" r="4" tabindex="0">
      <title>${snapshotLabel(point)}｜總資產 ${money(point.marketValueTwd)}｜成本 ${money(point.costTwd)}</title>
    </circle>
  `).join("");

  elements.historyChart.innerHTML = `
    <title id="history-chart-title">資產歷史曲線圖</title>
    <desc id="history-chart-description">${snapshotLabel(first)} 到 ${snapshotLabel(latest)}，共 ${snapshots.length} 筆資產快照</desc>
    ${grid}
    ${labels}
    <path class="chart-line chart-cost-line" d="${model.costPath}"></path>
    <path class="chart-line chart-value-line" d="${model.valuePath}"></path>
    ${points}
  `;
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
  elements.updateShares.value = selected.shares;
  elements.updateTotalCost.value = selected.shares * selected.averageCost;
  elements.price.value = selected.price;
  elements.price.step = selected.market === "US" ? "0.01" : "0.1";
  renderCalculatedAverage(elements.updateShares, elements.updateTotalCost, elements.updateCalculatedAverage, selected.market);
}

async function savePrice(event) {
  event.preventDefault();
  const holding = state.holdings.find(item => holdingKey(item) === elements.symbol.value);
  const newShares = Number(elements.updateShares.value);
  const newTotalCost = Number(elements.updateTotalCost.value);
  const newPrice = Number(elements.price.value);
  if (!holding || !Number.isFinite(newShares) || newShares <= 0 || !Number.isFinite(newTotalCost) || newTotalCost < 0 || !Number.isFinite(newPrice) || newPrice <= 0) return;

  const previousHolding = { ...holding };
  holding.shares = newShares;
  holding.averageCost = newTotalCost / newShares;
  if (newPrice !== holding.price) holding.previousClose = holding.price;
  holding.price = newPrice;
  try {
    await saveHoldings();
  } catch (error) {
    Object.assign(holding, previousHolding);
    showToast(`儲存失敗：${friendlyFirebaseError(error)}`);
    return;
  }
  elements.dialog.close();
  render();
  showToast(`${holding.name} 的股數與價格已更新`);
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

  state.holdings.push(newHolding);
  try {
    await saveHoldings();
  } catch (error) {
    state.holdings.pop();
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

async function checkAssetSnapshot() {
  if (!state.user || !state.firebaseLoaded || state.holdings.length === 0 || state.snapshotCheckInFlight) return;
  const slot = getCurrentSnapshotSlot(new Date(), state.serverTimeOffset);
  if (!slot) return;

  state.snapshotCheckInFlight = true;
  try {
    const snapshot = buildAssetSnapshot(state.holdings, USD_TO_TWD, slot);
    const created = await createSnapshotIfMissing(state.user.uid, slot.id, snapshot);
    if (created) showToast("已建立 14:30 每日資產快照");
  } catch (error) {
    showToast(`快照建立失敗：${friendlyFirebaseError(error)}`);
  } finally {
    state.snapshotCheckInFlight = false;
  }
}

document.querySelectorAll(".market-tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".market-tab").forEach(tab => tab.classList.remove("active"));
    button.classList.add("active");
    state.market = button.dataset.market;
    renderHoldings();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach(button => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.querySelector("#open-holding-dialog").addEventListener("click", openHoldingDialog);
document.querySelector("#delete-holding").addEventListener("click", deleteHolding);
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
  state.unsubscribeSnapshots?.();
  state.unsubscribeHoldings = null;
  state.unsubscribeSnapshots = null;
  state.user = user;
  state.firebaseLoaded = false;

  if (!user) {
    state.holdings = [];
    state.snapshots = [];
    renderHistoryChart();
    elements.appShell.hidden = true;
    elements.authScreen.hidden = false;
    elements.authMessage.textContent = "請使用已啟用的 Google 帳號登入";
    return;
  }

  elements.authScreen.hidden = true;
  elements.appShell.hidden = false;
  elements.signedInEmail.textContent = user.email || "已登入";
  state.unsubscribeSnapshots = observeSnapshots(user.uid, records => {
    state.snapshots = normalizeSnapshots(records);
    renderHistoryChart();
  }, error => {
    state.snapshots = [];
    renderHistoryChart();
    showToast(`歷史資料讀取失敗：${friendlyFirebaseError(error)}`);
  });
  state.unsubscribeHoldings = observeHoldings(user.uid, async holdings => {
    if (!state.firebaseLoaded) {
      state.firebaseLoaded = true;
      const localHoldings = loadLocalHoldings();
      const migrationDismissed = localStorage.getItem(`${STORAGE_KEY}-migration-dismissed`) === "true";
      if (holdings.length === 0 && localHoldings.length > 0 && !migrationDismissed) {
        const shouldMigrate = window.confirm(`發現瀏覽器中有 ${localHoldings.length} 檔持股，是否搬移到 Firebase？`);
        if (shouldMigrate) {
          state.holdings = localHoldings;
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
    state.holdings = holdings;
    render();
    checkAssetSnapshot();
  }, error => {
    state.holdings = [];
    render();
    showToast(`讀取失敗：${friendlyFirebaseError(error)}`);
  });
});

setInterval(checkAssetSnapshot, 5 * 60 * 1000);
window.addEventListener("focus", checkAssetSnapshot);
window.addEventListener("online", checkAssetSnapshot);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkAssetSnapshot();
});
