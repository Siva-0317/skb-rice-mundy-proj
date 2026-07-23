import { doc, collection, getDocs, query, orderBy, limit, where, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { getISTTodayDateString, sortByDateThenCreatedAt } from "../utils/dateIST";

export const getRecentPurchases = async () => {
  const q = query(collection(db, "purchases"), orderBy("date", "desc"), limit(15));
  const snap = await getDocs(q);
  const purchases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return sortByDateThenCreatedAt(purchases);
};

export const getPurchasesByMonth = async (year, monthIdx) => {
  const startObj = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0));
  const endObj = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));
  const q = query(
    collection(db, "purchases"),
    where("date", ">=", startObj),
    where("date", "<=", endObj),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  const purchases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return sortByDateThenCreatedAt(purchases);
};

export const getSupplierPurchases = async (supplierId) => {
  const q = query(collection(db, "purchases"), where("supplierId", "==", supplierId));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return sortByDateThenCreatedAt(list);
};

export const createPurchase = async ({
  supplierId,
  supplierName,
  itemId,
  itemName,
  categoryKey,
  bags,
  costPerBag,
  date,
  notes = '',
  uid = null
}) => {
  const numBags = Number(bags) || 0;
  const numCostPerBag = Number(costPerBag) || 0;
  const total = numBags * numCostPerBag;
  const dateObj = new Date(date || getISTTodayDateString());

  const purchaseRef = doc(collection(db, "purchases"));
  const counterRef = doc(db, "counters", "billCounters");
  const supplierRef = doc(db, "suppliers", supplierId);
  const newLedgerRef = doc(collection(db, "suppliers", supplierId, "ledger"));
  const itemRef = doc(db, "items", itemId);

  const finalBillNo = await runTransaction(db, async (transaction) => {
    // 1. Read Counter
    const counterDoc = await transaction.get(counterRef);
    const nextPurchaseBill = counterDoc.exists() ? (counterDoc.data().nextPurchaseBill || 1) : 1;
    const billNo = 'PUR-2026-' + String(nextPurchaseBill).padStart(4, '0');

    // 2. Read Supplier (denormalize phone + location onto purchase doc)
    const supplierDoc = await transaction.get(supplierRef);
    if (!supplierDoc.exists()) {
      throw new Error("Supplier not found.");
    }
    const supplierData = supplierDoc.data();
    const currentBalance = supplierData.balance || 0;
    const currentTxnCount = supplierData.txnCount || 0;
    const newBalance = currentBalance + total;
    const supplierPhone = supplierData.phone || '';
    const supplierLocation = supplierData.location || '';

    // 3. Read Item
    const itemDoc = await transaction.get(itemRef);
    if (!itemDoc.exists()) {
      throw new Error("Item not found.");
    }
    const currentStock = itemDoc.data().stock || 0;
    const newStock = currentStock + numBags;

    // 4. Write Purchase Doc (with denormalized supplier contact info)
    transaction.set(purchaseRef, {
      billNo,
      supplierId,
      supplierName,
      supplierPhone,
      supplierLocation,
      itemId,
      itemName,
      categoryKey,
      bags: numBags,
      costPerBag: numCostPerBag,
      total,
      date: dateObj,
      notes,
      createdAt: serverTimestamp(),
      createdBy: uid || null
    });

    // 5. Update Item Stock
    transaction.update(itemRef, {
      stock: newStock,
      updatedAt: serverTimestamp()
    });

    // 6. Update Supplier Balance & Ledger Entry
    transaction.set(newLedgerRef, {
      type: 'purchase',
      desc: 'Bill ' + billNo,
      debit: total,
      credit: 0,
      balanceAfter: newBalance,
      date: dateObj,
      createdAt: serverTimestamp(),
      refId: purchaseRef.id
    });

    transaction.update(supplierRef, {
      balance: newBalance,
      lastPurchase: serverTimestamp(),
      txnCount: currentTxnCount + 1
    });

    // 7. Update Counter
    transaction.set(counterRef, {
      nextPurchaseBill: nextPurchaseBill + 1
    }, { merge: true });

    return billNo;
  });

  return finalBillNo;
};
