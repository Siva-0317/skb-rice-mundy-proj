import { collection, doc, getDocs, getDoc, setDoc, query, orderBy, serverTimestamp, runTransaction, limit, limitToLast, startAfter, startAt, endBefore, where } from "firebase/firestore";
import { db } from "./config";

export const getCustomers = async () => {
  const q = query(collection(db, "customers"), orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getCustomer = async (id) => {
  const docRef = doc(db, "customers", id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error("Customer not found");
  return { id: snapshot.id, ...snapshot.data() };
};

export const getCustomerLedger = async (id) => {
  const q = query(collection(db, "customers", id, "ledger"), orderBy("date", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getCustomerLedgerPaginated = async (id, {
  pageSize = 20,
  direction = 'initial',
  firstDoc = null,
  lastDoc = null,
  targetCursor = null
} = {}) => {
  const ledgerColRef = collection(db, "customers", id, "ledger");
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

export const addCustomer = async ({ name, mobile, openingBalance }) => {
  const numBalance = Number(openingBalance) || 0;
  const cleanMobile = (mobile !== undefined && mobile !== null) ? String(mobile).trim() : '';
  
  const customerRef = doc(collection(db, "customers"));
  
  await setDoc(customerRef, {
    name,
    mobile: cleanMobile,
    balance: numBalance,
    txnCount: numBalance > 0 ? 1 : 0,
    createdAt: serverTimestamp()
  });

  if (numBalance > 0) {
    const ledgerRef = doc(collection(db, "customers", customerRef.id, "ledger"));
    await setDoc(ledgerRef, {
      type: 'opening',
      desc: 'Opening balance',
      debit: numBalance,
      credit: 0,
      balanceAfter: numBalance,
      date: serverTimestamp()
    });
  }

  return customerRef.id;
};

export const recordPayment = async (customerId, paymentData) => {
  const amount = typeof paymentData === 'object' && paymentData !== null ? paymentData.amount : paymentData;
  const mode = typeof paymentData === 'object' && paymentData !== null && paymentData.mode ? paymentData.mode : 'Cash';
  const customDate = typeof paymentData === 'object' && paymentData !== null && paymentData.date ? new Date(paymentData.date) : null;

  const numAmount = Number(amount);
  if (numAmount <= 0) throw new Error("Payment amount must be greater than 0");

  // Auto-built description — no free text
  const desc = `Payment received · ${mode}`;

  const customerRef = doc(db, "customers", customerId);
  const newLedgerRef = doc(collection(db, "customers", customerId, "ledger"));

  await runTransaction(db, async (transaction) => {
    const customerDoc = await transaction.get(customerRef);
    if (!customerDoc.exists()) {
      throw new Error("Customer does not exist!");
    }

    const currentBalance = customerDoc.data().balance || 0;
    const currentTxnCount = customerDoc.data().txnCount || 0;
    const newBalance = currentBalance - numAmount;

    transaction.set(newLedgerRef, {
      type: 'payment',
      desc,
      mode,
      debit: 0,
      credit: numAmount,
      balanceAfter: newBalance,
      date: customDate || serverTimestamp(),
      createdAt: serverTimestamp()
    });

    transaction.update(customerRef, {
      balance: newBalance,
      lastPayment: customDate || serverTimestamp(),
      txnCount: currentTxnCount + 1
    });
  });
};

