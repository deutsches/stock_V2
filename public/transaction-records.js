export function normalizeTransactions(records) {
  if (!records || typeof records !== "object") return [];

  return Object.entries(records)
    .map(([id, record]) => ({
      id,
      market: record?.market,
      soldDate: record?.soldDate,
      symbol: String(record?.symbol || "").trim().toUpperCase(),
      name: String(record?.name || "").trim(),
      cost: Number(record?.cost),
      proceeds: Number(record?.proceeds),
      sellPrice: Number(record?.sellPrice),
      createdAt: Number(record?.createdAt) || null
    }))
    .filter(record =>
      ["TW", "US"].includes(record.market) &&
      /^\d{4}-\d{2}-\d{2}$/.test(record.soldDate) &&
      record.symbol &&
      Number.isFinite(record.cost) && record.cost >= 0 &&
      Number.isFinite(record.proceeds) && record.proceeds >= 0 &&
      Number.isFinite(record.sellPrice) && record.sellPrice >= 0
    )
    .sort((a, b) => b.soldDate.localeCompare(a.soldDate) || (b.createdAt || 0) - (a.createdAt || 0));
}

export function transactionMetrics(record, exchangeRate = 30.33) {
  const profit = record.proceeds - record.cost;
  return {
    profit,
    profitRate: record.cost ? (profit / record.cost) * 100 : 0,
    profitTwd: record.market === "US" ? profit * exchangeRate : profit
  };
}

export function summarizeTransactions(records, exchangeRate = 30.33) {
  const summary = records.reduce((result, record) => {
    const metrics = transactionMetrics(record, exchangeRate);
    result.cost += record.cost;
    result.proceeds += record.proceeds;
    result.profit += metrics.profit;
    result.profitTwd += metrics.profitTwd;
    return result;
  }, { cost: 0, proceeds: 0, profit: 0, profitTwd: 0 });
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, Number(value.toFixed(4))]));
}

export function filterTransactions(records, market, year = null) {
  return records.filter(record =>
    record.market === market &&
    (year === null || Number(record.soldDate.slice(0, 4)) === Number(year))
  );
}
