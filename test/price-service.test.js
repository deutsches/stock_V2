import test from "node:test";
import assert from "node:assert/strict";
import { applyQuotes, duePriceMarkets, fetchFinnhubQuotes, fetchLatestTaiwanQuotes, fetchTaiwanQuotes, parseFinnhubQuote, parseStaticTaiwanQuotes, parseTpexQuotes, parseTwseDailyQuotes, recentDateCandidates } from "../public/price-service.js";

test("解析上市與上櫃官方收盤行情", () => {
  const twseData = {
    date: "20260827",
    tables: [{
      fields: ["證券代號", "證券名稱", "收盤價", "漲跌(+/-)", "漲跌價差"],
      data: [["2330", "台積電", "1,200", "<p>+</p>", "10"], ["2345", "智邦", "2,090", "<p>+</p>", "35"]]
    }]
  };
  assert.deepEqual(parseTwseDailyQuotes(twseData).get("2330"), {
    price: 1200,
    previousClose: 1190
  });
  assert.deepEqual(parseTwseDailyQuotes(twseData).get("2345"), { price: 2090, previousClose: 2055 });
  assert.deepEqual(parseTpexQuotes([{ SecuritiesCompanyCode: "6488", Close: "320", Change: "-5" }]).get("6488"), {
    price: 320,
    previousClose: 325
  });
});

test("解析 GitHub Pages 同網域台股行情檔", async () => {
  const data = {
    generatedAt: "2026-08-26T07:00:00.000Z",
    marketDate: "2026-08-26",
    quotes: {
      "2330": { price: 1200, previousClose: 1190 },
      "6488": { price: "320", previousClose: "315" }
    }
  };
  assert.deepEqual(parseStaticTaiwanQuotes(data).get("2330"), { price: 1200, previousClose: 1190 });

  const requests = [];
  const prices = await fetchTaiwanQuotes(async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, json: async () => data };
  }, { preferStatic: true, staticUrl: "https://example.com/data/tw-quotes.json", expectedDate: "2026-08-26" });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /tw-quotes\.json\?date=2026-08-26$/);
  assert.deepEqual(requests[0].options, { cache: "no-store" });
  assert.deepEqual(prices.get("6488"), { price: 320, previousClose: 315 });
});

test("同網域行情檔日期過期時不會套用舊價格", async () => {
  const requests = [];
  const fetchFn = async url => {
    const requestUrl = String(url);
    requests.push(requestUrl);
    if (requestUrl.includes("tw-quotes.json")) {
      return { ok: true, json: async () => ({ marketDate: "2026-08-25", quotes: { "2330": { price: 999, previousClose: 998 } } }) };
    }
    if (requestUrl.includes("MI_INDEX")) {
      return { ok: true, json: async () => ({
        date: "20260826",
        tables: [{ fields: ["證券代號", "收盤價", "漲跌(+/-)", "漲跌價差"], data: [["2330", "1,200", "+", "10"]] }]
      }) };
    }
    return { ok: true, json: async () => [] };
  };
  const prices = await fetchTaiwanQuotes(fetchFn, {
    preferStatic: true,
    staticUrl: "https://example.com/data/tw-quotes.json",
    expectedDate: "2026-08-26"
  });
  assert.equal(requests.length, 3);
  assert.deepEqual(prices.get("2330"), { price: 1200, previousClose: 1190 });
});

test("解析 Finnhub 目前價格與前收", () => {
  assert.deepEqual(parseFinnhubQuote({ c: 230.5, pc: 228.2 }), { price: 230.5, previousClose: 228.2 });
  assert.equal(parseFinnhubQuote({ c: 0, pc: 228.2 }), null);
});

test("只更新指定市場且缺少行情時保留原資料", () => {
  const holdings = [
    { market: "TW", symbol: "2330", price: 1000, previousClose: 990 },
    { market: "TW", symbol: "2454", price: 1200, previousClose: 1210 },
    { market: "US", symbol: "AAPL", price: 200, previousClose: 198 }
  ];
  const result = applyQuotes(holdings, "TW", new Map([["2330", { price: 1250, previousClose: 1230 }]]));
  assert.equal(result.updatedCount, 1);
  assert.deepEqual(result.holdings.map(item => item.price), [1250, 1200, 200]);
});

test("台北時間 06:30 更新美股，15:00 後再更新台股", () => {
  assert.deepEqual(duePriceMarkets(new Date("2026-08-18T22:29:00Z")), { date: "2026-08-19", markets: [] });
  assert.deepEqual(duePriceMarkets(new Date("2026-08-18T22:30:00Z")), { date: "2026-08-19", markets: ["US"] });
  assert.deepEqual(duePriceMarkets(new Date("2026-08-19T06:59:00Z")), { date: "2026-08-19", markets: ["US"] });
  assert.deepEqual(duePriceMarkets(new Date("2026-08-19T07:00:00Z")), { date: "2026-08-19", markets: ["US", "TW"] });
});

test("台股其中一個官方來源失敗時仍保留另一個來源", async () => {
  const fetchFn = async url => {
    if (url.includes("twse")) return { ok: false, status: 503 };
    return {
      ok: true,
      json: async () => [{ Date: "1150827", SecuritiesCompanyCode: "6488", Close: "320", Change: "5" }]
    };
  };
  const prices = await fetchTaiwanQuotes(fetchFn, { preferStatic: false, expectedDate: "2026-08-27" });
  assert.deepEqual(prices.get("6488"), { price: 320, previousClose: 315 });
});

test("上市收盤行情必須符合指定日期並讀到智邦 2090", async () => {
  const fetchFn = async url => {
    if (String(url).includes("MI_INDEX")) return {
      ok: true,
      json: async () => ({
        date: "20260827",
        tables: [{ fields: ["證券代號", "收盤價", "漲跌(+/-)", "漲跌價差"], data: [["2345", "2,090", "+", "35"]] }]
      })
    };
    return { ok: true, json: async () => [] };
  };
  const prices = await fetchTaiwanQuotes(fetchFn, { preferStatic: false, expectedDate: "2026-08-27" });
  assert.deepEqual(prices.get("2345"), { price: 2090, previousClose: 2055 });
});

test("排程延遲到週末時會往前找到最近的完整交易日", async () => {
  assert.deepEqual(recentDateCandidates("2026-08-29", 3), ["2026-08-29", "2026-08-28", "2026-08-27"]);
  const requests = [];
  const fetchFn = async url => {
    const requestUrl = String(url);
    requests.push(requestUrl);
    if (requestUrl.includes("MI_INDEX")) {
      const requestedDate = new URL(requestUrl).searchParams.get("date");
      return {
        ok: true,
        json: async () => ({
          date: "20260828",
          tables: [{
            fields: ["證券代號", "收盤價", "漲跌(+/-)", "漲跌價差"],
            data: requestedDate === "20260828" ? [["2330", "2,420", "+", "10"]] : []
          }]
        })
      };
    }
    return {
      ok: true,
      json: async () => [{ Date: "1150828", SecuritiesCompanyCode: "6488", Close: "320", Change: "5" }]
    };
  };
  const result = await fetchLatestTaiwanQuotes(fetchFn, {
    anchorDate: "2026-08-29",
    lookbackDays: 3,
    minQuoteCount: 2,
    requiredSymbols: ["2330", "6488"]
  });
  assert.equal(result.marketDate, "2026-08-28");
  assert.equal(result.prices.size, 2);
  assert.deepEqual(result.prices.get("2330"), { price: 2420, previousClose: 2410 });
  assert.equal(requests.length, 4);
});

test("Finnhub 使用瀏覽器相容的 token 參數且單一代號失敗不影響其他代號", async () => {
  const requests = [];
  const fetchFn = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("BAD")) return { ok: false, status: 429 };
    return { ok: true, json: async () => ({ c: 230.5, pc: 228.2 }) };
  };
  const prices = await fetchFinnhubQuotes(["BAD", "AAPL", "AAPL"], "browser-only-key", { fetchFn, delayMs: 0 });
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /token=browser-only-key/);
  assert.deepEqual(requests[0].options, {});
  assert.deepEqual(prices.get("AAPL"), { price: 230.5, previousClose: 228.2 });
});
