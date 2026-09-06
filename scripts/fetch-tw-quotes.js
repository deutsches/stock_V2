import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLatestTaiwanQuotes } from "../public/price-service.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, "../public/data/tw-quotes.json");
const taipeiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());
const { marketDate, prices } = await fetchLatestTaiwanQuotes(fetch, {
  anchorDate: taipeiDate,
  lookbackDays: 10,
  minQuoteCount: 100,
  requiredSymbols: ["2330", "6488"]
});

const quotes = Object.fromEntries([...prices.entries()].sort(([left], [right]) => left.localeCompare(right)));
const payload = {
  generatedAt: new Date().toISOString(),
  marketDate,
  sources: ["TWSE MI_INDEX", "TPEx"],
  quoteCount: prices.size,
  quotes
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(`已產生 ${marketDate} 共 ${prices.size} 筆台股行情：${outputPath}`);
