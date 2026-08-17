import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryChartModel, calculateHistoryStats, filterSnapshotsByRange, normalizeSnapshots } from "../public/history-chart.js";
import { createHistoryDemoSnapshots } from "../public/history-demo-data.js";

const records = {
  "2026-08-09_1430": { localDate: "2026-08-09", slot: "1430", createdAt: Date.parse("2026-08-09T14:30:00+08:00"), total: { marketValueTwd: 1100, costTwd: 900 } },
  invalid: { localDate: "2026-08-11", slot: "1430", total: { marketValueTwd: "bad", costTwd: 900 } },
  "2026-08-17_0630": { localDate: "2026-08-17", slot: "0630", createdAt: Date.parse("2026-08-17T06:30:00+08:00"), total: { marketValueTwd: 1200, costTwd: 950 } },
  "2026-08-17_1430": { localDate: "2026-08-17", slot: "1430", createdAt: Date.parse("2026-08-17T14:30:00+08:00"), total: { marketValueTwd: 1250, costTwd: 950 } }
};

test("正規化快照會過濾無效資料並依時間排序", () => {
  const snapshots = normalizeSnapshots(records);
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.map(snapshot => snapshot.id), ["2026-08-09_1430", "2026-08-17_1430"]);
  assert.equal(snapshots.at(-1).marketValueTwd, 1250);
});

test("歷史範圍以最新快照往前篩選", () => {
  const snapshots = normalizeSnapshots(records);
  assert.equal(filterSnapshotsByRange(snapshots, "7").length, 1);
  assert.equal(filterSnapshotsByRange(snapshots, "30").length, 2);
  assert.equal(filterSnapshotsByRange(snapshots, "ALL").length, 2);
});

test("曲線模型會產生資產與成本路徑", () => {
  const model = buildHistoryChartModel(normalizeSnapshots(records));
  assert.equal(model.points.length, 2);
  assert.match(model.valuePath, /^M .+ L /);
  assert.match(model.costPath, /^M .+ L /);
  assert.equal(model.yTicks.length, 5);
});

test("區間摘要會計算增減、高低點與最大回落", () => {
  const snapshots = [
    { marketValueTwd: 100 },
    { marketValueTwd: 140 },
    { marketValueTwd: 105 },
    { marketValueTwd: 125 }
  ];
  const stats = calculateHistoryStats(snapshots);
  assert.equal(stats.change, 25);
  assert.equal(stats.highest.marketValueTwd, 140);
  assert.equal(stats.lowest.marketValueTwd, 100);
  assert.equal(stats.maxDrawdown, 35);
  assert.equal(stats.maxDrawdownRate, 25);
});

test("範例模式產生 30 天且每日一筆的完整快照", () => {
  const snapshots = createHistoryDemoSnapshots();
  assert.equal(snapshots.length, 30);
  assert.equal(snapshots[0].slot, "1430");
  assert.equal(snapshots.at(-1).slot, "1430");
  assert.ok(snapshots.every(snapshot => Number.isFinite(snapshot.marketValueTwd)));
});
