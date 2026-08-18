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
      order: finiteNumber(record?.order, Number.MAX_SAFE_INTEGER),
      createdAt: finiteNumber(record?.createdAt)
    }))
    .filter(record => record.label)
    .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt || a.label.localeCompare(b.label));
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
