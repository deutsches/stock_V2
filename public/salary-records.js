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
      const type = record?.type === "bonus" ? "bonus" : "salary";
      const month = String(record?.month || "").trim();
      const year = month.slice(0, 4) || (type === "bonus" ? String(record?.year || "").trim() : "");
      const title = String(record?.title || "").trim();
      if (type === "salary" && !/^\d{4}-\d{2}$/.test(month)) return null;
      if (type === "bonus" && (!/^\d{4}$/.test(year) || !title || (month && !/^\d{4}-\d{2}$/.test(month)))) return null;
      const metrics = salaryRecordMetrics(record);
      return {
        id,
        type,
        year,
        month,
        title,
        ...metrics,
        leaveLabel: String(record?.leaveLabel || "").trim(),
        leaveHours: finiteNumber(record?.leaveHours),
        createdAt: finiteNumber(record?.createdAt),
        updatedAt: finiteNumber(record?.updatedAt)
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftKey = left.month || `${left.year}-00`;
      const rightKey = right.month || `${right.year}-00`;
      return rightKey.localeCompare(leftKey) || right.createdAt - left.createdAt;
    });
}

export function summarizeSalaryRecords(records, year = "ALL") {
  const filtered = records.filter(record => year === "ALL" || (record.year || record.month?.slice(0, 4)) === year);
  return filtered.reduce((summary, record) => {
    summary.count += 1;
    summary.grossPay += record.grossPay;
    summary.deductionTotal += record.deductionTotal;
    summary.netPay += record.netPay;
    return summary;
  }, { count: 0, grossPay: 0, deductionTotal: 0, netPay: 0 });
}

export function salaryRecordLabel(record) {
  if (record?.type === "bonus") {
    if (!record.month) return `${record.year} 年${record.title}`;
    const [, monthNumber] = record.month.split("-");
    return `${record.year} 年 ${Number(monthNumber)} 月 · ${record.title}`;
  }
  const [year, monthNumber] = String(record?.month || "").split("-");
  return `${year} 年 ${Number(monthNumber)} 月`;
}
