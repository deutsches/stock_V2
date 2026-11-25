import test from "node:test";
import assert from "node:assert/strict";
import {
  applyExchangeCashDelta,
  exchangeCashMovement,
  exchangeRecordMetrics,
  exchangeTransactionBase,
  filterExchangeRecords,
  normalizeExchangeRecords,
  summarizeExchangeRecords,
  TWD_TO_USD
} from "../public/exchange-records.js";

test("Firebase transaction 冷快取為 null 時會使用預先讀取的現金", () => {
  const prefetched = { cash: { usd: 65659.55, twd: 2598192 }, exchangeRecords: { existing: { usdAmount: 1 } } };
  const userData = exchangeTransactionBase(null, prefetched);
  assert.deepEqual(userData.cash, prefetched.cash);
  userData.cash.usd = 50659.55;
  assert.equal(prefetched.cash.usd, 65659.55);
});

test("Firebase transaction 重試時優先使用最新伺服器資料", () => {
  const prefetched = { cash: { usd: 65659.55, twd: 2598192 } };
  const current = { cash: { usd: 70000, twd: 2600000 } };
  assert.deepEqual(exchangeTransactionBase(current, prefetched).cash, current.cash);
});

test("新增換匯會同時扣美元並增加實際入帳台幣", () => {
  assert.deepEqual(
    applyExchangeCashDelta({ usd: 5000, twd: 100000 }, -1000, 32900),
    { usd: 4000, twd: 132900 }
  );
});

test("美元不足或刪除時台幣不足會拒絕現金異動", () => {
  assert.match(applyExchangeCashDelta({ usd: 500, twd: 100000 }, -1000, 32900).error, /美元現金不足/);
  assert.match(applyExchangeCashDelta({ usd: 4000, twd: 10000 }, 1000, -32900).error, /台幣現金不足/);
});

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

test("台幣換美元會扣台幣、增加美元且不產生已實現損益", () => {
  const record = {
    direction: TWD_TO_USD,
    usdAmount: 1000,
    twdAmount: 32950,
    executionRate: 32.9,
    feeTwd: 50
  };
  assert.deepEqual(exchangeCashMovement(record), { usdDelta: 1000, twdDelta: -32950 });
  const metrics = exchangeRecordMetrics(record);
  assert.equal(metrics.effectiveRate, 32.95);
  assert.equal(metrics.realizedProfitTwd, 0);
});

test("既有單向記錄沒有方向與台幣新欄位時仍視為美元換台幣", () => {
  const [record] = normalizeExchangeRecords({
    legacy: { date: "2026-11-24", usdAmount: 20, costRate: 30, executionRate: 32, twdReceived: 638, feeTwd: 2 }
  });
  assert.equal(record.direction, "USD_TO_TWD");
  assert.equal(record.twdAmount, 638);
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
    d: { date: "2026-09-10", direction: TWD_TO_USD, usdAmount: 50, twdAmount: 1600, executionRate: 32, feeTwd: 5 },
    c: { date: "2025-09-01", usdAmount: 50, costRate: 29, executionRate: 30, twdReceived: 1500, feeTwd: 0 }
  });
  assert.equal(filterExchangeRecords(records, "2026").length, 3);
  const summary = summarizeExchangeRecords(records, "2026");
  assert.equal(summary.soldUsd, 300);
  assert.equal(summary.receivedTwd, 9580);
  assert.equal(summary.boughtUsd, 50);
  assert.equal(summary.spentTwd, 1600);
  assert.equal(summary.feeTwd, 25);
  assert.equal(summary.costTwd, 9200);
  assert.equal(summary.realizedProfitTwd, 380);
});
