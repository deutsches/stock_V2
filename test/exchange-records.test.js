import test from "node:test";
import assert from "node:assert/strict";
import {
  exchangeRecordMetrics,
  filterExchangeRecords,
  normalizeExchangeRecords,
  summarizeExchangeRecords
} from "../public/exchange-records.js";

test("換匯損益依實際入帳台幣減去美元成本計算", () => {
  const metrics = exchangeRecordMetrics({
    usdAmount: 1000,
    costRate: 30,
    executionRate: 32.95,
    twdReceived: 32900,
    feeTwd: 50
  });
  assert.equal(metrics.costTwd, 30000);
  assert.equal(metrics.quotedTwd, 32950);
  assert.equal(metrics.realizedProfitTwd, 2900);
  assert.equal(metrics.realizedReturnRate, 2900 / 30000 * 100);
});

test("換匯記錄會排除無效資料並依日期由新到舊排序", () => {
  const records = normalizeExchangeRecords({
    older: { date: "2025-12-31", usdAmount: 10, costRate: 30, executionRate: 31, twdReceived: 310, feeTwd: 0 },
    newer: { date: "2026-11-24", usdAmount: 20, costRate: 30, executionRate: 32, twdReceived: 638, feeTwd: 2 },
    invalid: { date: "2026-11", usdAmount: 0, costRate: 30, executionRate: 32, twdReceived: 0 }
  });
  assert.deepEqual(records.map(record => record.id), ["newer", "older"]);
});

test("換匯記錄可依年份篩選並彙總", () => {
  const records = normalizeExchangeRecords({
    a: { date: "2026-11-24", usdAmount: 100, costRate: 30, executionRate: 32, twdReceived: 3190, feeTwd: 10 },
    b: { date: "2026-10-10", usdAmount: 200, costRate: 31, executionRate: 32, twdReceived: 6390, feeTwd: 10 },
    c: { date: "2025-09-01", usdAmount: 50, costRate: 29, executionRate: 30, twdReceived: 1500, feeTwd: 0 }
  });
  assert.equal(filterExchangeRecords(records, "2026").length, 2);
  const summary = summarizeExchangeRecords(records, "2026");
  assert.equal(summary.usdAmount, 300);
  assert.equal(summary.twdReceived, 9580);
  assert.equal(summary.costTwd, 9200);
  assert.equal(summary.realizedProfitTwd, 380);
});
