import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryChartModel, calculateHistoryStats, filterSnapshotsByRange, normalizeSnapshots } from "../public/history-chart.js";
import { createHistoryDemoSnapshots } from "../public/history-demo-data.js";

const records = {
  "2026-01-01_manual": { localDate: "2026-01-01", slot: "manual", createdAt: Date.parse("2026-08-17T22:00:00+08:00"), total: { totalAssetsTwd: 11191872 } },
  "2026-08-09_1430": { localDate: "2026-08-09", slot: "1430", createdAt: Date.parse("2026-08-09T14:30:00+08:00"), total: { marketValueTwd: 1100, costTwd: 900 } },
  invalid: { localDate: "2026-08-11", slot: "1430", total: { marketValueTwd: "bad", costTwd: 900 } },
  "2026-08-17_0630": { localDate: "2026-08-17", slot: "0630", createdAt: Date.parse("2026-08-17T06:30:00+08:00"), total: { marketValueTwd: 1200, costTwd: 950 } },
  "2026-08-17_1430": { localDate: "2026-08-17", slot: "1430", createdAt: Date.parse("2026-08-17T14:30:00+08:00"), cash: { totalTwd: 100 }, total: { marketValueTwd: 1250, totalAssetsTwd: 1350, costTwd: 950 } }
};

test("正規化快照會過濾無效資料並依時間排序", () => {
  const snapshots = normalizeSnapshots(records);
  assert.equal(snapshots.length, 3);
  assert.deepEqual(snapshots.map(snapshot => snapshot.id), ["2026-01-01_manual", "2026-08-09_1430", "2026-08-17_1430"]);
  assert.equal(snapshots[0].marketValueTwd, null);
  assert.equal(snapshots.at(-1).totalAssetsTwd, 1350);
  assert.equal(snapshots.at(-1).cashTwd, 100);
});

test("歷史範圍以最新快照往前篩選", () => {
  const snapshots = normalizeSnapshots(records);
  assert.equal(filterSnapshotsByRange(snapshots, "7").length, 1);
  assert.equal(filterSnapshotsByRange(snapshots, "30").length, 2);
  assert.equal(filterSnapshotsByRange(snapshots, "YTD").length, 3);
  assert.equal(filterSnapshotsByRange(snapshots, "ALL").length, 3);
});

test("曲線模型會產生總資產與持股市值路徑", () => {
  const model = buildHistoryChartModel(normalizeSnapshots(records));
  assert.equal(model.points.length, 3);
  assert.match(model.assetsPath, /^M .+ L /);
  assert.match(model.holdingsPath, /^M .+ L /);
  assert.equal(model.yTicks.length, 5);
});

test("區間摘要會計算增減、高低點與最大回落", () => {
  const snapshots = [
    { totalAssetsTwd: 100 },
    { totalAssetsTwd: 140 },
    { totalAssetsTwd: 105 },
    { totalAssetsTwd: 125 }
  ];
  const stats = calculateHistoryStats(snapshots);
  assert.equal(stats.change, 25);
  assert.equal(stats.highest.totalAssetsTwd, 140);
  assert.equal(stats.lowest.totalAssetsTwd, 100);
  assert.equal(stats.maxDrawdown, 35);
  assert.equal(stats.maxDrawdownRate, 25);
});

test("範例模式產生 30 天且每日一筆的完整快照", () => {
  const snapshots = createHistoryDemoSnapshots();
  assert.equal(snapshots.length, 30);
  assert.equal(snapshots[0].slot, "1430");
  assert.equal(snapshots.at(-1).slot, "1430");
  assert.ok(snapshots.every(snapshot => Number.isFinite(snapshot.marketValueTwd)));
  assert.ok(snapshots.every(snapshot => snapshot.totalAssetsTwd === snapshot.marketValueTwd + snapshot.cashTwd));
});
