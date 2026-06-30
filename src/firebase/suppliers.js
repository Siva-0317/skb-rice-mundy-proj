import { collection, doc, getDocs, getDoc, setDoc, query, orderBy, serverTimestamp, runTransaction } from "firebase/firestore";
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

export const addSupplier = async ({ name, phone, openingBalance }) => {
  const numBalance = Number(openingBalance) || 0;
  
  const supplierRef = doc(collection(db, "suppliers"));
  
  await setDoc(supplierRef, {
    name,
    phone,
    balance: numBalance,
    status: 'active',
    txnCount: numBalance > 0 ? 1 : 0,
    createdAt: serverTimestamp()
  });

  if (numBalance > 0) {
    const ledgerRef = doc(collection(db, "suppliers", supplierRef.id, "ledger"));
    await setDoc(ledgerRef, {
      type: 'opening',
      desc: 'Opening balance',
      debit: 0,
      credit: numBalance,
      balanceAfter: numBalance,
      date: serverTimestamp()
    });
  }

  return supplierRef.id;
};

export const recordSupplierPayment = async (supplierId, paymentData) => {
  const amount = typeof paymentData === 'object' && paymentData !== null ? paymentData.amount : paymentData;
  const mode = typeof paymentData === 'object' && paymentData !== null && paymentData.mode ? paymentData.mode : 'Cash';
  const note = typeof paymentData === 'object' && paymentData !== null && paymentData.note ? paymentData.note : '';

  const numAmount = Number(amount);
  if (numAmount <= 0) throw new Error("Payment amount must be greater than 0");

  const desc = note?.trim() ? note.trim() : `Payment made (${mode})`;

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
      note: note || '',
      debit: numAmount,
      credit: 0,
      balanceAfter: newBalance,
      date: serverTimestamp()
    });

    transaction.update(supplierRef, {
      balance: newBalance,
      lastPayment: serverTimestamp(),
      txnCount: currentTxnCount + 1
    });
  });
};
