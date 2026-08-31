import { collection, doc, getDocs, getDoc, setDoc, query, orderBy, serverTimestamp, runTransaction, where, writeBatch, deleteDoc, increment } from "firebase/firestore";
import { db } from "./config";
import { toMillis } from "../utils/dateIST";

export const getCustomers = async () => {
  const q = query(collection(db, "customers"), orderBy("createdAt", "desc"));
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

// Ledger entries are sorted by business date first (most recent day on top, like a
// bank statement), then by actual recording time as a tiebreaker for same-day entries —
// this keeps same-day sale/payment order correct even though sales and payments can be
// backdated to any business date independently of when they were entered. A final `seq`
// tiebreak handles entries written in the same transaction (e.g. a sale plus its
// auto-applied excess payment) — these share the exact same createdAt server timestamp,
// so seq is the only signal that the excess payment happened logically after its sale.
export const getCustomerLedgerPaginated = async (id, { pageSize = 20, page = 1 } = {}) => {
  const ledgerColRef = collection(db, "customers", id, "ledger");
  const snap = await getDocs(query(ledgerColRef));
  const entries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  entries.sort((a, b) => {
    const dateDiff = toMillis(b.date) - toMillis(a.date);
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = toMillis(b.createdAt) - toMillis(a.createdAt);
    if (createdDiff !== 0) return createdDiff;
    return (Number(b.seq) || 0) - (Number(a.seq) || 0);
  });

  const totalCount = entries.length;
  const start = (page - 1) * pageSize;
  const pageEntries = entries.slice(start, start + pageSize);

  return { entries: pageEntries, totalCount };
};

// Global ledger: every customer's ledger entries merged into a single chronological
// stream with a business-wide running balance. Unlike the per-customer ledger, the
// stored `balanceAfter` (which is per-customer) is ignored — we recompute a fresh
// running total of debit − credit across ALL customers, oldest → newest. The most
// recent running balance therefore equals total receivables across the business,
// which ties out to the Dashboard's Total Outstanding.
export const getGlobalLedger = async () => {
  const customersSnap = await getDocs(collection(db, "customers"));
  const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const fetchPromises = customers.map(async c => {
    const ledgerSnap = await getDocs(collection(db, "customers", c.id, "ledger"));
    return ledgerSnap.docs.map(d => ({ id: d.id, customerId: c.id, customerName: c.name || '—', ...d.data() }));
  });

  const allArrays = await Promise.all(fetchPromises);
  const all = allArrays.flat();

  // Oldest → newest so the cumulative balance builds up correctly.
  all.sort((a, b) => {
    const dateDiff = toMillis(a.date) - toMillis(b.date);
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = toMillis(a.createdAt) - toMillis(b.createdAt);
    if (createdDiff !== 0) return createdDiff;
    const seqDiff = (Number(a.seq) || 0) - (Number(b.seq) || 0);
    if (seqDiff !== 0) return seqDiff;
    if (a.customerName !== b.customerName) return a.customerName < b.customerName ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  let running = 0;
  for (const e of all) {
    running += (Number(e.debit) || 0) - (Number(e.credit) || 0);
    e.globalBalanceAfter = running;
  }

  // Newest first for display (bank-statement style).
  all.reverse();
  return all;
};

export const addCustomer = async ({ name, mobile, openingBalance }) => {
  const numBalance = Number(openingBalance) || 0;
  const cleanMobile = (mobile !== undefined && mobile !== null) ? String(mobile).trim() : '';
  const cleanName = (name || '').trim();

  if (!cleanName) throw new Error("Customer name is required.");

  // Check for duplicates
  const allCustomersSnap = await getDocs(collection(db, "customers"));
  const duplicateName = allCustomersSnap.docs.find(d => {
    return (d.data().name || '').trim().toLowerCase() === cleanName.toLowerCase();
  });
  if (duplicateName) {
    throw new Error("Customer with this name already exists.");
  }

  if (cleanMobile) {
    const duplicateMobile = allCustomersSnap.docs.find(d => {
      return (d.data().mobile || '').trim() === cleanMobile;
    });
    if (duplicateMobile) {
      throw new Error("Customer with this mobile already exists.");
    }
  }
  
  const customerRef = doc(collection(db, "customers"));
  
  await setDoc(customerRef, {
    name: cleanName,
    mobile: cleanMobile,
    balance: numBalance,
    txnCount: numBalance > 0 ? 1 : 0,
    createdAt: serverTimestamp()
  });

  if (numBalance > 0) {
    const ledgerRef = doc(collection(db, "customers", customerRef.id, "ledger"));
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    await setDoc(ledgerRef, {
      type: 'opening',
      desc: 'Opening balance',
      debit: numBalance,
      credit: 0,
      balanceAfter: numBalance,
      date: midnight,
      createdAt: serverTimestamp(),
      seq: -1
    });
  }

  return customerRef.id;
};

export const updateCustomer = async (id, { name, mobile }) => {
  const cleanMobile = (mobile !== undefined && mobile !== null) ? String(mobile).trim() : '';
  const cleanName = (name || '').trim();

  if (!cleanName) throw new Error("Customer name is required.");

  // Check for duplicates excluding current customer
  const allCustomersSnap = await getDocs(collection(db, "customers"));
  const duplicateName = allCustomersSnap.docs.find(d => {
    if (d.id === id) return false;
    return (d.data().name || '').trim().toLowerCase() === cleanName.toLowerCase();
  });
  if (duplicateName) {
    throw new Error("Customer with this name already exists.");
  }

  if (cleanMobile) {
    const duplicateMobile = allCustomersSnap.docs.find(d => {
      if (d.id === id) return false;
      return (d.data().mobile || '').trim() === cleanMobile;
    });
    if (duplicateMobile) {
      throw new Error("Customer with this mobile already exists.");
    }
  }

  const customerRef = doc(db, "customers", id);
  const customerSnap = await getDoc(customerRef);
  if (!customerSnap.exists()) throw new Error("Customer not found");
  
  const oldName = customerSnap.data().name;

  await setDoc(customerRef, {
    name: cleanName,
    mobile: cleanMobile,
  }, { merge: true });

  if (oldName !== cleanName) {
    // Update all sales for this customer
    const salesQ = query(collection(db, "sales"), where("customerId", "==", id));
    const salesSnap = await getDocs(salesQ);
    
    if (!salesSnap.empty) {
      const batch = writeBatch(db);
      salesSnap.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { customerName: cleanName });
      });
      await batch.commit();
    }
  }
};

export const deleteCustomer = async (customerId) => {
  let deletedLedgerEntries = 0;
  let deletedSales = 0;

  // Helper to chunk arrays
  const chunkArray = (arr, size) => {
    const chunks = [];
    for(let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  // 1. Delete ledger entries in batches
  const ledgerRef = collection(db, "customers", customerId, "ledger");
  const ledgerSnap = await getDocs(ledgerRef);
  
  const ledgerChunks = chunkArray(ledgerSnap.docs, 500);
  for (const chunk of ledgerChunks) {
    const batch = writeBatch(db);
    chunk.forEach(d => {
      batch.delete(d.ref);
      deletedLedgerEntries++;
    });
    await batch.commit();
  }

  // 2. Process Sales (reverse stock and delete sale docs)
  const salesQuery = query(collection(db, "sales"), where("customerId", "==", customerId));
  const salesSnap = await getDocs(salesQuery);

  // Collect total bags to add back per itemId
  const itemRestorations = {};
  
  salesSnap.docs.forEach(saleDoc => {
    const data = saleDoc.data();
    const itemsArray = data.items || data.rows || [];
    if (Array.isArray(itemsArray)) {
      itemsArray.forEach(row => {
        if (row.itemId && row.bags) {
          itemRestorations[row.itemId] = (itemRestorations[row.itemId] || 0) + Number(row.bags);
        }
      });
    }
  });

  // Verify which items still exist before attempting to increment
  const existingItemUpdates = {};
  for (const itemId of Object.keys(itemRestorations)) {
    const itemRef = doc(db, "items", itemId);
    const itemDoc = await getDoc(itemRef);
    if (itemDoc.exists()) {
      existingItemUpdates[itemId] = itemRestorations[itemId];
    }
  }

  // Batch delete sales and update items
  const saleOps = salesSnap.docs.map(d => ({ type: 'delete', ref: d.ref }));
  const itemOps = Object.keys(existingItemUpdates).map(itemId => ({ 
    type: 'update', 
    ref: doc(db, "items", itemId), 
    bags: existingItemUpdates[itemId] 
  }));

  const allOps = [...itemOps, ...saleOps];
  const opsChunks = chunkArray(allOps, 500);

  for (const chunk of opsChunks) {
    const batch = writeBatch(db);
    chunk.forEach(op => {
      if (op.type === 'delete') {
        batch.delete(op.ref);
        deletedSales++;
      } else if (op.type === 'update') {
        batch.update(op.ref, { 
          stock: increment(op.bags),
          updatedAt: serverTimestamp() 
        });
      }
    });
    await batch.commit();
  }

  // 3. Delete customer document
  const customerRef = doc(db, "customers", customerId);
  await deleteDoc(customerRef);

  return { deletedLedgerEntries, deletedSales, customerId };
};

export const recordPayment = async (customerId, paymentData) => {
  const amount = typeof paymentData === 'object' && paymentData !== null ? paymentData.amount : paymentData;
  const mode = typeof paymentData === 'object' && paymentData !== null && paymentData.mode ? paymentData.mode : 'Cash';
  const customDate = typeof paymentData === 'object' && paymentData !== null && paymentData.date ? new Date(paymentData.date) : null;

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) throw new Error("Payment amount must be greater than 0");

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

