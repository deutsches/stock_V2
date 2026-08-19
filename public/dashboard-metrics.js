export function calculateDashboardMetrics(holdings = [], cash = { twd: 0, usd: 0 }, usdToTwd = 1) {
  const totals = holdings.reduce((result, item) => {
    const rate = item.market === "US" ? usdToTwd : 1;
    const marketValue = item.shares * item.price * rate;
    const cost = item.shares * item.averageCost * rate;
    const previous = item.shares * item.previousClose * rate;
    result.value += marketValue;
    result.cost += cost;
    result.previous += previous;
    result[item.market] += marketValue;
    result.daily[item.market] += marketValue - previous;
    return result;
  }, { value: 0, cost: 0, previous: 0, TW: 0, US: 0, daily: { TW: 0, US: 0 } });

  totals.cash = Number(cash.twd || 0) + Number(cash.usd || 0) * usdToTwd;
  totals.assets = totals.value + totals.cash;
  totals.profit = totals.value - totals.cost;
  totals.profitRate = totals.cost ? (totals.profit / totals.cost) * 100 : 0;
  totals.change = totals.value - totals.previous;
  totals.changeRate = totals.previous ? (totals.change / totals.previous) * 100 : 0;
  return totals;
}
