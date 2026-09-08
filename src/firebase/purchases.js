import { doc, collection, getDocs, getDoc, query, orderBy, limit, where, runTransaction, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./config";
import { getISTTodayDateString, sortByDateThenCreatedAt } from "../utils/dateIST";
import { describeAllocations } from "./supplierAllocations";

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
  // Step 1: Read the purchase doc OUTSIDE the transaction first to get
  // the data needed to know what else to read inside the transaction.
  const purchaseSnap = await getDoc(doc(db, 'purchases', purchaseId));
  if (!purchaseSnap.exists()) throw new Error('Purchase record not found.');
  const purchase = purchaseSnap.data();

  const result = await runTransaction(db, async (transaction) => {
    // ── PHASE 1: ALL READS ──────────────────────────────────────────────
    
    // Read the purchase doc again inside transaction (for consistency)
    const purchaseRef = doc(db, 'purchases', purchaseId);
    const purchaseDoc = await transaction.get(purchaseRef);

    // Read the supplier doc
    const supplierRef = doc(db, 'suppliers', purchase.supplierId);
    const supplierDoc = await transaction.get(supplierRef);

    // Read ALL item docs that this purchase affected
    const itemRefs = {};
    const itemDocs = {};
    const rows = purchase.rows && Array.isArray(purchase.rows) 
      ? purchase.rows 
      : [{ itemId: purchase.itemId, bags: purchase.bags }];
      
    for (const row of rows) {
      if (row.itemId && !itemRefs[row.itemId]) {
        itemRefs[row.itemId] = doc(db, 'items', row.itemId);
        itemDocs[row.itemId] = await transaction.get(itemRefs[row.itemId]);
      }
    }

    // ── PHASE 2: COMPUTE ────────────────────────────────────────────────
    
    const pData = purchaseDoc.data();
    const total = pData.total || pData.totalAmount || 0;
    const amountPaid = pData.amountPaid || 0;
    // The part of amountPaid that came from supplier-level payments. Those
    // payments are real money and stay on the supplier's ledger as credit, so
    // they must not be added back when the bill goes; only the bill-level
    // payments (whose ledger rows are deleted below) are reversed.
    const paidViaSupplier = Math.min(amountPaid, Number(pData.amountPaidViaSupplier || 0));

    const supplierData = supplierDoc.exists() ? supplierDoc.data() : {};
    const currentSupplierBalance = supplierData.balance || 0;

    // Reversing the purchase: remove the debt (total) and also remove the
    // bill-level payments already made, since we're erasing the whole bill.
    const newSupplierBalance = currentSupplierBalance - total + (amountPaid - paidViaSupplier);

    // Compute new stock for each item (reduce by the bags that were added)
    const newStocks = {};
    const pRows = pData.rows && Array.isArray(pData.rows) 
      ? pData.rows 
      : [{ itemId: pData.itemId, bags: pData.bags }];
      
    for (const row of pRows) {
      if (!row.itemId) continue;
      const itemSnap = itemDocs[row.itemId];
      const currentStock = itemSnap?.exists() ? (itemSnap.data().stock || 0) : 0;
      const bags = Number(row.bags) || 0;
      // Reversing a purchase removes its bags from stock. If some of those bags have
      // already been sold, the stock cannot absorb the reversal: the old code clamped
      // it to zero, which silently lost the shortfall and later left phantom stock
      // when the sale was reversed. Refuse instead and tell the user what to do.
      if (currentStock < bags) {
        const name = itemSnap?.exists() ? (itemSnap.data().name || 'this item') : 'this item';
        throw new Error(
          `Cannot delete: ${bags} bags of ${name} came in on this purchase but only ` +
          `${currentStock} are in stock now (${bags - currentStock} already sold or adjusted). ` +
          `Delete the related sales or adjust the stock first.`
        );
      }
      newStocks[row.itemId] = currentStock - bags;
    }

    // ── PHASE 3: ALL WRITES ─────────────────────────────────────────────
    
    // Delete the purchase doc
    transaction.delete(purchaseRef);

    // Update supplier balance
    if (supplierDoc.exists()) {
      transaction.update(supplierRef, {
        balance: newSupplierBalance,
        updatedAt: serverTimestamp()
      });
    }

    // Update each item's stock
    for (const [itemId, newStock] of Object.entries(newStocks)) {
      if (itemRefs[itemId]) {
        transaction.update(itemRefs[itemId], {
          stock: newStock,
          updatedAt: serverTimestamp()
        });
      }
    }
    
    return { billNo: pData.billNo, supplierId: pData.supplierId };
  });

  // Step 2: After the transaction commits, delete linked supplier ledger entries
  // in a SEPARATE batch
  if (result.billNo && result.supplierId) {
    const ledgerRef = collection(db, "suppliers", result.supplierId, "ledger");
    const q = query(ledgerRef);
    const ledgerSnap = await getDocs(q);
    
    // Rows that belong to the bill (the bill line itself and bill-level
    // payments) are deleted. A supplier-level payment that was merely
    // allocated to this bill is kept — the money was paid — and only its
    // allocation entry for this bill is dropped.
    const docsToDelete = [];
    const docsToUnallocate = [];
    ledgerSnap.docs.forEach(d => {
      const data = d.data();
      const allocs = Array.isArray(data.allocations) ? data.allocations : null;
      if (allocs) {
        if (allocs.some(a => a.purchaseId === purchaseId)) docsToUnallocate.push(d);
        return;
      }
      if ((data.linkedBillNo === result.billNo) || (data.desc && data.desc.includes(result.billNo))) {
        docsToDelete.push(d);
      }
    });

    const ops = [
      ...docsToDelete.map(d => (batch) => batch.delete(d.ref)),
      ...docsToUnallocate.map(d => (batch) => {
        const remaining = d.data().allocations.filter(a => a.purchaseId !== purchaseId);
        const base = String(d.data().desc || '').split(' · applied to ')[0];
        batch.update(d.ref, {
          allocations: remaining,
          desc: base + describeAllocations(remaining),
        });
      }),
    ];
    for (let i = 0; i < ops.length; i += 500) {
      const batch = writeBatch(db);
      ops.slice(i, i + 500).forEach(op => op(batch));
      await batch.commit();
    }
  }

  return { deleted: true, billNo: result.billNo };
};


/**
 * Pre-check used by the delete dialog: returns the item lines whose current stock is
 * lower than the bags that arrived on this purchase (i.e. bags already sold), so the
 * dialog can explain the block before the user tries. Empty array = safe to delete.
 */
export const getPurchaseDeletionBlockers = async (purchase) => {
  const rows = purchase.rows && Array.isArray(purchase.rows)
    ? purchase.rows
    : [{ itemId: purchase.itemId, bags: purchase.bags, itemName: purchase.itemName }];
  const blockers = [];
  for (const row of rows) {
    if (!row.itemId) continue;
    const snap = await getDoc(doc(db, 'items', row.itemId));
    const stock = snap.exists() ? Number(snap.data().stock || 0) : 0;
    const bags = Number(row.bags) || 0;
    if (stock < bags) {
      blockers.push({
        itemId: row.itemId,
        name: snap.exists() ? (snap.data().name || row.itemName || 'item') : (row.itemName || 'item'),
        bags,
        stock,
        shortfall: bags - stock,
      });
    }
  }
  return blockers;
};
