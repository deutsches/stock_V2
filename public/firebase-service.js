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
  get,
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
import { applyExchangeCashDelta } from "./exchange-records.js";

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

export function observeSalaryRecords(uid, onData, onError) {
  return onValue(ref(database, userPath(uid, "salaryRecords")), snapshot => {
    onData(snapshot.val());
  }, onError);
}

export function observeExchangeRecords(uid, onData, onError) {
  return onValue(ref(database, userPath(uid, "exchangeRecords")), snapshot => {
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
    linkedToTransactions: record.linkedToTransactions,
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
    linkedToTransactions: record.linkedToTransactions,
    order: record.order,
    updatedAt: serverTimestamp()
  });
}

export function deleteAnnualSummary(uid, recordId) {
  return remove(ref(database, userPath(uid, `annualSummaries/${recordId}`)));
}

function salaryRecordPayload(record) {
  return {
    type: record.type,
    year: record.year,
    month: record.month,
    title: record.title,
    earnings: record.earnings,
    deductions: record.deductions,
    leaveLabel: record.leaveLabel,
    leaveHours: record.leaveHours
  };
}

export function saveSalaryRecord(uid, record) {
  const salaryRef = push(ref(database, userPath(uid, "salaryRecords")));
  return set(salaryRef, { ...salaryRecordPayload(record), createdAt: serverTimestamp() });
}

export function updateSalaryRecord(uid, recordId, record) {
  return update(ref(database, userPath(uid, `salaryRecords/${recordId}`)), {
    ...salaryRecordPayload(record),
    updatedAt: serverTimestamp()
  });
}

export function deleteSalaryRecord(uid, recordId) {
  return remove(ref(database, userPath(uid, `salaryRecords/${recordId}`)));
}

function exchangeRecordPayload(record) {
  return {
    date: record.date,
    usdAmount: record.usdAmount,
    costRate: record.costRate,
    executionRate: record.executionRate,
    twdReceived: record.twdReceived,
    feeTwd: record.feeTwd,
    note: record.note,
    cashApplied: record.cashApplied !== false
  };
}

function exchangeCashFailure(message) {
  const error = new Error(message);
  error.code = "exchange/cash-balance";
  return error;
}

async function commitExchangeCashChange(uid, updater) {
  let failureMessage = "換匯與現金同步失敗，請稍後重試。";
  const userRef = ref(database, userPath(uid));
  // Transactions start from the local cache. Prime the user root first so a
  // cold page load does not briefly treat an existing cash balance as zero.
  await get(userRef);
  const result = await runTransaction(userRef, currentValue => {
    const userData = currentValue && typeof currentValue === "object" ? currentValue : {};
    const outcome = updater(userData);
    if (outcome?.error) {
      failureMessage = outcome.error;
      return;
    }
    return userData;
  }, { applyLocally: false });
  if (!result.committed) throw exchangeCashFailure(failureMessage);
  return result;
}

export function saveExchangeRecord(uid, record) {
  const exchangeRef = push(ref(database, userPath(uid, "exchangeRecords")));
  const recordId = exchangeRef.key;
  return commitExchangeCashChange(uid, userData => {
    const cash = applyExchangeCashDelta(userData.cash, -record.usdAmount, record.twdReceived);
    if (cash.error) return cash;
    userData.cash = { ...cash, updatedAt: serverTimestamp() };
    userData.exchangeRecords = userData.exchangeRecords || {};
    userData.exchangeRecords[recordId] = {
      ...exchangeRecordPayload({ ...record, cashApplied: true }),
      createdAt: serverTimestamp()
    };
    return {};
  });
}

export function updateExchangeRecord(uid, recordId, record) {
  return commitExchangeCashChange(uid, userData => {
    const previous = userData.exchangeRecords?.[recordId];
    if (!previous) return { error: "找不到原本的換匯記錄，請重新整理後再試。" };
    const cashWasApplied = previous.cashApplied === true;
    if (cashWasApplied) {
      const cash = applyExchangeCashDelta(
        userData.cash,
        Number(previous.usdAmount) - record.usdAmount,
        -Number(previous.twdReceived) + record.twdReceived
      );
      if (cash.error) return cash;
      userData.cash = { ...cash, updatedAt: serverTimestamp() };
    }
    userData.exchangeRecords[recordId] = {
      ...previous,
      ...exchangeRecordPayload({ ...record, cashApplied: cashWasApplied }),
      updatedAt: serverTimestamp()
    };
    return {};
  });
}

export function deleteExchangeRecord(uid, recordId) {
  return commitExchangeCashChange(uid, userData => {
    const previous = userData.exchangeRecords?.[recordId];
    if (!previous) return { error: "找不到要刪除的換匯記錄。" };
    if (previous.cashApplied === true) {
      const cash = applyExchangeCashDelta(userData.cash, Number(previous.usdAmount), -Number(previous.twdReceived));
      if (cash.error) return cash;
      userData.cash = { ...cash, updatedAt: serverTimestamp() };
    }
    delete userData.exchangeRecords[recordId];
    if (Object.keys(userData.exchangeRecords).length === 0) delete userData.exchangeRecords;
    return {};
  });
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
