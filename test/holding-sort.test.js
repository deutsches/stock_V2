import test from "node:test";
import assert from "node:assert/strict";
import { sortHoldings } from "../public/holding-sort.js";

test("持股先排台股再排美股，市場內依代號排序", () => {
  const holdings = [
    { market: "US", symbol: "MSFT" },
    { market: "TW", symbol: "2324" },
    { market: "US", symbol: "AAPL" },
    { market: "TW", symbol: "0050" },
    { market: "TW", symbol: "1101" }
  ];
  assert.deepEqual(sortHoldings(holdings).map(item => `${item.market}:${item.symbol}`), [
    "TW:0050",
    "TW:1101",
    "TW:2324",
    "US:AAPL",
    "US:MSFT"
  ]);
});

test("排序不會改動原始陣列", () => {
  const holdings = [{ market: "US", symbol: "B" }, { market: "US", symbol: "A" }];
  sortHoldings(holdings);
  assert.deepEqual(holdings.map(item => item.symbol), ["B", "A"]);
});
