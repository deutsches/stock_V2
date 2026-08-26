const TAIPEI_TIME_ZONE = "Asia/Taipei";
const TWSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
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

export function parseTwseQuotes(rows) {
  return new Map((Array.isArray(rows) ? rows : []).flatMap(row => {
    const symbol = String(row?.Code || "").trim().toUpperCase();
    const parsed = quote(row?.ClosingPrice, row?.Change);
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

  const results = await Promise.allSettled([
    jsonRequest(TWSE_URL, {}, fetchFn),
    jsonRequest(TPEX_URL, {}, fetchFn)
  ]);
  const fulfilled = results.filter(result => result.status === "fulfilled");
  if (fulfilled.length === 0) throw results[0].reason;
  const [twseResult, tpexResult] = results;
  return new Map([
    ...(twseResult.status === "fulfilled" ? parseTwseQuotes(twseResult.value) : []),
    ...(tpexResult.status === "fulfilled" ? parseTpexQuotes(tpexResult.value) : [])
  ]);
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
