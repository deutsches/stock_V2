import test from "node:test";
import assert from "node:assert/strict";
import { buildAssetSnapshot, getCurrentSnapshotSlot } from "../public/snapshot-scheduler.js";

test("06:30 前不建立快照", () => {
  assert.equal(getCurrentSnapshotSlot(new Date("2026-08-16T22:29:00Z")), null);
});

test("06:30 至 14:29 使用上午時段", () => {
  assert.deepEqual(getCurrentSnapshotSlot(new Date("2026-08-16T22:30:00Z")), {
    id: "2026-08-17_0630",
    date: "2026-08-17",
    slot: "0630"
  });
  assert.equal(getCurrentSnapshotSlot(new Date("2026-08-17T06:29:00Z")).slot, "0630");
});

test("14:30 後使用下午時段", () => {
  assert.deepEqual(getCurrentSnapshotSlot(new Date("2026-08-17T06:30:00Z")), {
    id: "2026-08-17_1430",
    date: "2026-08-17",
    slot: "1430"
  });
});

test("使用 Firebase 伺服器時間差校正本機時間", () => {
  const slot = getCurrentSnapshotSlot(new Date("2026-08-16T22:29:00Z"), 60 * 1000);
  assert.equal(slot.id, "2026-08-17_0630");
});

test("快照分開保存原幣市場資料並計算台幣總額", () => {
  const holdings = [
    { market: "TW", shares: 10, price: 100, averageCost: 80, previousClose: 95 },
    { market: "US", shares: 2, price: 20, averageCost: 15, previousClose: 18 }
  ];
  const snapshot = buildAssetSnapshot(holdings, 30.33, { date: "2026-08-17", slot: "1430" });

  assert.equal(snapshot.total.marketValueTwd, 2213.2);
  assert.equal(snapshot.total.costTwd, 1709.9);
  assert.equal(snapshot.total.unrealizedProfitTwd, 503.3);
  assert.equal(snapshot.total.dailyChangeTwd, 171.32);
  assert.deepEqual(snapshot.markets.US, {
    holdingCount: 1,
    marketValue: 40,
    cost: 30,
    profit: 10
  });
});
