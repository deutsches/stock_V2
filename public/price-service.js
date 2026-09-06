const TAIPEI_TIME_ZONE = "Asia/Taipei";
const TWSE_DAILY_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX";
const TPEX_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes";
const FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote";

function finitePrice(value) {
  const number = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function quote(price, change, previousClose = null) {
  const parsedPrice = finitePrice(price);
  if (parsedPrice === null) return null;
  const parsedPreviousClose = finitePrice(previousClose);
  const parsedChange = Number(String(change ?? "").replaceAll(",", ""));
  const inferredPreviousClose = Number.isFinite(parsedChange) ? parsedPrice - parsedChange : null;
  return {
    price: parsedPrice,
    previousClose: parsedPreviousClose ?? (finitePrice(inferredPreviousClose) ?? parsedPrice)
  };
}

export function parseTwseDailyQuotes(data) {
  const table = (Array.isArray(data?.tables) ? data.tables : []).find(item =>
    Array.isArray(item?.fields) && item.fields.includes("證券代號") && item.fields.includes("收盤價")
  );
  if (!table) return new Map();
  const symbolIndex = table.fields.indexOf("證券代號");
  const closeIndex = table.fields.indexOf("收盤價");
  const signIndex = table.fields.indexOf("漲跌(+/-)");
  const changeIndex = table.fields.indexOf("漲跌價差");
  return new Map((Array.isArray(table.data) ? table.data : []).flatMap(row => {
    const symbol = String(row?.[symbolIndex] || "").trim().toUpperCase();
    const rawChange = Number(String(row?.[changeIndex] ?? "").replaceAll(",", ""));
    const sign = String(row?.[signIndex] ?? "");
    const signedChange = Number.isFinite(rawChange) ? (sign.includes("-") ? -Math.abs(rawChange) : Math.abs(rawChange)) : null;
    const parsed = quote(row?.[closeIndex], signedChange);
    return symbol && parsed ? [[symbol, parsed]] : [];
  }));
}

export function parseTpexQuotes(rows) {
  return new Map((Array.isArray(rows) ? rows : []).flatMap(row => {
    const symbol = String(row?.SecuritiesCompanyCode || "").trim().toUpperCase();
    const parsed = quote(row?.Close, row?.Change);
    return symbol && parsed ? [[symbol, parsed]] : [];
  }));
}

export function parseStaticTaiwanQuotes(data) {
  const records = data?.quotes && typeof data.quotes === "object" ? data.quotes : {};
  return new Map(Object.entries(records).flatMap(([rawSymbol, value]) => {
    const symbol = String(rawSymbol).trim().toUpperCase();
    const parsed = quote(value?.price, null, value?.previousClose);
    return symbol && parsed ? [[symbol, parsed]] : [];
  }));
}

export function parseFinnhubQuote(data) {
  return quote(data?.c, null, data?.pc);
}

async function jsonRequest(url, options, fetchFn) {
  const response = await fetchFn(url, options);
  if (!response.ok) throw new Error(`行情服務回傳 ${response.status}`);
  return response.json();
}

function compactDate(date) {
  return String(date || "").replaceAll("-", "");
}

function rocDate(date) {
  const compact = compactDate(date);
  if (!/^\d{8}$/.test(compact)) return "";
  return `${Number(compact.slice(0, 4)) - 1911}${compact.slice(4)}`;
}

export async function fetchTaiwanQuotes(fetchFn = fetch, {
  preferStatic = typeof window !== "undefined",
  staticUrl = new URL("./data/tw-quotes.json", import.meta.url),
  expectedDate = null
} = {}) {
  if (preferStatic) {
    try {
      const requestUrl = new URL(staticUrl);
      if (expectedDate) requestUrl.searchParams.set("date", expectedDate);
      const data = await jsonRequest(requestUrl, { cache: "no-store" }, fetchFn);
      if (expectedDate && data?.marketDate !== expectedDate) throw new Error("台股行情檔尚未更新");
      const prices = parseStaticTaiwanQuotes(data);
      if (prices.size > 0) return prices;
    } catch {
      // 本機尚未產生靜態行情檔時，沿用官方來源作為備援。
    }
  }

  const twseUrl = new URL(TWSE_DAILY_URL);
  twseUrl.searchParams.set("response", "json");
  twseUrl.searchParams.set("type", "ALLBUT0999");
  if (expectedDate) twseUrl.searchParams.set("date", compactDate(expectedDate));
  const results = await Promise.allSettled([
    jsonRequest(twseUrl, { cache: "no-store" }, fetchFn),
    jsonRequest(TPEX_URL, {}, fetchFn)
  ]);
  const fulfilled = results.filter(result => result.status === "fulfilled");
  if (fulfilled.length === 0) throw results[0].reason;
  const [twseResult, tpexResult] = results;
  const twseRows = twseResult.status === "fulfilled" && (!expectedDate || String(twseResult.value?.date) === compactDate(expectedDate))
    ? parseTwseDailyQuotes(twseResult.value)
    : new Map();
  const tpexDate = tpexResult.status === "fulfilled" ? String(tpexResult.value?.[0]?.Date || "") : "";
  const tpexRows = tpexResult.status === "fulfilled" && (!expectedDate || tpexDate === rocDate(expectedDate))
    ? parseTpexQuotes(tpexResult.value)
    : new Map();
  if (twseRows.size === 0 && tpexRows.size === 0) throw new Error("台股官方行情尚未更新至指定日期");
  return new Map([
    ...twseRows,
    ...tpexRows
  ]);
}

export function recentDateCandidates(anchorDate, limit = 10) {
  const compact = compactDate(anchorDate);
  if (!/^\d{8}$/.test(compact)) return [];
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const anchorTime = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(anchorTime)) return [];
  return Array.from({ length: Math.max(1, Number(limit) || 1) }, (_, index) => {
    const date = new Date(anchorTime - index * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  });
}

export async function fetchLatestTaiwanQuotes(fetchFn = fetch, {
  anchorDate,
  lookbackDays = 10,
  minQuoteCount = 100,
  requiredSymbols = []
} = {}) {
  let lastError = null;
  for (const marketDate of recentDateCandidates(anchorDate, lookbackDays)) {
    try {
      const prices = await fetchTaiwanQuotes(fetchFn, { preferStatic: false, expectedDate: marketDate });
      const missingSymbols = requiredSymbols.filter(symbol => !prices.has(String(symbol).trim().toUpperCase()));
      if (prices.size < minQuoteCount || missingSymbols.length > 0) {
        throw new Error(`台股行情不完整：${prices.size} 筆，缺少 ${missingSymbols.join(", ") || "足夠筆數"}`);
      }
      return { marketDate, prices };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`最近 ${lookbackDays} 天找不到完整台股收盤行情`, { cause: lastError });
}

export async function fetchFinnhubQuotes(symbols, apiKey, { fetchFn = fetch, delayMs = 1100 } = {}) {
  if (!apiKey) throw new Error("尚未設定 Finnhub API Key");
  const prices = new Map();
  const uniqueSymbols = [...new Set(symbols.map(value => String(value).trim().toUpperCase()).filter(Boolean))];
  let firstError = null;
  for (const [index, symbol] of uniqueSymbols.entries()) {
    try {
      const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;
      const data = await jsonRequest(url, {}, fetchFn);
      const parsed = parseFinnhubQuote(data);
      if (parsed) prices.set(symbol, parsed);
    } catch (error) {
      firstError ??= error;
    }
    if (delayMs > 0 && index < uniqueSymbols.length - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  if (prices.size === 0 && firstError) throw firstError;
  return prices;
}

export function applyQuotes(holdings, market, prices) {
  let updatedCount = 0;
  const nextHoldings = holdings.map(holding => {
    if (holding.market !== market) return { ...holding };
    const price = prices.get(String(holding.symbol).toUpperCase());
    if (!price) return { ...holding };
    updatedCount += 1;
    return { ...holding, price: price.price, previousClose: price.previousClose };
  });
  return { holdings: nextHoldings, updatedCount };
}

export function duePriceMarkets(now = new Date(), serverTimeOffsetMs = 0) {
  const adjustedDate = new Date(now.getTime() + serverTimeOffsetMs);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(adjustedDate).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (minutes < 6 * 60 + 30) return { date, markets: [] };
  if (minutes < 15 * 60) return { date, markets: ["US"] };
  return { date, markets: ["US", "TW"] };
}
