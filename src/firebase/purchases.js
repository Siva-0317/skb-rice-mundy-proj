import { doc, collection, getDocs, getDoc, query, orderBy, limit, where, runTransaction, serverTimestamp, writeBatch } from "firebase/firestore";
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

export const recordPurchasePayment = async (purchaseId, supplierId, { amount, mode, date, note = '' }) => {
  const purchaseRef = doc(db, "purchases", purchaseId);
  const supplierRef = doc(db, "suppliers", supplierId);
  const newLedgerRef = doc(collection(db, "suppliers", supplierId, "ledger"));
  const dateObj = new Date(date || getISTTodayDateString());

  return await runTransaction(db, async (transaction) => {
    // Read purchase
    const purchaseDoc = await transaction.get(purchaseRef);
    if (!purchaseDoc.exists()) throw new Error("Purchase not found");
    const pData = purchaseDoc.data();
    
    // Read supplier
    const supplierDoc = await transaction.get(supplierRef);
    if (!supplierDoc.exists()) throw new Error("Supplier not found");
    const sData = supplierDoc.data();

    // Compute purchase values
    const currentAmountPaid = Number(pData.amountPaid || 0);
    const total = Number(pData.total || pData.totalAmount || 0);
    const newAmountPaid = currentAmountPaid + Number(amount);
    const newBalanceDue = total - newAmountPaid;

    // Compute supplier values
    const supplierBalance = Number(sData.balance || 0);
    const newSupplierBalance = supplierBalance - Number(amount);

    // Write Purchase
    transaction.update(purchaseRef, {
      amountPaid: newAmountPaid,
      balanceDue: newBalanceDue,
      lastPaymentDate: dateObj,
      lastPaymentMode: mode,
      updatedAt: serverTimestamp()
    });

    // Write Ledger Entry
    transaction.set(newLedgerRef, {
      type: 'payment',
      desc: `Payment made · ${mode} · Bill ${pData.billNo}` + (note ? ` · ${note}` : ''),
      debit: 0,
      credit: Number(amount),
      balanceAfter: newSupplierBalance,
      date: dateObj,
      linkedBillNo: pData.billNo,
      createdAt: serverTimestamp()
    });

    // Write Supplier
    transaction.update(supplierRef, {
      balance: newSupplierBalance,
      lastPayment: dateObj,
      updatedAt: serverTimestamp()
    });

    return { newAmountPaid, newBalanceDue, billNo: pData.billNo };
  });
};

export const getPurchasePayments = async (purchaseId) => {
  const purchaseRef = doc(db, "purchases", purchaseId);
  const purchaseDoc = await getDoc(purchaseRef);
  if (!purchaseDoc.exists()) return null;
  const data = purchaseDoc.data();
  return {
    amountPaid: data.amountPaid,
    balanceDue: data.balanceDue,
    lastPaymentDate: data.lastPaymentDate,
    lastPaymentMode: data.lastPaymentMode
  };
};

export const deletePurchase = async (purchaseId) => {
  const purchaseRef = doc(db, "purchases", purchaseId);

  const result = await runTransaction(db, async (transaction) => {
    // 1. Read purchase
    const pDoc = await transaction.get(purchaseRef);
    if (!pDoc.exists()) throw new Error("Purchase not found");
    const pData = pDoc.data();

    // 2. Compute stock reversal
    const itemsToUpdate = [];
    if (pData.rows && Array.isArray(pData.rows)) {
      for (const row of pData.rows) {
        if (row.itemId && row.bags) {
          itemsToUpdate.push({ itemId: row.itemId, bags: Number(row.bags) });
        }
      }
    } else if (pData.itemId && pData.bags) {
      itemsToUpdate.push({ itemId: pData.itemId, bags: Number(pData.bags) });
    }

    // Read all item docs first (transactions must read before write)
    const itemRefs = itemsToUpdate.map(item => doc(db, "items", item.itemId));
    const itemDocs = [];
    for (const ref of itemRefs) {
      itemDocs.push(await transaction.get(ref));
    }

    // 3. Update stock
    for (let i = 0; i < itemsToUpdate.length; i++) {
      const iDoc = itemDocs[i];
      if (iDoc.exists()) {
        const currentStock = Number(iDoc.data().stock || 0);
        const bagsToDeduct = itemsToUpdate[i].bags;
        const newStock = Math.max(0, currentStock - bagsToDeduct);
        transaction.update(iDoc.ref, { stock: newStock });
      }
    }

    // 4. Update Supplier Balance
    const supplierRef = doc(db, "suppliers", pData.supplierId);
    const sDoc = await transaction.get(supplierRef);
    if (sDoc.exists()) {
      const currentBalance = Number(sDoc.data().balance || 0);
      const purchaseTotal = Number(pData.total || pData.totalAmount || 0);
      const amountPaid = Number(pData.amountPaid || 0);
      
      const newBalance = currentBalance - purchaseTotal + amountPaid;
      
      transaction.update(supplierRef, { balance: newBalance });
    }

    // 5. Delete purchase
    transaction.delete(purchaseRef);

    return { billNo: pData.billNo, supplierId: pData.supplierId, itemsCount: itemsToUpdate.length };
  });

  // 6. Delete linked ledger entries (post-transaction)
  if (result.billNo && result.supplierId) {
    const ledgerRef = collection(db, "suppliers", result.supplierId, "ledger");
    const q = query(ledgerRef);
    const ledgerSnap = await getDocs(q);
    
    const docsToDelete = ledgerSnap.docs.filter(d => {
      const data = d.data();
      return (data.linkedBillNo === result.billNo) || 
             (data.desc && data.desc.includes(result.billNo));
    });

    if (docsToDelete.length > 0) {
      const chunks = [];
      for(let i=0; i<docsToDelete.length; i+=500) {
        chunks.push(docsToDelete.slice(i, i+500));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
  }

  return result;
};
