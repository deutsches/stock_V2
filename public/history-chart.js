const DAY_MS = 24 * 60 * 60 * 1000;

function snapshotTimestamp(snapshot) {
  if (snapshot.slot !== "manual" && Number.isFinite(Number(snapshot.createdAt))) return Number(snapshot.createdAt);
  const time = snapshot.slot === "0630" ? "06:30" : snapshot.slot === "manual" ? "00:00" : "14:30";
  return Date.parse(`${snapshot.localDate}T${time}:00+08:00`);
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeSnapshots(records) {
  if (!records || typeof records !== "object") return [];

  const snapshots = Object.entries(records)
    .map(([id, snapshot]) => ({
      id,
      localDate: snapshot?.localDate,
      slot: snapshot?.slot,
      createdAt: snapshot?.createdAt,
      marketValueTwd: optionalNumber(snapshot?.total?.marketValueTwd),
      totalAssetsTwd: optionalNumber(snapshot?.total?.totalAssetsTwd ?? snapshot?.total?.marketValueTwd),
      cashTwd: snapshot?.slot === "manual" ? null : optionalNumber(snapshot?.cash?.totalTwd ?? 0),
      costTwd: optionalNumber(snapshot?.total?.costTwd),
      unrealizedProfitTwd: optionalNumber(snapshot?.total?.unrealizedProfitTwd),
      dailyChangeTwd: optionalNumber(snapshot?.total?.dailyChangeTwd),
      holdingCount: Number(snapshot?.holdingCount),
      exchangeRate: Number(snapshot?.exchangeRate),
      twMarketValueTwd: Number(snapshot?.markets?.TW?.marketValue),
      usMarketValueTwd: Number(snapshot?.markets?.US?.marketValue) * Number(snapshot?.exchangeRate)
    }))
    .map(snapshot => ({ ...snapshot, timestamp: snapshotTimestamp(snapshot) }))
    .filter(snapshot =>
      /^\d{4}-\d{2}-\d{2}$/.test(snapshot.localDate || "") &&
      ["0630", "1430", "manual"].includes(snapshot.slot) &&
      Number.isFinite(snapshot.timestamp) &&
      Number.isFinite(snapshot.totalAssetsTwd) &&
      (snapshot.slot === "manual" || (Number.isFinite(snapshot.marketValueTwd) && Number.isFinite(snapshot.costTwd)))
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  return snapshots;
}

export function calculateHistoryStats(snapshots) {
  if (snapshots.length === 0) return null;
  const first = snapshots[0];
  const latest = snapshots.at(-1);
  let peak = first.totalAssetsTwd;
  let highest = first;
  let lowest = first;
  let maxDrawdown = 0;
  let maxDrawdownRate = 0;

  for (const snapshot of snapshots) {
    if (snapshot.totalAssetsTwd > highest.totalAssetsTwd) highest = snapshot;
    if (snapshot.totalAssetsTwd < lowest.totalAssetsTwd) lowest = snapshot;
    peak = Math.max(peak, snapshot.totalAssetsTwd);
    const drawdown = peak - snapshot.totalAssetsTwd;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownRate = peak ? (drawdown / peak) * 100 : 0;
    }
  }

  const change = latest.totalAssetsTwd - first.totalAssetsTwd;
  return {
    first,
    latest,
    change,
    changeRate: first.totalAssetsTwd ? (change / first.totalAssetsTwd) * 100 : 0,
    highest,
    lowest,
    maxDrawdown,
    maxDrawdownRate
  };
}

export function filterSnapshotsByRange(snapshots, range) {
  if (range === "ALL" || snapshots.length === 0) return snapshots;
  if (range === "YTD") {
    const year = new Date(snapshots.at(-1).timestamp).getUTCFullYear();
    const cutoff = Date.parse(`${year}-01-01T00:00:00+08:00`);
    return snapshots.filter(snapshot => snapshot.timestamp >= cutoff);
  }
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
  const values = snapshots.flatMap(snapshot => [snapshot.totalAssetsTwd, snapshot.marketValueTwd]).filter(Number.isFinite);
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
    assetsY: y(snapshot.totalAssetsTwd),
    holdingsY: Number.isFinite(snapshot.marketValueTwd) ? y(snapshot.marketValueTwd) : null
  }));
  const pathFor = key => {
    let drawing = false;
    return points.flatMap(point => {
      if (!Number.isFinite(point[key])) {
        drawing = false;
        return [];
      }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command} ${point.x.toFixed(2)} ${point[key].toFixed(2)}`;
    }).join(" ");
  };
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
    assetsPath: pathFor("assetsY"),
    holdingsPath: pathFor("holdingsY"),
    yTicks,
    xLabels: labelIndices.map(index => points[index])
  };
}
