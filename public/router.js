export function routeFromHash(hash = "") {
  const route = hash.toLowerCase();
  if (route === "#/history") return "history";
  if (route === "#/transactions") return "transactions";
  if (route === "#/annual-summary") return "annual-summary";
  return "dashboard";
}

export function titleForRoute(route) {
  if (route === "history") return "StockV2｜資產歷史";
  if (route === "transactions") return "StockV2｜交易紀錄";
  if (route === "annual-summary") return "StockV2｜年度績效";
  return "StockV2｜投資總覽";
}
