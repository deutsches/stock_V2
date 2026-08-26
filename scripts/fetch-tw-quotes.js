import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchTaiwanQuotes } from "../public/price-service.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, "../public/data/tw-quotes.json");
const prices = await fetchTaiwanQuotes(fetch, { preferStatic: false });

if (prices.size < 100) {
  throw new Error(`台股行情筆數異常：只取得 ${prices.size} 筆`);
}

const quotes = Object.fromEntries([...prices.entries()].sort(([left], [right]) => left.localeCompare(right)));
const marketDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());
const payload = {
  generatedAt: new Date().toISOString(),
  marketDate,
  sources: ["TWSE", "TPEx"],
  quoteCount: prices.size,
  quotes
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(`已產生 ${prices.size} 筆台股行情：${outputPath}`);
