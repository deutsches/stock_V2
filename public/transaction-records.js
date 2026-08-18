export function normalizeTransactions(records) {
  if (!records || typeof records !== "object") return [];

  return Object.entries(records)
    .map(([id, record]) => {
      const metrics = transactionMetrics(record);
      return {
        id,
        market: record?.market,
        year: Number(record?.year || String(record?.soldDate || "").slice(0, 4)),
        symbol: String(record?.symbol || "").trim().toUpperCase(),
        name: String(record?.name || "").trim(),
        sellPrice: record?.sellPrice === null || record?.sellPrice === undefined || record?.sellPrice === "" ? null : Number(record.sellPrice),
        profit: metrics.profit,
        profitRate: metrics.profitRate,
        costBasis: metrics.costBasis,
        createdAt: Number(record?.createdAt) || null
      };
    })
    .filter(record =>
      ["TW", "US"].includes(record.market) &&
      Number.isInteger(record.year) && record.year >= 1900 && record.year <= 2200 &&
      record.symbol &&
      Number.isFinite(record.profit) &&
      Number.isFinite(record.profitRate) &&
      (record.sellPrice === null || (Number.isFinite(record.sellPrice) && record.sellPrice >= 0))
    )
    .sort((a, b) => b.year - a.year || (b.createdAt || 0) - (a.createdAt || 0));
}

export function transactionMetrics(record, exchangeRate = 30.33) {
  const cost = record?.cost === null || record?.cost === undefined || record?.cost === "" ? NaN : Number(record.cost);
  const proceeds = record?.proceeds === null || record?.proceeds === undefined || record?.proceeds === "" ? NaN : Number(record.proceeds);
  const enteredProfit = record?.profit === null || record?.profit === undefined || record?.profit === "" ? NaN : Number(record.profit);
  const enteredRate = record?.profitRate === null || record?.profitRate === undefined || record?.profitRate === "" ? NaN : Number(record.profitRate);
  const profit = Number.isFinite(enteredProfit) ? enteredProfit : proceeds - cost;
  const profitRate = Number.isFinite(enteredRate) ? enteredRate : (cost > 0 ? (profit / cost) * 100 : 0);
  const inferredCost = profitRate !== 0 ? profit / (profitRate / 100) : 0;
  const costBasis = Number.isFinite(cost) && cost >= 0 ? cost : (Number.isFinite(inferredCost) && inferredCost > 0 ? inferredCost : 0);
  return {
    profit,
    profitRate,
    costBasis,
    profitTwd: record.market === "US" ? profit * exchangeRate : profit
  };
}

export function summarizeTransactions(records, exchangeRate = 30.33) {
  const summary = records.reduce((result, record) => {
    const metrics = transactionMetrics(record, exchangeRate);
    result.costBasis += metrics.costBasis;
    result.profit += metrics.profit;
    result.profitTwd += metrics.profitTwd;
    return result;
  }, { costBasis: 0, profit: 0, profitTwd: 0 });
  summary.profitRate = summary.costBasis ? (summary.profit / summary.costBasis) * 100 : 0;
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, Number(value.toFixed(4))]));
}

export function filterTransactions(records, market, year = null) {
  return records.filter(record =>
    record.market === market &&
    (year === null || record.year === Number(year))
  );
}
