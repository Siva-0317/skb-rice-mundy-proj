import { doc, collection, getDocs, getDoc, query, orderBy, limit, where, runTransaction, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./config";
import { sortByDateThenCreatedAt } from "../utils/dateIST";

export const getNextBillNo = async () => {
  // A simple read without transaction, just for preview
  const counterRef = doc(db, "counters", "billCounters");
  const d = await getDoc(counterRef);
  const nextSaleBill = d.exists() ? (d.data().nextSaleBill || 1) : 1;
  return 'SKB-2026-' + String(nextSaleBill).padStart(4, '0');
};

// Bill lookup for the global search box. Uses a prefix range on billNo so it stays a
// single indexed query rather than pulling the whole sales collection into the shell.
// Bill numbers are stored upper-case ("SKB-2026-0021"), so the query is upper-cased to
// keep the search case-insensitive from the user's point of view.
export const searchSalesByBillNo = async (term, max = 5) => {
  const q0 = String(term || '').trim().toUpperCase();
  if (!q0) return [];
  const q = query(
    collection(db, "sales"),
    orderBy("billNo"),
    where("billNo", ">=", q0),
    where("billNo", "<=", q0 + '\uf8ff'),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getRecentSales = async () => {
  const q = query(collection(db, "sales"), orderBy("date", "desc"), limit(10));
  const snap = await getDocs(q);
  const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return sortByDateThenCreatedAt(sales);
};

export const getSalesByMonth = async (year, monthIdx) => {
  const startObj = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0));
  const endObj = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));

  const q = query(
    collection(db, "sales"),
    where("date", ">=", startObj),
    where("date", "<=", endObj),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return sortByDateThenCreatedAt(sales);
};

export const createSale = async ({ customerId, customerName, date, advance, remarks, rows }) => {
  const advancePaid = Number(advance) || 0;
  let saleTotal = 0;
  
  // Calculate total before transaction
  const enrichedRows = rows.map(r => {
    const unitPrice = Number(r.mrp !== undefined && r.mrp !== null ? r.mrp : (r.rate || 0));
    const amount = r.amount !== undefined ? Number(r.amount) : Number(r.bags) * unitPrice;
    saleTotal += amount;
    return { ...r, amount };
  });

  const saleRef = doc(collection(db, "sales"));
  const counterRef = doc(db, "counters", "billCounters");
  const customerRef = doc(db, "customers", customerId);
  const newLedgerRef = doc(collection(db, "customers", customerId, "ledger"));

  const finalBillNo = await runTransaction(db, async (transaction) => {
    // 1. READS
    const counterDoc = await transaction.get(counterRef);
    const nextSaleBill = counterDoc.exists() ? (counterDoc.data().nextSaleBill || 1) : 1;
    const billNo = 'SKB-2026-' + String(nextSaleBill).padStart(4, '0');

    const customerDoc = await transaction.get(customerRef);
    if (!customerDoc.exists()) {
      throw new Error("Customer not found.");
    }
    const currentBalance = customerDoc.data().balance || 0;
    const currentTxnCount = customerDoc.data().txnCount || 0;
    
    const saleCredit = Math.min(advancePaid, saleTotal);
    const balanceAfterSaleEntry = currentBalance + saleTotal - saleCredit;
    const finalBalance = currentBalance + saleTotal - advancePaid;

    // Read all item docs (unique)
    const itemTotalRequested = new Map();
    enrichedRows.forEach(r => {
      if (r.itemId) {
        itemTotalRequested.set(r.itemId, (itemTotalRequested.get(r.itemId) || 0) + (Number(r.bags) || 0));
      }
    });

    const uniqueItemIds = Array.from(itemTotalRequested.keys());
    const itemDocsMap = new Map();
    for (const itemId of uniqueItemIds) {
      const itemRef = doc(db, "items", itemId);
      itemDocsMap.set(itemId, { ref: itemRef, doc: await transaction.get(itemRef) });
    }

    const failures = [];
    enrichedRows.forEach((row, i) => {
      const snapObj = itemDocsMap.get(row.itemId);
      const snap = snapObj ? snapObj.doc : null;
      const currentStock = snap && snap.exists() ? (Number(snap.data().stock) || 0) : 0;
      const totalReq = itemTotalRequested.get(row.itemId) || 0;

      if (totalReq > currentStock) {
        failures.push({
          rowIndex: i,
          itemId: row.itemId,
          item: row.itemName || (snap && snap.exists() ? snap.data().name : 'Item'),
          available: currentStock,
          requested: Number(row.bags)
        });
      }
    });

    if (failures.length > 0) {
      const err = new Error(`Only ${failures[0].available} bags available in stock`);
      err.code = 'INSUFFICIENT_STOCK';
      err.failures = failures;
      err.item = failures[0].item;
      err.available = failures[0].available;
      err.requested = failures[0].requested;
      throw err;
    }

    // 2. WRITES
    // Create Sale Doc
    transaction.set(saleRef, {
      billNo,
      customerId,
      customerName,
      date: new Date(date),
      advance: advancePaid,
      remarks,
      items: enrichedRows,
      totalAmount: saleTotal,
      createdAt: serverTimestamp()
    });

    // Create Ledger Entry
    transaction.set(newLedgerRef, {
      type: 'sale',
      desc: 'Bill ' + billNo,
      debit: saleTotal,
      credit: saleCredit,
      balanceAfter: balanceAfterSaleEntry,
      date: new Date(date),
      createdAt: serverTimestamp(),
      seq: 0,
      refId: saleRef.id
    });

    // Create Auto-generated Excess Payment Entry if advancePaid > saleTotal
    if (advancePaid > saleTotal) {
      const excess = advancePaid - saleTotal;
      const autoLedgerRef = doc(collection(db, "customers", customerId, "ledger"));
      transaction.set(autoLedgerRef, {
        type: 'payment',
        desc: 'Excess payment auto-applied',
        debit: 0,
        credit: excess,
        balanceAfter: finalBalance,
        date: new Date(date),
        createdAt: serverTimestamp(),
        seq: 1,
        autoGenerated: true,
        refId: saleRef.id
      });
    }

    // Update Customer
    transaction.update(customerRef, {
      balance: finalBalance,
      lastPurchase: serverTimestamp(),
      txnCount: currentTxnCount + 1
    });

    // Update Items Stock
    itemDocsMap.forEach(({ ref, doc: snap }, itemId) => {
      if (snap.exists()) {
        const totalReq = itemTotalRequested.get(itemId) || 0;
        const currentStock = Number(snap.data().stock) || 0;
        transaction.update(ref, {
          stock: currentStock - totalReq
        });
      }
    });

    // Update Counters
    transaction.set(counterRef, {
      nextSaleBill: nextSaleBill + 1
    }, { merge: true });

    return billNo;
  });

  return finalBillNo;
};

export const editSale = async (saleId, updatedData, uid) => {
  const { customerId: newCustomerId, customerName: newCustomerName, date, advance, remarks, rows, paymentAmount, paymentMode } = updatedData;
  const newAdvancePaid = Number(advance) || 0;
  const numPayment = Number(paymentAmount) || 0;
  const selectedMode = paymentMode || 'Cash';
  let newSaleTotal = 0;
  
  const enrichedRows = rows.map(r => {
    const unitPrice = Number(r.mrp !== undefined && r.mrp !== null ? r.mrp : (r.rate || 0));
    const amount = r.amount !== undefined ? Number(r.amount) : Number(r.bags) * unitPrice;
    newSaleTotal += amount;
    return { ...r, amount };
  });

  const saleRef = doc(db, "sales", saleId);

  // Step 1: Read the sale and ledger docs OUTSIDE the transaction first
  const oldSaleDocOutside = await getDoc(saleRef);
  if (!oldSaleDocOutside.exists()) {
    throw new Error("Sale bill not found.");
  }
  const oldSaleData = oldSaleDocOutside.data() || {};
  const oldCustomerId = oldSaleData.customerId;
  if (!oldCustomerId) {
    throw new Error("Original sale record is missing a customer ID.");
  }
  if (!newCustomerId) {
    throw new Error("Target customer ID is missing.");
  }

  const ledgerQuery = query(collection(db, "customers", oldCustomerId, "ledger"), where("refId", "==", saleId));
  const ledgerSnap = await getDocs(ledgerQuery);

  return await runTransaction(db, async (transaction) => {
    // ── PHASE 1: ALL READS ──────────────────────────────────────────────
    
    // Re-read sale inside transaction for consistency
    const oldSaleDoc = await transaction.get(saleRef);
    if (!oldSaleDoc.exists()) throw new Error("Sale bill not found.");
    const oldSale = oldSaleDoc.data() || {};
    
    // Read old customer
    const oldCustomerRef = doc(db, "customers", oldCustomerId);
    const oldCustomerDoc = await transaction.get(oldCustomerRef);
    if (!oldCustomerDoc.exists()) throw new Error("Original customer not found.");

    // Read new customer if changed
    let newCustomerRef = oldCustomerRef;
    let newCustomerDoc = oldCustomerDoc;
    if (newCustomerId !== oldCustomerId) {
      newCustomerRef = doc(db, "customers", newCustomerId);
      newCustomerDoc = await transaction.get(newCustomerRef);
      if (!newCustomerDoc.exists()) throw new Error("New customer not found.");
    }

    // Determine all items involved (both old and new)
    const itemNetDelta = new Map();
    if (oldSale.items && Array.isArray(oldSale.items)) {
      oldSale.items.forEach(r => {
        if (r.itemId) {
          itemNetDelta.set(r.itemId, (itemNetDelta.get(r.itemId) || 0) + (Number(r.bags) || 0));
        }
      });
    }
    enrichedRows.forEach(r => {
      if (r.itemId) {
        itemNetDelta.set(r.itemId, (itemNetDelta.get(r.itemId) || 0) - (Number(r.bags) || 0));
      }
    });

    const uniqueItemIds = Array.from(itemNetDelta.keys()).filter(Boolean);
    const itemDocsMap = new Map();
    for (const itemId of uniqueItemIds) {
      const itemRef = doc(db, "items", itemId);
      itemDocsMap.set(itemId, { ref: itemRef, doc: await transaction.get(itemRef) });
    }

    // Ledger documents to update or delete (pre-read outside)
    // Note: We don't read ledger docs in transaction as Firestore query in transaction isn't supported like this
    // The outside read is sufficient for deciding what to overwrite/delete.
    const saleLedgerDoc = ledgerSnap.docs.find(d => d.data().type === 'sale');
    const autoPaymentDocs = ledgerSnap.docs.filter(d => d.data().autoGenerated === true);

    // ── PHASE 2: COMPUTE ────────────────────────────────────────────────
    
    const oldAdvancePaid = Number(oldSale.advance) || 0;
    let oldSaleTotal = 0;
    if (oldSale.items && Array.isArray(oldSale.items)) {
      oldSale.items.forEach(r => {
        oldSaleTotal += r.amount !== undefined ? Number(r.amount) : (Number(r.bags) || 0) * (Number(r.rate) || 0);
      });
    }

    const oldBagsMap = new Map();
    if (oldSale.items && Array.isArray(oldSale.items)) {
      oldSale.items.forEach(r => {
        if (r.itemId) {
          oldBagsMap.set(r.itemId, (oldBagsMap.get(r.itemId) || 0) + (Number(r.bags) || 0));
        }
      });
    }

    const newTotalRequested = new Map();
    enrichedRows.forEach(r => {
      if (r.itemId) {
        newTotalRequested.set(r.itemId, (newTotalRequested.get(r.itemId) || 0) + (Number(r.bags) || 0));
      }
    });

    const failures = [];
    enrichedRows.forEach((row, i) => {
      const snapObj = itemDocsMap.get(row.itemId);
      const snap = snapObj ? snapObj.doc : null;
      const currentStock = snap && snap.exists() ? (Number(snap.data().stock) || 0) : 0;
      const oldBags = oldBagsMap.get(row.itemId) || 0;
      const effectiveAvailable = currentStock + oldBags;
      const totalReq = newTotalRequested.get(row.itemId) || 0;

      if (totalReq > effectiveAvailable) {
        failures.push({
          rowIndex: i,
          itemId: row.itemId,
          item: row.itemName || (snap && snap.exists() ? snap.data().name : 'Item'),
          available: effectiveAvailable,
          requested: Number(row.bags)
        });
      }
    });

    if (failures.length > 0) {
      const err = new Error(`Only ${failures[0].available} bags available in stock`);
      err.code = 'INSUFFICIENT_STOCK';
      err.failures = failures;
      err.item = failures[0].item;
      err.available = failures[0].available;
      err.requested = failures[0].requested;
      throw err;
    }

    // ── PHASE 3: ALL WRITES ─────────────────────────────────────────────
    
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

    // Customer balance and Ledger updates
    if (newCustomerId === oldCustomerId) {
      const currentBalance = oldCustomerDoc.data().balance || 0;
      const baseBalance = currentBalance - (oldSaleTotal - oldAdvancePaid);
      const newSaleCredit = Math.min(newAdvancePaid, newSaleTotal);
      const saleBalanceAfter = baseBalance + newSaleTotal - newSaleCredit;
      const finalNewCustBalanceBeforeManualPayment = baseBalance + newSaleTotal - newAdvancePaid;

      if (saleLedgerDoc) {
        transaction.update(saleLedgerDoc.ref, {
          desc: `Bill ${oldSale.billNo} (edited)`,
          debit: newSaleTotal,
          credit: newSaleCredit,
          balanceAfter: saleBalanceAfter,
          date: new Date(date),
          seq: 0
        });
      }

      autoPaymentDocs.forEach(d => transaction.delete(d.ref));

      if (newAdvancePaid > newSaleTotal) {
        const excess = newAdvancePaid - newSaleTotal;
        const autoLedgerRef = doc(collection(db, "customers", oldCustomerId, "ledger"));
        transaction.set(autoLedgerRef, {
          type: 'payment',
          desc: 'Excess payment auto-applied',
          debit: 0,
          credit: excess,
          balanceAfter: finalNewCustBalanceBeforeManualPayment,
          date: serverTimestamp(),
          createdAt: serverTimestamp(),
          seq: 1,
          autoGenerated: true,
          refId: saleId
        });
      }

      const finalCustomerBalance = numPayment > 0 ? (finalNewCustBalanceBeforeManualPayment - numPayment) : finalNewCustBalanceBeforeManualPayment;
      const customerUpdates = { balance: finalCustomerBalance };
      if (numPayment > 0) {
        customerUpdates.lastPayment = serverTimestamp();
      }
      transaction.update(oldCustomerRef, customerUpdates);

      if (numPayment > 0) {
        const paymentLedgerRef = doc(collection(db, "customers", oldCustomerId, "ledger"));
        transaction.set(paymentLedgerRef, {
          type: 'payment',
          desc: 'Payment on Bill ' + oldSale.billNo,
          credit: numPayment,
          debit: 0,
          balanceAfter: finalCustomerBalance,
          mode: selectedMode,
          linkedBillNo: oldSale.billNo,
          date: serverTimestamp(),
          createdAt: serverTimestamp(),
          seq: 2
        });
      }
    } else {
      const oldCustBalanceAfterRevert = (oldCustomerDoc.data().balance || 0) - (oldSaleTotal - oldAdvancePaid);
      transaction.update(oldCustomerRef, { balance: oldCustBalanceAfterRevert });

      ledgerSnap.docs.forEach(d => transaction.delete(d.ref));

      const newCustBaseBalance = newCustomerDoc.data().balance || 0;
      const newSaleCredit = Math.min(newAdvancePaid, newSaleTotal);
      const saleBalanceAfter = newCustBaseBalance + newSaleTotal - newSaleCredit;
      const finalNewCustBalanceBeforeManualPayment = newCustBaseBalance + newSaleTotal - newAdvancePaid;

      const freshLedgerRef = doc(collection(db, "customers", newCustomerId, "ledger"));
      transaction.set(freshLedgerRef, {
        type: 'sale',
        desc: `Bill ${oldSale.billNo}`,
        debit: newSaleTotal,
        credit: newSaleCredit,
        balanceAfter: saleBalanceAfter,
        date: new Date(date),
        createdAt: serverTimestamp(),
        seq: 0,
        refId: saleId
      });

      if (newAdvancePaid > newSaleTotal) {
        const excess = newAdvancePaid - newSaleTotal;
        const autoLedgerRef = doc(collection(db, "customers", newCustomerId, "ledger"));
        transaction.set(autoLedgerRef, {
          type: 'payment',
          desc: 'Excess payment auto-applied',
          debit: 0,
          credit: excess,
          balanceAfter: finalNewCustBalanceBeforeManualPayment,
          date: serverTimestamp(),
          createdAt: serverTimestamp(),
          seq: 1,
          autoGenerated: true,
          refId: saleId
        });
      }

      const finalNewCustBalance = numPayment > 0 ? (finalNewCustBalanceBeforeManualPayment - numPayment) : finalNewCustBalanceBeforeManualPayment;
      const newCustUpdates = { balance: finalNewCustBalance };
      if (numPayment > 0) {
        newCustUpdates.lastPayment = serverTimestamp();
      }
      transaction.update(newCustomerRef, newCustUpdates);

      if (numPayment > 0) {
        const paymentLedgerRef = doc(collection(db, "customers", newCustomerId, "ledger"));
        transaction.set(paymentLedgerRef, {
          type: 'payment',
          desc: 'Payment on Bill ' + oldSale.billNo,
          credit: numPayment,
          debit: 0,
          balanceAfter: finalNewCustBalance,
          mode: selectedMode,
          linkedBillNo: oldSale.billNo,
          date: serverTimestamp(),
          createdAt: serverTimestamp(),
          seq: 2
        });
      }
    }

    // Update sale doc
    transaction.update(saleRef, {
      customerId: newCustomerId,
      customerName: newCustomerName,
      date: new Date(date),
      advance: newAdvancePaid,
      remarks,
      items: enrichedRows,
      totalAmount: newSaleTotal,
      editedAt: serverTimestamp(),
      editedBy: uid || null
    });

    const billNo = String(oldSale.billNo || '');
    return { billNo };
  });
};


export const getCustomerSales = async (customerId) => {
  if (!customerId) return [];
  const q = query(collection(db, "sales"), where("customerId", "==", customerId));
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  docs.sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
    return dateB - dateA;
  });
  return docs;
};

export const deleteSale = async (saleId) => {
  const saleSnap = await getDoc(doc(db, "sales", saleId));
  if (!saleSnap.exists()) throw new Error("Sale not found.");
  const sale = saleSnap.data();

  // Aggregate items
  const itemTotalRestored = new Map();
  const items = sale.items || [];
  items.forEach(item => {
    if (item.itemId) {
      itemTotalRestored.set(item.itemId, (itemTotalRestored.get(item.itemId) || 0) + (Number(item.bags) || 0));
    }
  });
  const uniqueItemIds = Array.from(itemTotalRestored.keys());

  await runTransaction(db, async (transaction) => {
    const saleRef = doc(db, "sales", saleId);
    const saleDoc = await transaction.get(saleRef);
    if (!saleDoc.exists()) throw new Error("Sale not found.");
    
    const customerRef = doc(db, "customers", sale.customerId);
    const customerDoc = await transaction.get(customerRef);

    const itemDocsMap = new Map();
    for (const itemId of uniqueItemIds) {
      const ref = doc(db, "items", itemId);
      itemDocsMap.set(itemId, { ref, doc: await transaction.get(ref) });
    }

    const sData = saleDoc.data();
    const totalAmount = Number(sData.totalAmount) || 0;
    const advancePaid = Number(sData.advance) || 0;
    const customerData = customerDoc.exists() ? customerDoc.data() : {};
    const currentCustomerBalance = Number(customerData.balance) || 0;
    const currentTxnCount = Number(customerData.txnCount) || 0;

    const newCustomerBalance = currentCustomerBalance - totalAmount + advancePaid;

    if (customerDoc.exists()) {
      transaction.update(customerRef, {
        balance: newCustomerBalance,
        txnCount: Math.max(0, currentTxnCount - 1),
        updatedAt: serverTimestamp()
      });
    }

    itemDocsMap.forEach(({ ref, doc: snap }, itemId) => {
      if (snap.exists()) {
        const totalToRestore = itemTotalRestored.get(itemId) || 0;
        const currentStock = Number(snap.data().stock) || 0;
        transaction.update(ref, { stock: currentStock + totalToRestore });
      }
    });

    transaction.delete(saleRef);
  });

  // After transaction, delete ledger entries. writeBatch is imported statically
  // at the top of this module — the dynamic import that used to sit here defeated
  // bundling for no benefit.
  const ledgerQ = query(collection(db, "customers", sale.customerId, "ledger"), where("refId", "==", saleId));
  const ledgerSnap = await getDocs(ledgerQ);
  if (!ledgerSnap.empty) {
    const batch = writeBatch(db);
    ledgerSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
};
