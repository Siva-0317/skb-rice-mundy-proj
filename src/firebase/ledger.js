import { doc, collection, getDocs, query, orderBy, limit, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

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
  const recentQuery = query(ledgerColRef, orderBy("date", "desc"), limit(1));

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
    if (!recentSnap.empty && recentSnap.docs[0].id !== entryId) {
      throw new Error("Only the most recent payment can be edited");
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
