import { collection, doc, getDocs, getDoc, setDoc, query, orderBy, where, limit, serverTimestamp, runTransaction, writeBatch, deleteDoc } from "firebase/firestore";
import { db } from "./config";
import { fetchOpenPurchaseRefs, readPurchaseDocs, planAllocation, applyPatches, describeAllocations } from "./supplierAllocations";
import { withRunningBalance } from "../utils/ledgerBalance";

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
  // Derived, not stored — same reasoning as the customer statement.
  const entries = withRunningBalance(
    snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  );

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

  const supplierRef = doc(db, "suppliers", supplierId);
  const newLedgerRef = doc(collection(db, "suppliers", supplierId, "ledger"));

  // Open bills are read before the transaction opens (a collection query inside
  // runTransaction can hang — see ledger.js). The docs themselves are re-read
  // inside so the allocation works from committed figures.
  const openRefs = await fetchOpenPurchaseRefs(supplierId);

  return await runTransaction(db, async (transaction) => {
    // Reads
    const supplierDoc = await transaction.get(supplierRef);
    if (!supplierDoc.exists()) {
      throw new Error("Supplier does not exist!");
    }
    const purchaseDocs = await readPurchaseDocs(transaction, openRefs);

    // Compute
    const currentBalance = supplierDoc.data().balance || 0;
    const currentTxnCount = supplierDoc.data().txnCount || 0;
    const newBalance = currentBalance - numAmount;
    const { allocations, patches } = planAllocation(purchaseDocs, numAmount);
    const paymentDate = dateVal || serverTimestamp();
    // Auto-built description — no free text
    const desc = `Payment made · ${mode}` + describeAllocations(allocations);

    // Writes
    transaction.set(newLedgerRef, {
      type: 'payment',
      desc,
      mode,
      debit: 0,
      credit: numAmount,
      balanceAfter: newBalance,
      allocations,
      date: paymentDate,
      createdAt: serverTimestamp()
    });

    applyPatches(transaction, patches, { date: dateVal || new Date(), mode, serverTimestamp });

    transaction.update(supplierRef, {
      balance: newBalance,
      lastPayment: paymentDate,
      txnCount: currentTxnCount + 1
    });

    return { allocations, newBalance };
  });
};

export const deleteSupplier = async (supplierId) => {
  const supplierRef = doc(db, "suppliers", supplierId);
  const supplierSnap = await getDoc(supplierRef);
  if (!supplierSnap.exists()) throw new Error("Supplier not found");

  const supplierName = supplierSnap.data().name || 'Unknown Supplier';

  // A supplier that appears on a purchase is part of the audit trail — removing
  // them would leave those bills pointing at nothing. Mirrors deleteItem.
  const purchasesQ = query(collection(db, "purchases"), where("supplierId", "==", supplierId), limit(1));
  const purchasesSnap = await getDocs(purchasesQ);
  if (!purchasesSnap.empty) {
    throw new Error(`Cannot delete '${supplierName}' — it has existing purchase records.`);
  }

  // Clear the (payments-only) ledger, then the supplier document itself.
  const ledgerSnap = await getDocs(collection(db, "suppliers", supplierId, "ledger"));
  if (!ledgerSnap.empty) {
    for (let i = 0; i < ledgerSnap.docs.length; i += 500) {
      const batch = writeBatch(db);
      ledgerSnap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }

  await deleteDoc(supplierRef);
  return { deleted: true, supplierId, supplierName };
};
