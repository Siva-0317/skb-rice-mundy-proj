import { doc, collection, getDocs, query, orderBy, limit, where, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

export const getNextPurchaseBill = async () => {
  const counterRef = doc(db, "counters", "billCounters");
  const snap = await runTransaction(db, async (t) => {
    const d = await t.get(counterRef);
    if (!d.exists()) return 1;
    return d.data().nextPurchaseBill || 1;
  });
  return 'PUR-2026-' + String(snap).padStart(4, '0');
};

export const getRecentPurchases = async () => {
  const q = query(collection(db, "purchases"), orderBy("date", "desc"), limit(10));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const createPurchase = async ({ supplierId, supplierName, date, advance, remarks, rows }) => {
  const numAdvance = Number(advance) || 0;
  let computedTotal = 0;
  
  const enrichedRows = rows.map(r => {
    const amount = Number(r.bags) * Number(r.rate);
    computedTotal += amount;
    return { ...r, amount };
  });
  computedTotal -= numAdvance;

  const purchaseRef = doc(collection(db, "purchases"));
  const counterRef = doc(db, "counters", "billCounters");
  const supplierRef = doc(db, "suppliers", supplierId);
  const newLedgerRef = doc(collection(db, "suppliers", supplierId, "ledger"));

  const finalBillNo = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const nextPurchaseBill = counterDoc.exists() ? (counterDoc.data().nextPurchaseBill || 1) : 1;
    const billNo = 'PUR-2026-' + String(nextPurchaseBill).padStart(4, '0');

    const supplierDoc = await transaction.get(supplierRef);
    if (!supplierDoc.exists()) {
      throw new Error("Supplier not found.");
    }
    const currentBalance = supplierDoc.data().balance || 0;
    const currentTxnCount = supplierDoc.data().txnCount || 0;
    const newBalance = currentBalance + computedTotal; // increases what we owe

    const itemRefs = enrichedRows.map(r => doc(db, "items", r.itemId));
    const itemDocs = [];
    for (let ref of itemRefs) {
      itemDocs.push(await transaction.get(ref));
    }

    // Create Purchase Doc
    transaction.set(purchaseRef, {
      billNo,
      supplierId,
      supplierName,
      date: new Date(date),
      advance: numAdvance,
      remarks,
      items: enrichedRows,
      totalAmount: computedTotal,
      createdAt: serverTimestamp()
    });

    // Create Ledger Entry - Purchase increases our payable balance, which is a Credit
    transaction.set(newLedgerRef, {
      type: 'purchase',
      desc: 'Bill ' + billNo,
      debit: 0,
      credit: computedTotal,
      balanceAfter: newBalance,
      date: serverTimestamp(),
      refId: purchaseRef.id
    });

    // Update Supplier
    transaction.update(supplierRef, {
      balance: newBalance,
      lastPurchase: serverTimestamp(),
      txnCount: currentTxnCount + 1
    });

    // Update Items Stock (Increment)
    enrichedRows.forEach((row, i) => {
      const itemDoc = itemDocs[i];
      if (itemDoc.exists()) {
        const currentStock = itemDoc.data().stock || 0;
        transaction.update(itemRefs[i], {
          stock: currentStock + Number(row.bags)
        });
      }
    });

    // Update Counters
    transaction.set(counterRef, {
      nextPurchaseBill: nextPurchaseBill + 1
    }, { merge: true });

    return billNo;
  });

  return finalBillNo;
};

export const editPurchase = async (purchaseId, updatedData, uid) => {
  const { supplierId: newSupplierId, supplierName: newSupplierName, date, advance, remarks, rows } = updatedData;
  const numAdvance = Number(advance) || 0;
  let computedNewTotal = 0;
  
  const enrichedRows = rows.map(r => {
    const amount = Number(r.bags) * Number(r.rate);
    computedNewTotal += amount;
    return { ...r, amount };
  });
  computedNewTotal -= numAdvance;

  const purchaseRef = doc(db, "purchases", purchaseId);

  return await runTransaction(db, async (transaction) => {
    // 1. READS
    const oldPurchaseDoc = await transaction.get(purchaseRef);
    if (!oldPurchaseDoc.exists()) {
      throw new Error("Purchase bill not found.");
    }
    const oldPurchase = oldPurchaseDoc.data();
    const oldSupplierId = oldPurchase.supplierId;
    const oldNumAdvance = Number(oldPurchase.advance) || 0;
    
    let computedOldTotal = 0;
    if (oldPurchase.items && Array.isArray(oldPurchase.items)) {
      oldPurchase.items.forEach(r => {
        computedOldTotal += (Number(r.bags) || 0) * (Number(r.rate) || 0);
      });
    }
    computedOldTotal -= oldNumAdvance;

    const oldSupplierRef = doc(db, "suppliers", oldSupplierId);
    const oldSupplierDoc = await transaction.get(oldSupplierRef);
    if (!oldSupplierDoc.exists()) {
      throw new Error("Original supplier not found.");
    }

    let newSupplierRef = oldSupplierRef;
    let newSupplierDoc = oldSupplierDoc;
    if (newSupplierId !== oldSupplierId) {
      newSupplierRef = doc(db, "suppliers", newSupplierId);
      newSupplierDoc = await transaction.get(newSupplierRef);
      if (!newSupplierDoc.exists()) {
        throw new Error("New supplier not found.");
      }
    }

    // Net stock differences: old purchase added stock (- when reverting), new purchase adds stock (+ when applying)
    const itemNetDelta = new Map();
    if (oldPurchase.items && Array.isArray(oldPurchase.items)) {
      oldPurchase.items.forEach(r => {
        if (r.itemId) {
          itemNetDelta.set(r.itemId, (itemNetDelta.get(r.itemId) || 0) - (Number(r.bags) || 0));
        }
      });
    }
    enrichedRows.forEach(r => {
      if (r.itemId) {
        itemNetDelta.set(r.itemId, (itemNetDelta.get(r.itemId) || 0) + (Number(r.bags) || 0));
      }
    });

    const uniqueItemIds = Array.from(itemNetDelta.keys()).filter(Boolean);
    const itemDocsMap = new Map();
    for (const itemId of uniqueItemIds) {
      const itemRef = doc(db, "items", itemId);
      itemDocsMap.set(itemId, { ref: itemRef, doc: await transaction.get(itemRef) });
    }

    const ledgerQuery = query(collection(db, "suppliers", oldSupplierId, "ledger"), where("refId", "==", purchaseId));
    const ledgerSnap = await transaction.get(ledgerQuery);

    // 2. WRITES
    // Stock updates
    itemDocsMap.forEach(({ ref, doc: snap }, itemId) => {
      if (snap.exists()) {
        const delta = itemNetDelta.get(itemId) || 0;
        if (delta !== 0) {
          const currentStock = snap.data().stock || 0;
          transaction.update(ref, { stock: currentStock + delta });
        }
      }
    });

    // Supplier balance and Ledger updates
    if (newSupplierId === oldSupplierId) {
      const currentBalance = oldSupplierDoc.data().balance || 0;
      const balanceAfter = currentBalance + (computedNewTotal - computedOldTotal);
      transaction.update(oldSupplierRef, { balance: balanceAfter });

      if (!ledgerSnap.empty) {
        transaction.update(ledgerSnap.docs[0].ref, {
          desc: `Bill ${oldPurchase.billNo} (edited)`,
          credit: computedNewTotal,
          balanceAfter: balanceAfter
        });
      }
    } else {
      const oldSuppBalance = (oldSupplierDoc.data().balance || 0) - computedOldTotal;
      transaction.update(oldSupplierRef, { balance: oldSuppBalance });

      if (!ledgerSnap.empty) {
        transaction.update(ledgerSnap.docs[0].ref, {
          credit: 0,
          desc: `Bill ${oldPurchase.billNo} (moved to ${newSupplierName})`,
          balanceAfter: oldSuppBalance
        });
      }

      const newSuppBalance = (newSupplierDoc.data().balance || 0) + computedNewTotal;
      transaction.update(newSupplierRef, { balance: newSuppBalance });

      const freshLedgerRef = doc(collection(db, "suppliers", newSupplierId, "ledger"));
      transaction.set(freshLedgerRef, {
        type: 'purchase',
        desc: `Bill ${oldPurchase.billNo}`,
        debit: 0,
        credit: computedNewTotal,
        balanceAfter: newSuppBalance,
        date: serverTimestamp(),
        refId: purchaseId
      });
    }

    // Update purchase doc
    transaction.update(purchaseRef, {
      supplierId: newSupplierId,
      supplierName: newSupplierName,
      date: new Date(date),
      advance: numAdvance,
      remarks,
      items: enrichedRows,
      totalAmount: computedNewTotal,
      editedAt: serverTimestamp(),
      editedBy: uid || null
    });

    return oldPurchase.billNo;
  });
};
