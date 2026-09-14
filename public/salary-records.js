function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeSalaryItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({ label: String(item?.label || "").trim(), amount: finiteNumber(item?.amount) }))
    .filter(item => item.label && item.amount !== 0);
}

export function salaryRecordMetrics(record = {}) {
  const earnings = normalizeSalaryItems(record.earnings);
  const deductions = normalizeSalaryItems(record.deductions);
  const grossPay = earnings.reduce((sum, item) => sum + item.amount, 0);
  const deductionTotal = deductions.reduce((sum, item) => sum + item.amount, 0);
  return { earnings, deductions, grossPay, deductionTotal, netPay: grossPay - deductionTotal };
}

export function normalizeSalaryRecords(records) {
  return Object.entries(records && typeof records === "object" ? records : {})
    .map(([id, record]) => {
      const month = String(record?.month || "").trim();
      if (!/^\d{4}-\d{2}$/.test(month)) return null;
      const metrics = salaryRecordMetrics(record);
      return {
        id,
        month,
        ...metrics,
        leaveLabel: String(record?.leaveLabel || "").trim(),
        leaveHours: finiteNumber(record?.leaveHours),
        createdAt: finiteNumber(record?.createdAt),
        updatedAt: finiteNumber(record?.updatedAt)
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.month.localeCompare(left.month) || right.createdAt - left.createdAt);
}

export function summarizeSalaryRecords(records, year = "ALL") {
  const filtered = records.filter(record => year === "ALL" || record.month.startsWith(`${year}-`));
  return filtered.reduce((summary, record) => {
    summary.count += 1;
    summary.grossPay += record.grossPay;
    summary.deductionTotal += record.deductionTotal;
    summary.netPay += record.netPay;
    return summary;
  }, { count: 0, grossPay: 0, deductionTotal: 0, netPay: 0 });
}
