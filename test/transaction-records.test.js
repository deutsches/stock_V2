import test from "node:test";
import assert from "node:assert/strict";
import {
  filterTransactions,
  normalizeTransactions,
  summarizeTransactions,
  transactionMetrics
} from "../public/transaction-records.js";

const records = {
  older: { market: "US", soldDate: "2025-03-01", symbol: "aapl", name: "Apple", cost: 100, proceeds: 125, sellPrice: 250, createdAt: 1 },
  newest: { market: "US", soldDate: "2026-08-18", symbol: "nvda", name: "NVIDIA", cost: 200, proceeds: 180, sellPrice: 90, createdAt: 2 },
  tw: { market: "TW", soldDate: "2026-07-01", symbol: "2330", name: "台積電", cost: 1000, proceeds: 1200, sellPrice: 1200, createdAt: 3 },
  invalid: { market: "US", soldDate: "bad", symbol: "", cost: -1, proceeds: 0, sellPrice: 0 }
};

test("交易紀錄會正規化、過濾無效資料並依日期倒序", () => {
  const transactions = normalizeTransactions(records);
  assert.equal(transactions.length, 3);
  assert.deepEqual(transactions.map(record => record.id), ["newest", "tw", "older"]);
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
});

test("交易摘要會加總成本、收入與損益", () => {
  const transactions = filterTransactions(normalizeTransactions(records), "US");
  assert.deepEqual(summarizeTransactions(transactions, 30.33), {
    cost: 300,
    proceeds: 305,
    profit: 5,
    profitTwd: 151.65
  });
});
