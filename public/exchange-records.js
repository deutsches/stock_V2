export const USD_TO_TWD = "USD_TO_TWD";
export const TWD_TO_USD = "TWD_TO_USD";

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordDirection(record) {
  return record?.direction === TWD_TO_USD ? TWD_TO_USD : USD_TO_TWD;
}

function recordTwdAmount(record) {
  return finiteNumber(record?.twdAmount ?? record?.twdReceived);
}

export function applyExchangeCashDelta(cash, usdDelta, twdDelta) {
  const usd = finiteNumber(cash?.usd) + finiteNumber(usdDelta);
  const twd = finiteNumber(cash?.twd) + finiteNumber(twdDelta);
  if (usd < -0.000001) return { error: "美元現金不足，請先確認首頁的美元現金餘額。" };
  if (twd < -0.5) return { error: "台幣現金不足，請先確認首頁的台幣現金餘額。" };
  return { usd: Math.max(0, usd), twd: Math.max(0, twd) };
}

export function exchangeCashMovement(record) {
  const direction = recordDirection(record);
  const usdAmount = finiteNumber(record?.usdAmount);
  const twdAmount = recordTwdAmount(record);
  return direction === TWD_TO_USD
    ? { usdDelta: usdAmount, twdDelta: -twdAmount }
    : { usdDelta: -usdAmount, twdDelta: twdAmount };
}

export function exchangeRecordMetrics(record) {
  const direction = recordDirection(record);
  const usdAmount = finiteNumber(record?.usdAmount);
  const costRate = finiteNumber(record?.costRate);
  const executionRate = finiteNumber(record?.executionRate);
  const twdAmount = recordTwdAmount(record);
  const feeTwd = finiteNumber(record?.feeTwd);
  const costTwd = direction === USD_TO_TWD ? usdAmount * costRate : twdAmount;
  const quotedTwd = usdAmount * executionRate;
  const realizedProfitTwd = direction === USD_TO_TWD ? twdAmount - costTwd : 0;
  const realizedReturnRate = direction === USD_TO_TWD && costTwd
    ? (realizedProfitTwd / costTwd) * 100
    : 0;
  const effectiveRate = usdAmount ? twdAmount / usdAmount : 0;

  return {
    direction,
    usdAmount,
    costRate,
    executionRate,
    twdAmount,
    feeTwd,
    costTwd,
    quotedTwd,
    effectiveRate,
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
      && record.executionRate > 0
      && record.twdAmount > 0
      && record.feeTwd >= 0
      && (record.direction === TWD_TO_USD || record.costRate > 0))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function filterExchangeRecords(records, year = "ALL") {
  return year === "ALL" ? records : records.filter(record => record.date.startsWith(`${year}-`));
}

export function summarizeExchangeRecords(records, year = "ALL") {
  return filterExchangeRecords(records, year).reduce((summary, record) => {
    if (record.direction === TWD_TO_USD) {
      summary.boughtUsd += record.usdAmount;
      summary.spentTwd += record.twdAmount;
    } else {
      summary.soldUsd += record.usdAmount;
      summary.receivedTwd += record.twdAmount;
      summary.costTwd += record.costTwd;
      summary.realizedProfitTwd += record.realizedProfitTwd;
    }
    summary.feeTwd += record.feeTwd;
    summary.realizedReturnRate = summary.costTwd
      ? (summary.realizedProfitTwd / summary.costTwd) * 100
      : 0;
    return summary;
  }, {
    soldUsd: 0,
    receivedTwd: 0,
    boughtUsd: 0,
    spentTwd: 0,
    feeTwd: 0,
    costTwd: 0,
    realizedProfitTwd: 0,
    realizedReturnRate: 0
  });
}
