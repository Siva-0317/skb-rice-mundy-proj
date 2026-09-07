import { doc, collection, getDocs, query, orderBy, limit, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { toMillis } from "../utils/dateIST";

export const editLedgerEntry = async (personType, personId, entryId, { amount, mode, note }) => {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  const collectionName = (personType === 'supplier' || personType === 'suppliers') ? 'suppliers' : 'customers';
  const isSupplier = collectionName === 'suppliers';

  const entryRef = doc(db, collectionName, personId, "ledger", entryId);
  const personRef = doc(db, collectionName, personId);
  const ledgerColRef = collection(db, collectionName, personId, "ledger");
  // Firestore's orderBy("date") alone doesn't distinguish same-day entries, so the
  // "most recent" doc it returns can be an arbitrary same-day sibling rather than the
  // true latest one. Over-fetch a buffer past same-day ties and re-sort client-side
  // with the same (date, createdAt, seq) tiebreak used for ledger display everywhere else.
  const recentQuery = query(ledgerColRef, orderBy("date", "desc"), limit(10));
  // The balance is recomputed from every row rather than nudged by a delta — see
  // reconcileBalance below for why. Ledgers here are a handful of rows per person.
  const allEntriesQuery = query(ledgerColRef, orderBy("date", "desc"));

  await runTransaction(db, async (transaction) => {
    const entrySnap = await transaction.get(entryRef);
    if (!entrySnap.exists()) {
      throw new Error("Ledger entry not found");
    }
    const entryData = entrySnap.data();
    if (entryData.type !== 'payment') {
      throw new Error("Only payment entries can be edited");
    }

    const recentSnap = await getDocs(recentQuery);
    if (!recentSnap.empty) {
      const recentDocs = recentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      recentDocs.sort((a, b) => {
        const dateDiff = toMillis(b.date) - toMillis(a.date);
        if (dateDiff !== 0) return dateDiff;
        const createdDiff = toMillis(b.createdAt) - toMillis(a.createdAt);
        if (createdDiff !== 0) return createdDiff;
        return (Number(b.seq) || 0) - (Number(a.seq) || 0);
      });
      if (recentDocs[0].id !== entryId) {
        throw new Error("Only the most recent payment can be edited");
      }
    }

    const personSnap = await transaction.get(personRef);
    if (!personSnap.exists()) {
      throw new Error("Person not found");
    }

    // A payment is stored as a CREDIT for both customers and suppliers —
    // recordPayment and recordSupplierPayment both write { debit: 0, credit: amount }.
    // Reading the supplier's old amount off `debit` found 0 every time, so the
    // delta came out as the whole new amount and the balance was reduced by it a
    // second time on top of the original payment.
    // The balance is recomputed from the rows, not adjusted by a delta against
    // the stored figure. A delta is only correct while the stored figure is,
    // and this very function used to corrupt it: any balance an earlier bad
    // edit skewed would stay skewed forever, because every later delta would be
    // applied on top of the wrong number. Deriving it means one bad write
    // cannot outlive the next edit — the same reasoning as the statement's
    // running balance in utils/ledgerBalance.js.
    const allSnap = await getDocs(allEntriesQuery);
    const newBalance = allSnap.docs.reduce((sum, d) => {
      const row = d.id === entryId
        ? { debit: 0, credit: numAmount }
        : d.data();
      return sum + (Number(row.debit) || 0) - (Number(row.credit) || 0);
    }, 0);

    const desc = note?.trim() ? note.trim() : (isSupplier ? `Payment made (${mode})` : `Payment received (${mode})`);

    const updatedEntryData = {
      mode: mode || 'Cash',
      note: note || '',
      desc,
      balanceAfter: newBalance,
      editedAt: serverTimestamp()
    };

    updatedEntryData.credit = numAmount;
    // Writing the supplier's amount to `debit` while leaving the original `credit`
    // in place turned the row into a simultaneous bill and payment, so the derived
    // balance moved by (new - old) in the wrong direction instead of by -(new).
    // Clearing debit also repairs any row an earlier edit already mangled.
    updatedEntryData.debit = 0;

    transaction.update(entryRef, updatedEntryData);
    transaction.update(personRef, { balance: newBalance });
  });
};

export const deleteLedgerEntry = async (personType, personId, entryId) => {
  const collectionName = (personType === 'supplier' || personType === 'suppliers') ? 'suppliers' : 'customers';
  const entryRef = doc(db, collectionName, personId, "ledger", entryId);
  const personRef = doc(db, collectionName, personId);

  return await runTransaction(db, async (transaction) => {
    const entrySnap = await transaction.get(entryRef);
    if (!entrySnap.exists()) {
      throw new Error("Ledger entry not found");
    }
    const entryData = entrySnap.data();
    
    if (entryData.type !== 'payment' && entryData.type !== 'opening') {
      throw new Error("Cannot delete this entry type directly. Please delete the associated bill instead.");
    }

    const personSnap = await transaction.get(personRef);
    if (!personSnap.exists()) {
      throw new Error("Person not found");
    }

    // Recomputed from the surviving rows for the same reason as the edit path:
    // subtracting this entry's effect from the stored balance carries forward
    // any error already in it.
    const allSnap = await getDocs(query(collection(db, collectionName, personId, "ledger")));
    const newBalance = allSnap.docs.reduce((sum, d) => {
      if (d.id === entryId) return sum;
      const row = d.data();
      return sum + (Number(row.debit) || 0) - (Number(row.credit) || 0);
    }, 0);

    transaction.update(personRef, { balance: newBalance });
    transaction.delete(entryRef);

    return { deletedEntryId: entryId, newBalance, personId };
  });
};
