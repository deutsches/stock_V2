function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function applyExchangeCashDelta(cash, usdDelta, twdDelta) {
  const usd = finiteNumber(cash?.usd) + finiteNumber(usdDelta);
  const twd = finiteNumber(cash?.twd) + finiteNumber(twdDelta);
  if (usd < -0.000001) return { error: "美元現金不足，請先確認首頁的美元現金餘額。" };
  if (twd < -0.5) return { error: "台幣現金不足，無法還原這筆換匯記錄。" };
  return { usd: Math.max(0, usd), twd: Math.max(0, twd) };
}

export function exchangeRecordMetrics(record) {
  const usdAmount = finiteNumber(record.usdAmount);
  const costRate = finiteNumber(record.costRate);
  const executionRate = finiteNumber(record.executionRate);
  const twdReceived = finiteNumber(record.twdReceived);
  const feeTwd = finiteNumber(record.feeTwd);
  const costTwd = usdAmount * costRate;
  const quotedTwd = usdAmount * executionRate;
  const realizedProfitTwd = twdReceived - costTwd;
  const realizedReturnRate = costTwd ? (realizedProfitTwd / costTwd) * 100 : 0;

  return {
    usdAmount,
    costRate,
    executionRate,
    twdReceived,
    feeTwd,
    costTwd,
    quotedTwd,
    realizedProfitTwd,
    realizedReturnRate
  };
}

export function normalizeExchangeRecords(records) {
  if (!records || typeof records !== "object") return [];
  return Object.entries(records)
    .map(([id, record]) => {
      const metrics = exchangeRecordMetrics(record || {});
      return {
        id,
        date: String(record?.date || ""),
        note: String(record?.note || "").trim(),
        cashApplied: record?.cashApplied === true,
        createdAt: finiteNumber(record?.createdAt),
        ...metrics
      };
    })
    .filter(record => /^\d{4}-\d{2}-\d{2}$/.test(record.date)
      && record.usdAmount > 0
      && record.costRate > 0
      && record.executionRate > 0
      && record.twdReceived >= 0
      && record.feeTwd >= 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function filterExchangeRecords(records, year = "ALL") {
  return year === "ALL" ? records : records.filter(record => record.date.startsWith(`${year}-`));
}

export function summarizeExchangeRecords(records, year = "ALL") {
  return filterExchangeRecords(records, year).reduce((summary, record) => {
    summary.usdAmount += record.usdAmount;
    summary.twdReceived += record.twdReceived;
    summary.feeTwd += record.feeTwd;
    summary.costTwd += record.costTwd;
    summary.realizedProfitTwd += record.realizedProfitTwd;
    summary.realizedReturnRate = summary.costTwd
      ? (summary.realizedProfitTwd / summary.costTwd) * 100
      : 0;
    return summary;
  }, {
    usdAmount: 0,
    twdReceived: 0,
    feeTwd: 0,
    costTwd: 0,
    realizedProfitTwd: 0,
    realizedReturnRate: 0
  });
}
