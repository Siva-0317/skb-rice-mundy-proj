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

    const oldAmount = isSupplier ? (Number(entryData.debit) || 0) : (Number(entryData.credit) || 0);
    const amountDelta = numAmount - oldAmount;

    const currentBalance = Number(personSnap.data().balance) || 0;
    const newBalance = currentBalance - amountDelta;

    const desc = note?.trim() ? note.trim() : (isSupplier ? `Payment made (${mode})` : `Payment received (${mode})`);

    const updatedEntryData = {
      mode: mode || 'Cash',
      note: note || '',
      desc,
      balanceAfter: newBalance,
      editedAt: serverTimestamp()
    };

    if (isSupplier) {
      updatedEntryData.debit = numAmount;
    } else {
      updatedEntryData.credit = numAmount;
    }

    transaction.update(entryRef, updatedEntryData);
    transaction.update(personRef, { balance: newBalance });
  });
};
