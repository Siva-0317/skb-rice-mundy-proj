import { collection, doc, getDocs, getDoc, setDoc, query, orderBy, serverTimestamp, runTransaction } from "firebase/firestore";
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

export const addCustomer = async ({ name, mobile, openingBalance }) => {
  const numBalance = Number(openingBalance) || 0;
  
  const customerRef = doc(collection(db, "customers"));
  
  await setDoc(customerRef, {
    name,
    mobile,
    balance: numBalance,
    status: 'active',
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

export const recordPayment = async (customerId, amount) => {
  const numAmount = Number(amount);
  if (numAmount <= 0) throw new Error("Payment amount must be greater than 0");

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
      desc: 'Payment received',
      debit: 0,
      credit: numAmount,
      balanceAfter: newBalance,
      date: serverTimestamp()
    });

    transaction.update(customerRef, {
      balance: newBalance,
      lastPayment: serverTimestamp(),
      txnCount: currentTxnCount + 1
    });
  });
};
