import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLatestTaiwanQuotes } from "../public/price-service.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, "../public/data/tw-quotes.json");
const fallbackUrl = "https://deutsches.github.io/stock_V2/data/tw-quotes.json";
const taipeiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

async function generateQuotes() {
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    const { marketDate, prices } = await fetchLatestTaiwanQuotes(fetch, {
      anchorDate: taipeiDate,
      lookbackDays: 10,
      minQuoteCount: 100,
      // 上市行情完整即可發布；櫃買來源暫時失敗時，前端會保留原有價格。
      requiredSymbols: ["2330"]
    });
    const quotes = Object.fromEntries([...prices.entries()].sort(([left], [right]) => left.localeCompare(right)));
    const payload = {
      generatedAt: new Date().toISOString(),
      marketDate,
      sources: ["TWSE MI_INDEX", "TPEx"],
      quoteCount: prices.size,
      quotes
    };
    await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
    console.log(`已產生 ${marketDate} 共 ${prices.size} 筆台股行情：${outputPath}`);
  } catch (error) {
    const response = await fetch(`${fallbackUrl}?fallback=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw error;
    const payload = await response.json();
    if (!payload?.marketDate || !payload?.quotes || Object.keys(payload.quotes).length < 100) throw error;
    await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
    console.warn(`官方行情暫時無法使用，沿用 ${payload.marketDate} 已發布行情。`);
  }
}

await generateQuotes();
