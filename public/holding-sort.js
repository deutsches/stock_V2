const MARKET_ORDER = { TW: 0, US: 1 };

export function sortHoldings(holdings) {
  return holdings.slice().sort((a, b) => {
    const marketDifference = (MARKET_ORDER[a.market] ?? 2) - (MARKET_ORDER[b.market] ?? 2);
    if (marketDifference) return marketDifference;
    return String(a.symbol).localeCompare(String(b.symbol), "en", {
      numeric: true,
      sensitivity: "base"
    });
  });
}
