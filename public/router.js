export function routeFromHash(hash = "") {
  return hash.toLowerCase() === "#/history" ? "history" : "dashboard";
}

export function titleForRoute(route) {
  return route === "history" ? "StockV2｜資產歷史" : "StockV2｜投資總覽";
}
