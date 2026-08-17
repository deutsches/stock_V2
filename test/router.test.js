import test from "node:test";
import assert from "node:assert/strict";
import { routeFromHash, titleForRoute } from "../public/router.js";

test("首頁與未知網址都回到投資總覽", () => {
  assert.equal(routeFromHash(""), "dashboard");
  assert.equal(routeFromHash("#/"), "dashboard");
  assert.equal(routeFromHash("#/unknown"), "dashboard");
});

test("資產歷史網址會切換歷史頁與標題", () => {
  assert.equal(routeFromHash("#/history"), "history");
  assert.equal(routeFromHash("#/HISTORY"), "history");
  assert.equal(titleForRoute("history"), "StockV2｜資產歷史");
});
