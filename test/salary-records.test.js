import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSalaryRecords, salaryRecordMetrics, summarizeSalaryRecords } from "../public/salary-records.js";

test("薪資明細會計算應發、應扣與實領", () => {
  const result = salaryRecordMetrics({
    earnings: [{ label: "底薪", amount: 44800 }, { label: "職務加給", amount: 4400 }, { label: "", amount: 100 }],
    deductions: [{ label: "健保費", amount: 1886 }, { label: "勞保費", amount: 1145 }]
  });
  assert.equal(result.grossPay, 49200);
  assert.equal(result.deductionTotal, 3031);
  assert.equal(result.netPay, 46169);
});

test("薪資紀錄會過濾無效月份並由新到舊排列", () => {
  const records = normalizeSalaryRecords({
    june: { month: "2026-06", earnings: [{ label: "底薪", amount: 64000 }], deductions: [{ label: "扣款", amount: 5253 }] },
    july: { month: "2026-07", earnings: [{ label: "底薪", amount: 65000 }], deductions: [] },
    invalid: { month: "六月", earnings: [] }
  });
  assert.deepEqual(records.map(record => record.month), ["2026-07", "2026-06"]);
  assert.equal(records[1].netPay, 58747);
});

test("薪資摘要可以依年份加總", () => {
  const records = [
    { month: "2026-06", grossPay: 64000, deductionTotal: 5253, netPay: 58747 },
    { month: "2025-12", grossPay: 60000, deductionTotal: 5000, netPay: 55000 }
  ];
  assert.deepEqual(summarizeSalaryRecords(records, "2026"), { count: 1, grossPay: 64000, deductionTotal: 5253, netPay: 58747 });
});
