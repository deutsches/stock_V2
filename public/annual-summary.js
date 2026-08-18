import { filterTransactions, summarizeTransactions } from "./transaction-records.js";

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeAnnualSummaries(records) {
  if (!records || typeof records !== "object") return [];
  return Object.entries(records)
    .map(([id, record]) => ({
      id,
      label: String(record?.label || "").trim(),
      twProfit: finiteNumber(record?.twProfit),
      dividend: finiteNumber(record?.dividend),
      twReturnRate: optionalNumber(record?.twReturnRate),
      usProfitUsd: finiteNumber(record?.usProfitUsd),
      usReturnRate: optionalNumber(record?.usReturnRate),
      usProfitTwd: finiteNumber(record?.usProfitTwd),
      linkedToTransactions: record?.linkedToTransactions === true,
      order: finiteNumber(record?.order, Number.MAX_SAFE_INTEGER),
      createdAt: finiteNumber(record?.createdAt)
    }))
    .filter(record => record.label)
    .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt || a.label.localeCompare(b.label));
}

export function canLinkAnnualSummary(record) {
  return /^\d{4}$/.test(String(record?.label || "").trim());
}

export function resolveAnnualSummary(record, transactions, exchangeRate = 30.33) {
  if (!record?.linkedToTransactions || !canLinkAnnualSummary(record)) return record;
  const year = Number(record.label);
  const twSummary = summarizeTransactions(filterTransactions(transactions, "TW", year), exchangeRate);
  const usSummary = summarizeTransactions(filterTransactions(transactions, "US", year), exchangeRate);
  return {
    ...record,
    twProfit: twSummary.profit,
    twReturnRate: twSummary.profitRate,
    usProfitUsd: usSummary.profit,
    usReturnRate: usSummary.profitRate,
    usProfitTwd: usSummary.profitTwd
  };
}

export function resolveAnnualSummaries(records, transactions, exchangeRate = 30.33) {
  return records.map(record => resolveAnnualSummary(record, transactions, exchangeRate));
}

export function annualSummaryTotal(record) {
  return finiteNumber(record?.twProfit) + finiteNumber(record?.dividend) + finiteNumber(record?.usProfitTwd);
}

export function summarizeAnnualRecords(records) {
  return records.reduce((summary, record) => {
    summary.twProfit += finiteNumber(record.twProfit);
    summary.dividend += finiteNumber(record.dividend);
    summary.usProfitUsd += finiteNumber(record.usProfitUsd);
    summary.usProfitTwd += finiteNumber(record.usProfitTwd);
    summary.totalProfitTwd += annualSummaryTotal(record);
    return summary;
  }, { twProfit: 0, dividend: 0, usProfitUsd: 0, usProfitTwd: 0, totalProfitTwd: 0 });
}
