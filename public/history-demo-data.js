const DAY_MS = 24 * 60 * 60 * 1000;

export function createHistoryDemoSnapshots() {
  const snapshots = [];
  const start = Date.UTC(2026, 6, 19);
  let previousValue = 0;

  for (let day = 0; day < 30; day += 1) {
    const slot = "1430";
    const date = new Date(start + day * DAY_MS);
    const localDate = date.toISOString().slice(0, 10);
    const exchangeRate = 30.33 + Math.sin(day / 5) * 0.28;
    const contribution = day >= 16 ? 60000 : 0;
    const costTwd = 1010000 + day * 2800 + contribution;
    const movement = day * 4100 + Math.sin(day * 0.72) * 26000 - (day > 20 && day < 25 ? 32000 : 0);
    const marketValueTwd = costTwd + 78000 + movement;
    const cashTwd = 180000 - day * 1800 + (day >= 16 ? 60000 : 0);
    const totalAssetsTwd = marketValueTwd + cashTwd;
    const dailyChangeTwd = previousValue ? totalAssetsTwd - previousValue : 0;
    const twMarketValue = marketValueTwd * (0.58 + Math.sin(day / 6) * 0.025);
    const usMarketValueTwd = marketValueTwd - twMarketValue;

    snapshots.push({
      id: `demo-${localDate}-${slot}`,
      localDate,
      slot,
      timestamp: Date.parse(`${localDate}T14:30:00+08:00`),
      marketValueTwd,
      totalAssetsTwd,
      cashTwd,
      costTwd,
      unrealizedProfitTwd: marketValueTwd - costTwd,
      dailyChangeTwd,
      holdingCount: 8,
      exchangeRate,
      twMarketValueTwd: twMarketValue,
      usMarketValueTwd
    });
    previousValue = totalAssetsTwd;
  }
  return snapshots;
}
