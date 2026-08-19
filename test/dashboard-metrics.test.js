import test from "node:test";
import assert from "node:assert/strict";
import { calculateDashboardMetrics } from "../public/dashboard-metrics.js";

test("最新價格變動會連動未實現損益", () => {
  const holdings = [{ market: "TW", shares: 10, averageCost: 80, price: 100, previousClose: 95 }];
  const before = calculateDashboardMetrics(holdings, { twd: 0, usd: 0 }, 30.33);
  const after = calculateDashboardMetrics([{ ...holdings[0], price: 110 }], { twd: 0, usd: 0 }, 30.33);
  assert.equal(before.profit, 200);
  assert.equal(after.profit, 300);
});

test("今日變化分開計算台股與美股並統一換成台幣", () => {
  const holdings = [
    { market: "TW", shares: 10, averageCost: 80, price: 100, previousClose: 95 },
    { market: "US", shares: 2, averageCost: 15, price: 20, previousClose: 18 }
  ];
  const result = calculateDashboardMetrics(holdings, { twd: 1000, usd: 10 }, 30.33);
  assert.equal(result.daily.TW, 50);
  assert.ok(Math.abs(result.daily.US - 121.32) < 0.000001);
  assert.ok(Math.abs(result.change - 171.32) < 0.000001);
  assert.ok(Math.abs(result.profit - 503.3) < 0.000001);
});
