import { collection, doc, getDocs, getDoc, setDoc, query, orderBy, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "./config";
import { toMillis } from "../utils/dateIST";

export const getSuppliers = async () => {
  const q = query(collection(db, "suppliers"), orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getSupplier = async (id) => {
  const docRef = doc(db, "suppliers", id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error("Supplier not found");
  return { id: snapshot.id, ...snapshot.data() };
};

export const getSupplierLedger = async (id) => {
  const q = query(collection(db, "suppliers", id, "ledger"), orderBy("date", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Ledger entries are sorted by business date first (most recent day on top, like a
// bank statement), then by actual recording time as a tiebreaker for same-day entries —
// mirrors the fix applied to the customer ledger (see firebase/customers.js).
export const getSupplierLedgerPaginated = async (id, { pageSize = 20, page = 1 } = {}) => {
  const ledgerColRef = collection(db, "suppliers", id, "ledger");
  const snap = await getDocs(query(ledgerColRef));
  const entries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  entries.sort((a, b) => {
    const dateDiff = toMillis(b.date) - toMillis(a.date);
    if (dateDiff !== 0) return dateDiff;
    return toMillis(b.createdAt) - toMillis(a.createdAt);
  });

  const totalCount = entries.length;
  const start = (page - 1) * pageSize;
  const pageEntries = entries.slice(start, start + pageSize);

  return { entries: pageEntries, totalCount };
};

export const addSupplier = async ({ name, phone, location = '', supplyCategories = [], notes = '', categories = '' }) => {
  const supplierRef = doc(collection(db, "suppliers"));
  
  await setDoc(supplierRef, {
    name,
    phone,
    location,
    supplyCategories,
    categories,
    notes,
    createdAt: serverTimestamp()
  });

  return supplierRef.id;
};

export const updateSupplier = async (id, { name, phone, location = '', supplyCategories = [], notes = '', categories = '' }) => {
  const supplierRef = doc(db, "suppliers", id);
  await setDoc(supplierRef, {
    name,
    phone,
    location,
    supplyCategories,
    categories,
    notes,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

export const editSupplier = updateSupplier;

export const recordSupplierPayment = async (supplierId, paymentData) => {
  const amount = typeof paymentData === 'object' && paymentData !== null ? paymentData.amount : paymentData;
  const mode = typeof paymentData === 'object' && paymentData !== null && paymentData.mode ? paymentData.mode : 'Cash';
  const dateVal = typeof paymentData === 'object' && paymentData !== null && paymentData.date ? new Date(paymentData.date) : null;

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) throw new Error("Payment amount must be greater than 0");

  // Auto-built description — no free text
  const desc = `Payment made · ${mode}`;

  const supplierRef = doc(db, "suppliers", supplierId);
  const newLedgerRef = doc(collection(db, "suppliers", supplierId, "ledger"));

  await runTransaction(db, async (transaction) => {
    const supplierDoc = await transaction.get(supplierRef);
    if (!supplierDoc.exists()) {
      throw new Error("Supplier does not exist!");
    }

    const currentBalance = supplierDoc.data().balance || 0;
    const currentTxnCount = supplierDoc.data().txnCount || 0;
    const newBalance = currentBalance - numAmount;

    transaction.set(newLedgerRef, {
      type: 'payment',
      desc,
      mode,
      debit: 0,
      credit: numAmount,
      balanceAfter: newBalance,
      date: dateVal || serverTimestamp(),
      createdAt: serverTimestamp()
    });

    transaction.update(supplierRef, {
      balance: newBalance,
      lastPayment: dateVal || serverTimestamp(),
      txnCount: currentTxnCount + 1
    });
  });
};

