import test from "node:test";
import assert from "node:assert/strict";
import { annualSummaryTotal, normalizeAnnualSummaries, summarizeAnnualRecords } from "../public/annual-summary.js";

test("年度總記錄允許年份與股票名稱並依指定順序排列", () => {
  const records = normalizeAnnualSummaries({
    stock: { label: "00675L", twProfit: 100, order: 2 },
    year: { label: "2026", twProfit: 200, order: 1 },
    invalid: { label: "" }
  });
  assert.deepEqual(records.map(record => record.label), ["2026", "00675L"]);
});

test("單筆合計包含台股損益、股利與美股台幣損益", () => {
  assert.equal(annualSummaryTotal({ twProfit: 100, dividend: 20, usProfitTwd: 30 }), 150);
});

test("年度總計會加總所有獨立項目", () => {
  const summary = summarizeAnnualRecords([
    { twProfit: 100, dividend: 20, usProfitUsd: 3, usProfitTwd: 90 },
    { twProfit: -40, dividend: 0, usProfitUsd: 0, usProfitTwd: 0 }
  ]);
  assert.deepEqual(summary, { twProfit: 60, dividend: 20, usProfitUsd: 3, usProfitTwd: 90, totalProfitTwd: 170 });
});
