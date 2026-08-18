import test from "node:test";
import assert from "node:assert/strict";
import { annualSummaryTotal, canLinkAnnualSummary, normalizeAnnualSummaries, resolveAnnualSummary, summarizeAnnualRecords } from "../public/annual-summary.js";

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

test("只有四位數年度能連動交易紀錄", () => {
  assert.equal(canLinkAnnualSummary({ label: "2026" }), true);
  assert.equal(canLinkAnnualSummary({ label: "00675L" }), false);
});

test("連動年度會以同年度台美股交易重新計算並保留手動股利", () => {
  const record = { label: "2026", linkedToTransactions: true, dividend: 99, twProfit: 1, usProfitUsd: 2, usProfitTwd: 3 };
  const transactions = [
    { market: "TW", year: 2026, profit: 100, profitRate: 10, costBasis: 1000 },
    { market: "US", year: 2026, profit: 20, profitRate: 20, costBasis: 100 },
    { market: "US", year: 2025, profit: 999, profitRate: 99, costBasis: 1000 }
  ];
  const resolved = resolveAnnualSummary(record, transactions, 30.33);
  assert.equal(resolved.twProfit, 100);
  assert.equal(resolved.twReturnRate, 10);
  assert.equal(resolved.usProfitUsd, 20);
  assert.equal(resolved.usReturnRate, 20);
  assert.equal(resolved.usProfitTwd, 606.6);
  assert.equal(resolved.dividend, 99);
});
