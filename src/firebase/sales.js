import { doc, collection, getDocs, query, orderBy, limit, runTransaction, serverTimestamp } from "firebase/firestore";
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
