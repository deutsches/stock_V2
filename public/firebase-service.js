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
  ref,
  runTransaction,
  serverTimestamp,
  set
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

export async function createSnapshotIfMissing(uid, snapshotId, snapshot) {
  const snapshotRef = ref(database, userPath(uid, `snapshots/${snapshotId}`));
  const result = await runTransaction(snapshotRef, currentValue => {
    if (currentValue !== null) return;
    return { ...snapshot, createdAt: serverTimestamp() };
  }, { applyLocally: false });
  return result.committed;
}
