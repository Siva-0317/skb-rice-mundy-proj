import { doc, collection, getDocs, query, orderBy, limit, where, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

export const getNextBillNo = async () => {
  // A simple read without transaction, just for preview
  const counterRef = doc(db, "counters", "billCounters");
  const snap = await runTransaction(db, async (t) => {
    const d = await t.get(counterRef);
    if (!d.exists()) return 1;
    return d.data().nextSaleBill || 1;
  });
  return 'SKB-2026-' + String(snap).padStart(4, '0');
};

export const getRecentSales = async () => {
  const q = query(collection(db, "sales"), orderBy("date", "desc"), limit(10));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const createSale = async ({ customerId, customerName, date, advance, remarks, rows }) => {
  const numAdvance = Number(advance) || 0;
  let computedTotal = 0;
  
  // Calculate total before transaction
  const enrichedRows = rows.map(r => {
    const amount = Number(r.bags) * Number(r.rate);
    computedTotal += amount;
    return { ...r, amount };
  });
  computedTotal -= numAdvance;

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
    const newBalance = currentBalance + computedTotal;

    // Read all item docs
    const itemRefs = enrichedRows.map(r => doc(db, "items", r.itemId));
    const itemDocs = [];
    for (let ref of itemRefs) {
      itemDocs.push(await transaction.get(ref));
    }

    // 2. WRITES
    // Create Sale Doc
    transaction.set(saleRef, {
      billNo,
      customerId,
      customerName,
      date: new Date(date),
      advance: numAdvance,
      remarks,
      items: enrichedRows,
      totalAmount: computedTotal,
      createdAt: serverTimestamp()
    });

    // Create Ledger Entry
    transaction.set(newLedgerRef, {
      type: 'sale',
      desc: 'Bill ' + billNo,
      debit: computedTotal,
      credit: 0,
      balanceAfter: newBalance,
      date: serverTimestamp(),
      refId: saleRef.id
    });

    // Update Customer
    transaction.update(customerRef, {
      balance: newBalance,
      lastPurchase: serverTimestamp(),
      txnCount: currentTxnCount + 1
    });

    // Update Items Stock
    enrichedRows.forEach((row, i) => {
      const itemDoc = itemDocs[i];
      if (itemDoc.exists()) {
        const currentStock = itemDoc.data().stock || 0;
        transaction.update(itemRefs[i], {
          stock: currentStock - Number(row.bags)
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
  const { customerId: newCustomerId, customerName: newCustomerName, date, advance, remarks, rows } = updatedData;
  const numAdvance = Number(advance) || 0;
  let computedNewTotal = 0;
  
  const enrichedRows = rows.map(r => {
    const amount = Number(r.bags) * Number(r.rate);
    computedNewTotal += amount;
    return { ...r, amount };
  });
  computedNewTotal -= numAdvance;

  const saleRef = doc(db, "sales", saleId);

  return await runTransaction(db, async (transaction) => {
    // 1. READS
    const oldSaleDoc = await transaction.get(saleRef);
    if (!oldSaleDoc.exists()) {
      throw new Error("Sale bill not found.");
    }
    const oldSale = oldSaleDoc.data();
    const oldCustomerId = oldSale.customerId;
    const oldNumAdvance = Number(oldSale.advance) || 0;
    
    let computedOldTotal = 0;
    if (oldSale.items && Array.isArray(oldSale.items)) {
      oldSale.items.forEach(r => {
        computedOldTotal += (Number(r.bags) || 0) * (Number(r.rate) || 0);
      });
    }
    computedOldTotal -= oldNumAdvance;

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

    const ledgerQuery = query(collection(db, "customers", oldCustomerId, "ledger"), where("refId", "==", saleId));
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

    // Customer balance and Ledger updates
    if (newCustomerId === oldCustomerId) {
      const currentBalance = oldCustomerDoc.data().balance || 0;
      const balanceAfter = currentBalance + (computedNewTotal - computedOldTotal);
      transaction.update(oldCustomerRef, { balance: balanceAfter });

      if (!ledgerSnap.empty) {
        transaction.update(ledgerSnap.docs[0].ref, {
          desc: `Bill ${oldSale.billNo} (edited)`,
          debit: computedNewTotal,
          balanceAfter: balanceAfter
        });
      }
    } else {
      const oldCustBalance = (oldCustomerDoc.data().balance || 0) - computedOldTotal;
      transaction.update(oldCustomerRef, { balance: oldCustBalance });

      if (!ledgerSnap.empty) {
        transaction.update(ledgerSnap.docs[0].ref, {
          debit: 0,
          desc: `Bill ${oldSale.billNo} (moved to ${newCustomerName})`,
          balanceAfter: oldCustBalance
        });
      }

      const newCustBalance = (newCustomerDoc.data().balance || 0) + computedNewTotal;
      transaction.update(newCustomerRef, { balance: newCustBalance });

      const freshLedgerRef = doc(collection(db, "customers", newCustomerId, "ledger"));
      transaction.set(freshLedgerRef, {
        type: 'sale',
        desc: `Bill ${oldSale.billNo}`,
        debit: computedNewTotal,
        credit: 0,
        balanceAfter: newCustBalance,
        date: serverTimestamp(),
        refId: saleId
      });
    }

    // Update sale doc
    transaction.update(saleRef, {
      customerId: newCustomerId,
      customerName: newCustomerName,
      date: new Date(date),
      advance: numAdvance,
      remarks,
      items: enrichedRows,
      totalAmount: computedNewTotal,
      editedAt: serverTimestamp(),
      editedBy: uid || null
    });

    return oldSale.billNo;
  });
};
