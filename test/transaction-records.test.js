import test from "node:test";
import assert from "node:assert/strict";
import {
  filterTransactions,
  normalizeTransactions,
  summarizeTransactions,
  transactionMetrics
} from "../public/transaction-records.js";

const records = {
  older: { market: "US", year: 2025, symbol: "aapl", name: "Apple", cost: 100, proceeds: 125, sellPrice: 250, createdAt: 1 },
  newest: { market: "US", year: 2026, symbol: "nvda", name: "NVIDIA", cost: 200, proceeds: 180, sellPrice: 90, createdAt: 2 },
  tw: { market: "TW", year: 2026, symbol: "2330", name: "台積電", cost: 1000, proceeds: 1200, sellPrice: 1200, createdAt: 3 },
  invalid: { market: "US", year: 1800, symbol: "", cost: -1, proceeds: 0, sellPrice: 0 }
};

test("交易紀錄會正規化、過濾無效資料並依年份與建立時間倒序", () => {
  const transactions = normalizeTransactions(records);
  assert.equal(transactions.length, 3);
  assert.deepEqual(transactions.map(record => record.id), ["tw", "newest", "older"]);
  assert.equal(transactions.at(-1).symbol, "AAPL");
});

test("可依市場與年份篩選今年和歷年紀錄", () => {
  const transactions = normalizeTransactions(records);
  assert.equal(filterTransactions(transactions, "US").length, 2);
  assert.equal(filterTransactions(transactions, "US", 2026).length, 1);
  assert.equal(filterTransactions(transactions, "TW", 2026).length, 1);
});

test("損益、報酬率與美股台幣損益計算正確", () => {
  const metrics = transactionMetrics({ market: "US", cost: 100, proceeds: 125 }, 30.33);
  assert.equal(metrics.profit, 25);
  assert.equal(metrics.profitRate, 25);
  assert.equal(metrics.profitTwd, 758.25);
  const entered = transactionMetrics({ market: "TW", profit: -50, profitRate: -10 });
  assert.equal(entered.costBasis, 500);
});

test("交易摘要會加總損益並用成本基礎計算整體報酬率", () => {
  const transactions = filterTransactions(normalizeTransactions(records), "US");
  assert.deepEqual(summarizeTransactions(transactions, 30.33), {
    costBasis: 300,
    profit: 5,
    profitTwd: 151.65,
    profitRate: 1.6667
  });
});
