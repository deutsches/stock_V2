import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);
const googleProvider = new GoogleAuthProvider();

function userPath(uid, childPath = "") {
  return `stockV2/users/${uid}${childPath ? `/${childPath}` : ""}`;
}

function firebaseHoldingKey(holding) {
  return btoa(`${holding.market}:${holding.symbol}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function observeAuthentication(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function observeConnection(callback) {
  return onValue(ref(database, ".info/connected"), snapshot => callback(snapshot.val() === true));
}

export function observeServerTimeOffset(callback) {
  return onValue(ref(database, ".info/serverTimeOffset"), snapshot => callback(Number(snapshot.val()) || 0));
}

export function observeHoldings(uid, onData, onError) {
  return onValue(ref(database, userPath(uid, "holdings")), snapshot => {
    const value = snapshot.val();
    onData(value && typeof value === "object" ? Object.values(value) : []);
  }, onError);
}

export function observeCashBalances(uid, onData, onError) {
  return onValue(ref(database, userPath(uid, "cash")), snapshot => {
    const value = snapshot.val();
    onData({
      twd: Number(value?.twd) || 0,
      usd: Number(value?.usd) || 0,
      updatedAt: Number(value?.updatedAt) || null
    });
  }, onError);
}

export function observeSnapshots(uid, onData, onError) {
  return onValue(ref(database, userPath(uid, "snapshots")), snapshot => {
    onData(snapshot.val());
  }, onError);
}

export function observeTransactions(uid, onData, onError) {
  return onValue(ref(database, userPath(uid, "transactions")), snapshot => {
    onData(snapshot.val());
  }, onError);
}

export function observeAnnualSummaries(uid, onData, onError) {
  return onValue(ref(database, userPath(uid, "annualSummaries")), snapshot => {
    onData(snapshot.val());
  }, onError);
}

export function replaceHoldings(uid, holdings) {
  const records = holdings.reduce((result, holding) => {
    result[firebaseHoldingKey(holding)] = {
      market: holding.market,
      symbol: holding.symbol,
      name: holding.name,
      shares: holding.shares,
      averageCost: holding.averageCost,
      price: holding.price,
      previousClose: holding.previousClose
    };
    return result;
  }, {});
  return set(ref(database, userPath(uid, "holdings")), Object.keys(records).length ? records : null);
}

export function saveCashBalances(uid, cash) {
  return set(ref(database, userPath(uid, "cash")), {
    twd: cash.twd,
    usd: cash.usd,
    updatedAt: serverTimestamp()
  });
}

export function saveManualAssetRecord(uid, localDate, totalAssetsTwd) {
  return set(ref(database, userPath(uid, `snapshots/${localDate}_manual`)), {
    localDate,
    slot: "manual",
    source: "manual",
    total: { totalAssetsTwd },
    createdAt: serverTimestamp()
  });
}

export function saveTransaction(uid, transaction) {
  const transactionRef = push(ref(database, userPath(uid, "transactions")));
  return set(transactionRef, {
    market: transaction.market,
    year: transaction.year,
    symbol: transaction.symbol,
    name: transaction.name,
    profit: transaction.profit,
    profitRate: transaction.profitRate,
    sellPrice: transaction.sellPrice,
    createdAt: serverTimestamp()
  });
}

export function deleteTransaction(uid, transactionId) {
  return remove(ref(database, userPath(uid, `transactions/${transactionId}`)));
}

export function saveAnnualSummary(uid, record) {
  const summaryRef = push(ref(database, userPath(uid, "annualSummaries")));
  return set(summaryRef, {
    label: record.label,
    twProfit: record.twProfit,
    dividend: record.dividend,
    twReturnRate: record.twReturnRate,
    usProfitUsd: record.usProfitUsd,
    usReturnRate: record.usReturnRate,
    usProfitTwd: record.usProfitTwd,
    order: record.order,
    createdAt: serverTimestamp()
  });
}

export function updateAnnualSummary(uid, recordId, record) {
  return update(ref(database, userPath(uid, `annualSummaries/${recordId}`)), {
    label: record.label,
    twProfit: record.twProfit,
    dividend: record.dividend,
    twReturnRate: record.twReturnRate,
    usProfitUsd: record.usProfitUsd,
    usReturnRate: record.usReturnRate,
    usProfitTwd: record.usProfitTwd,
    order: record.order,
    updatedAt: serverTimestamp()
  });
}

export function deleteAnnualSummary(uid, recordId) {
  return remove(ref(database, userPath(uid, `annualSummaries/${recordId}`)));
}

export async function createSnapshotIfMissing(uid, snapshotId, snapshot) {
  const snapshotRef = ref(database, userPath(uid, `snapshots/${snapshotId}`));
  const result = await runTransaction(snapshotRef, currentValue => {
    if (currentValue !== null) return;
    return { ...snapshot, createdAt: serverTimestamp() };
  }, { applyLocally: false });
  return result.committed;
}

export function replaceSnapshot(uid, snapshotId, snapshot) {
  return set(ref(database, userPath(uid, `snapshots/${snapshotId}`)), {
    ...snapshot,
    createdAt: serverTimestamp()
  });
}
