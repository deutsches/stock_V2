const DAY_MS = 24 * 60 * 60 * 1000;

function snapshotTimestamp(snapshot) {
  if (Number.isFinite(Number(snapshot.createdAt))) return Number(snapshot.createdAt);
  const time = snapshot.slot === "0630" ? "06:30" : "14:30";
  return Date.parse(`${snapshot.localDate}T${time}:00+08:00`);
}

export function normalizeSnapshots(records) {
  if (!records || typeof records !== "object") return [];

  const snapshots = Object.entries(records)
    .map(([id, snapshot]) => ({
      id,
      localDate: snapshot?.localDate,
      slot: snapshot?.slot,
      createdAt: snapshot?.createdAt,
      marketValueTwd: Number(snapshot?.total?.marketValueTwd),
      costTwd: Number(snapshot?.total?.costTwd),
      unrealizedProfitTwd: Number(snapshot?.total?.unrealizedProfitTwd),
      dailyChangeTwd: Number(snapshot?.total?.dailyChangeTwd),
      holdingCount: Number(snapshot?.holdingCount),
      exchangeRate: Number(snapshot?.exchangeRate),
      twMarketValueTwd: Number(snapshot?.markets?.TW?.marketValue),
      usMarketValueTwd: Number(snapshot?.markets?.US?.marketValue) * Number(snapshot?.exchangeRate)
    }))
    .map(snapshot => ({ ...snapshot, timestamp: snapshotTimestamp(snapshot) }))
    .filter(snapshot =>
      /^\d{4}-\d{2}-\d{2}$/.test(snapshot.localDate || "") &&
      ["0630", "1430"].includes(snapshot.slot) &&
      Number.isFinite(snapshot.timestamp) &&
      Number.isFinite(snapshot.marketValueTwd) &&
      Number.isFinite(snapshot.costTwd)
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  return [...snapshots.reduce((byDate, snapshot) => {
    const current = byDate.get(snapshot.localDate);
    if (!current || snapshot.slot === "1430") byDate.set(snapshot.localDate, snapshot);
    return byDate;
  }, new Map()).values()];
}

export function calculateHistoryStats(snapshots) {
  if (snapshots.length === 0) return null;
  const first = snapshots[0];
  const latest = snapshots.at(-1);
  let peak = first.marketValueTwd;
  let highest = first;
  let lowest = first;
  let maxDrawdown = 0;
  let maxDrawdownRate = 0;

  for (const snapshot of snapshots) {
    if (snapshot.marketValueTwd > highest.marketValueTwd) highest = snapshot;
    if (snapshot.marketValueTwd < lowest.marketValueTwd) lowest = snapshot;
    peak = Math.max(peak, snapshot.marketValueTwd);
    const drawdown = peak - snapshot.marketValueTwd;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownRate = peak ? (drawdown / peak) * 100 : 0;
    }
  }

  const change = latest.marketValueTwd - first.marketValueTwd;
  return {
    first,
    latest,
    change,
    changeRate: first.marketValueTwd ? (change / first.marketValueTwd) * 100 : 0,
    highest,
    lowest,
    maxDrawdown,
    maxDrawdownRate
  };
}

export function filterSnapshotsByRange(snapshots, range) {
  if (range === "ALL" || snapshots.length === 0) return snapshots;
  const days = Number(range);
  if (!Number.isFinite(days) || days <= 0) return snapshots;
  const latestTimestamp = snapshots.at(-1).timestamp;
  const cutoff = latestTimestamp - days * DAY_MS;
  return snapshots.filter(snapshot => snapshot.timestamp >= cutoff);
}

export function buildHistoryChartModel(snapshots, width = 1000, height = 320) {
  if (snapshots.length === 0) return null;

  const bounds = { top: 22, right: 28, bottom: 42, left: 88 };
  const innerWidth = width - bounds.left - bounds.right;
  const innerHeight = height - bounds.top - bounds.bottom;
  const values = snapshots.flatMap(snapshot => [snapshot.marketValueTwd, snapshot.costTwd]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = rawMax - rawMin;
  const padding = spread ? spread * 0.12 : Math.max(Math.abs(rawMax) * 0.05, 1);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const range = max - min || 1;
  const x = index => bounds.left + (snapshots.length === 1 ? innerWidth / 2 : (index / (snapshots.length - 1)) * innerWidth);
  const y = value => bounds.top + ((max - value) / range) * innerHeight;
  const points = snapshots.map((snapshot, index) => ({
    ...snapshot,
    x: x(index),
    valueY: y(snapshot.marketValueTwd),
    costY: y(snapshot.costTwd)
  }));
  const pathFor = key => points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point[key].toFixed(2)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return { value: max - range * ratio, y: bounds.top + innerHeight * ratio };
  });
  const labelCount = Math.min(5, points.length);
  const labelIndices = [...new Set(Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * (points.length - 1) / Math.max(labelCount - 1, 1))
  ))];

  return {
    width,
    height,
    bounds,
    points,
    valuePath: pathFor("valueY"),
    costPath: pathFor("costY"),
    yTicks,
    xLabels: labelIndices.map(index => points[index])
  };
}
