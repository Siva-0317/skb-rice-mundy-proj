import { collection, doc, getDocs, getDoc, setDoc, query, orderBy, serverTimestamp, runTransaction, limit, limitToLast, startAfter, startAt, endBefore, where } from "firebase/firestore";
import { db } from "./config";

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

export const getSupplierLedgerPaginated = async (id, {
  pageSize = 20,
  direction = 'initial',
  firstDoc = null,
  lastDoc = null,
  targetCursor = null
} = {}) => {
  const ledgerColRef = collection(db, "suppliers", id, "ledger");
  const allSnap = await getDocs(query(ledgerColRef));
  const totalCount = allSnap.size;

  const constraints = [orderBy("date", "desc")];
  if (direction === 'next' && lastDoc) {
    constraints.push(startAfter(lastDoc));
    constraints.push(limit(pageSize));
  } else if (direction === 'prev' && targetCursor) {
    constraints.push(startAt(targetCursor));
    constraints.push(limit(pageSize));
  } else if (direction === 'prev' && firstDoc && !targetCursor) {
    constraints.push(endBefore(firstDoc));
    constraints.push(limitToLast(pageSize));
  } else {
    constraints.push(limit(pageSize));
  }

  const q = query(ledgerColRef, ...constraints);
  const snap = await getDocs(q);
  const entries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  return {
    entries,
    firstDoc: snap.docs.length > 0 ? snap.docs[0] : null,
    lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    totalCount
  };
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
  if (numAmount <= 0) throw new Error("Payment amount must be greater than 0");

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

