import { doc, collection, getDocs, query, orderBy, limit, runTransaction, serverTimestamp } from "firebase/firestore";
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
