const STORAGE_KEY = "stockv2-portfolio-v1";
const USD_TO_TWD = 30.33;

const sampleHoldings = [
  { symbol: "2330", name: "台積電", market: "TW", shares: 120, averageCost: 980, price: 1125, previousClose: 1110 },
  { symbol: "0050", name: "元大台灣50", market: "TW", shares: 600, averageCost: 178.4, price: 193.2, previousClose: 191.9 },
  { symbol: "2454", name: "聯發科", market: "TW", shares: 80, averageCost: 1288, price: 1245, previousClose: 1260 },
  { symbol: "AAPL", name: "Apple", market: "US", shares: 18, averageCost: 201.35, price: 228.72, previousClose: 226.34 },
  { symbol: "NVDA", name: "NVIDIA", market: "US", shares: 32, averageCost: 154.9, price: 181.45, previousClose: 179.84 }
];

const state = {
  market: "ALL",
  holdings: loadHoldings(),
  updatedAt: localStorage.getItem(`${STORAGE_KEY}-updated-at`)
};

const elements = {
  body: document.querySelector("#holdings-body"),
  count: document.querySelector("#holding-count"),
  empty: document.querySelector("#empty-state"),
  dialog: document.querySelector("#price-dialog"),
  form: document.querySelector("#price-form"),
  symbol: document.querySelector("#price-symbol"),
  price: document.querySelector("#new-price"),
  currency: document.querySelector("#price-currency"),
  toast: document.querySelector("#toast")
};

function loadHoldings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) && stored.length ? stored : structuredClone(sampleHoldings);
  } catch {
    return structuredClone(sampleHoldings);
  }
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
    return `
      <tr>
        <td><strong class="stock-symbol">${item.symbol}</strong></td>
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
        <td class="action-column"><button class="row-action" data-update-symbol="${item.symbol}" aria-label="更新 ${item.name} 價格" title="更新價格">⋯</button></td>
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

function openPriceDialog(symbol = state.holdings[0]?.symbol) {
  elements.symbol.innerHTML = state.holdings.map(item => `<option value="${item.symbol}">${item.symbol} · ${item.name}</option>`).join("");
  elements.symbol.value = symbol;
  syncPriceInput();
  elements.dialog.showModal();
  setTimeout(() => elements.price.focus(), 50);
}

function syncPriceInput() {
  const selected = state.holdings.find(item => item.symbol === elements.symbol.value);
  if (!selected) return;
  elements.currency.textContent = selected.market === "US" ? "US$" : "NT$";
  elements.price.value = selected.price;
  elements.price.step = selected.market === "US" ? "0.01" : "0.1";
}

function savePrice(event) {
  event.preventDefault();
  const holding = state.holdings.find(item => item.symbol === elements.symbol.value);
  const newPrice = Number(elements.price.value);
  if (!holding || !Number.isFinite(newPrice) || newPrice <= 0) return;

  holding.price = newPrice;
  state.updatedAt = new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.holdings));
  localStorage.setItem(`${STORAGE_KEY}-updated-at`, state.updatedAt);
  elements.dialog.close();
  render();
  showToast(`${holding.name} 已更新為 ${money(newPrice, holding.market)}`);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("visible"), 2400);
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
  button.addEventListener("click", () => elements.dialog.close());
});
elements.symbol.addEventListener("change", syncPriceInput);
elements.form.addEventListener("submit", savePrice);
elements.body.addEventListener("click", event => {
  const button = event.target.closest("[data-update-symbol]");
  if (button) openPriceDialog(button.dataset.updateSymbol);
});
render();
