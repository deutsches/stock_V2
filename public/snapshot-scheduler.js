const TAIPEI_TIME_ZONE = "Asia/Taipei";

function round(value, fractionDigits = 4) {
  const factor = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function taipeiParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
}

export function getCurrentSnapshotSlot(now = new Date(), serverTimeOffsetMs = 0) {
  const adjustedDate = new Date(now.getTime() + serverTimeOffsetMs);
  const parts = taipeiParts(adjustedDate);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes < 6 * 60 + 30) return null;

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const slot = minutes < 14 * 60 + 30 ? "0630" : "1430";
  return { id: `${date}_${slot}`, date, slot };
}

export function buildAssetSnapshot(holdings, exchangeRate, slot, cash = { twd: 0, usd: 0 }) {
  const cashTwd = (Number(cash.twd) || 0) + (Number(cash.usd) || 0) * exchangeRate;
  const snapshot = {
    slot: slot.slot,
    localDate: slot.date,
    exchangeRate,
    holdingCount: holdings.length,
    cash: {
      twd: Number(cash.twd) || 0,
      usd: Number(cash.usd) || 0,
      totalTwd: round(cashTwd)
    },
    total: {
      marketValueTwd: 0,
      totalAssetsTwd: 0,
      costTwd: 0,
      unrealizedProfitTwd: 0,
      dailyChangeTwd: 0
    },
    markets: {
      TW: { holdingCount: 0, marketValue: 0, cost: 0, profit: 0 },
      US: { holdingCount: 0, marketValue: 0, cost: 0, profit: 0 }
    }
  };

  for (const holding of holdings) {
    const marketValue = holding.shares * holding.price;
    const cost = holding.shares * holding.averageCost;
    const dailyChange = holding.shares * (holding.price - holding.previousClose);
    const twdMultiplier = holding.market === "US" ? exchangeRate : 1;
    const market = snapshot.markets[holding.market];

    market.holdingCount += 1;
    market.marketValue += marketValue;
    market.cost += cost;
    market.profit += marketValue - cost;
    snapshot.total.marketValueTwd += marketValue * twdMultiplier;
    snapshot.total.costTwd += cost * twdMultiplier;
    snapshot.total.dailyChangeTwd += dailyChange * twdMultiplier;
  }

  snapshot.total.unrealizedProfitTwd = snapshot.total.marketValueTwd - snapshot.total.costTwd;
  snapshot.total.totalAssetsTwd = snapshot.total.marketValueTwd + cashTwd;
  for (const key of Object.keys(snapshot.total)) snapshot.total[key] = round(snapshot.total[key]);
  for (const market of Object.values(snapshot.markets)) {
    for (const key of ["marketValue", "cost", "profit"]) market[key] = round(market[key]);
  }
  return snapshot;
}
