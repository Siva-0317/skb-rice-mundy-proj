import { doc, collection, getDocs, getDoc, query, orderBy, limit, where, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

export const getNextBillNo = async () => {
  // A simple read without transaction, just for preview
  const counterRef = doc(db, "counters", "billCounters");
  const d = await getDoc(counterRef);
  const nextSaleBill = d.exists() ? (d.data().nextSaleBill || 1) : 1;
  return 'SKB-2026-' + String(nextSaleBill).padStart(4, '0');
};

export const getRecentSales = async () => {
  const q = query(collection(db, "sales"), orderBy("date", "desc"), limit(10));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getSalesByMonth = async (year, monthIdx) => {
  const startObj = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const endObj = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
  
  const q = query(
    collection(db, "sales"),
    where("date", ">=", startObj),
    where("date", "<=", endObj),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
      date: serverTimestamp(),
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
        date: serverTimestamp(),
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

  return await runTransaction(db, async (transaction) => {
    // 1. READS
    const oldSaleDoc = await transaction.get(saleRef);
    if (!oldSaleDoc.exists()) {
      throw new Error("Sale bill not found.");
    }
    const oldSale = oldSaleDoc.data() || {};
    const oldCustomerId = oldSale.customerId;
    if (!oldCustomerId) {
      throw new Error("Original sale record is missing a customer ID.");
    }
    if (!newCustomerId) {
      throw new Error("Target customer ID is missing.");
    }
    const oldAdvancePaid = Number(oldSale.advance) || 0;
    
    let oldSaleTotal = 0;
    if (oldSale.items && Array.isArray(oldSale.items)) {
      oldSale.items.forEach(r => {
        oldSaleTotal += r.amount !== undefined ? Number(r.amount) : (Number(r.bags) || 0) * (Number(r.rate) || 0);
      });
    }

    const oldCustomerRef = doc(db, "customers", oldCustomerId);
    const oldCustomerDoc = await transaction.get(oldCustomerRef);
    if (!oldCustomerDoc.exists()) {
      throw new Error("Original customer not found.");
    }

    let newCustomerRef = oldCustomerRef;
    let newCustomerDoc = oldCustomerDoc;
    if (newCustomerId !== oldCustomerId) {
      newCustomerRef = doc(db, "customers", newCustomerId);
      newCustomerDoc = await transaction.get(newCustomerRef);
      if (!newCustomerDoc.exists()) {
        throw new Error("New customer not found.");
      }
    }

    // Net stock differences: old sale deducted stock (+ when reverting), new sale deducts stock (- when applying)
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

    const ledgerQuery = query(collection(db, "customers", oldCustomerId, "ledger"), where("refId", "==", saleId));
    const ledgerSnap = await getDocs(ledgerQuery);
    const saleLedgerDoc = ledgerSnap.docs.find(d => d.data().type === 'sale');
    const autoPaymentDocs = ledgerSnap.docs.filter(d => d.data().autoGenerated === true);

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
          balanceAfter: saleBalanceAfter
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
          date: serverTimestamp()
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
        date: serverTimestamp(),
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
          date: serverTimestamp()
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
