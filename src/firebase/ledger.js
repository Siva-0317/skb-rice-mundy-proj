import { doc, collection, getDocs, query, orderBy, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { toMillis } from "../utils/dateIST";

/**
 * Read a person's whole ledger, newest first.
 *
 * This runs BEFORE the transaction opens, deliberately. A collection query
 * issued from inside a runTransaction callback can block on the same stream the
 * transaction is holding: the save then hangs on "Saving..." forever, with no
 * error, no toast and nothing written. That happened on the live site the first
 * time this path was exercised after the balance recompute was added.
 *
 * The cost is that the rows are read a moment before the transaction commits,
 * so a concurrent write could in principle land in between. That is an
 * acceptable trade here — one operator, a handful of rows per person — and the
 * transaction still re-reads and re-validates the entry itself before writing.
 */
const readLedgerRows = async (collectionName, personId) => {
  const snap = await getDocs(
    query(collection(db, collectionName, personId, "ledger"), orderBy("date", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/**
 * The balance implied by a set of ledger rows.
 *
 * Recomputed rather than nudged by a delta. A delta is only correct while the
 * stored figure is, and editLedgerEntry used to corrupt that figure — so a
 * balance an earlier bad edit skewed would have stayed skewed forever, every
 * later delta landing on top of the wrong number. Deriving it means one bad
 * write cannot outlive the next edit, and a record damaged by the old code
 * repairs itself the first time anyone touches it. Same reasoning as the
 * statement's running balance in utils/ledgerBalance.js.
 */
const balanceFromRows = (rows) =>
  rows.reduce((sum, r) => sum + (Number(r.debit) || 0) - (Number(r.credit) || 0), 0);

/**
 * Only the most recent payment may be edited, because every balance after it is
 * derived from it. Firestore's orderBy("date") alone doesn't separate same-day
 * entries, so the "latest" doc it returns can be an arbitrary same-day sibling.
 * Re-sort with the same (date, createdAt, seq) tiebreak used for display.
 */
const isMostRecent = (rows, entryId) => {
  if (rows.length === 0) return true;
  const sorted = [...rows].sort((a, b) => {
    const dateDiff = toMillis(b.date) - toMillis(a.date);
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = toMillis(b.createdAt) - toMillis(a.createdAt);
    if (createdDiff !== 0) return createdDiff;
    return (Number(b.seq) || 0) - (Number(a.seq) || 0);
  });
  return sorted[0].id === entryId;
};

export const editLedgerEntry = async (personType, personId, entryId, { amount, mode, note }) => {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  const collectionName = (personType === 'supplier' || personType === 'suppliers') ? 'suppliers' : 'customers';
  const isSupplier = collectionName === 'suppliers';

  const entryRef = doc(db, collectionName, personId, "ledger", entryId);
  const personRef = doc(db, collectionName, personId);

  const rows = await readLedgerRows(collectionName, personId);
  if (!isMostRecent(rows, entryId)) {
    throw new Error("Only the most recent payment can be edited");
  }

  // A payment is stored as a CREDIT for both customers and suppliers —
  // recordPayment and recordSupplierPayment both write { debit: 0, credit: amount }.
  // This function used to branch on isSupplier and read the old amount off
  // `debit`, which was always 0, then write the new amount to `debit` too. The
  // row ended up claiming both sides and the balance was reduced by the whole
  // new amount a second time.
  const edited = { id: entryId, debit: 0, credit: numAmount };
  const newBalance = balanceFromRows(rows.map(r => (r.id === entryId ? edited : r)));

  const desc = note?.trim() ? note.trim() : (isSupplier ? `Payment made (${mode})` : `Payment received (${mode})`);

  await runTransaction(db, async (transaction) => {
    const entrySnap = await transaction.get(entryRef);
    if (!entrySnap.exists()) {
      throw new Error("Ledger entry not found");
    }
    if (entrySnap.data().type !== 'payment') {
      throw new Error("Only payment entries can be edited");
    }

    const personSnap = await transaction.get(personRef);
    if (!personSnap.exists()) {
      throw new Error("Person not found");
    }

    transaction.update(entryRef, {
      mode: mode || 'Cash',
      note: note || '',
      desc,
      credit: numAmount,
      // Clearing debit is what repairs a row an earlier bad edit mangled.
      debit: 0,
      balanceAfter: newBalance,
      editedAt: serverTimestamp()
    });
    transaction.update(personRef, { balance: newBalance });
  });
};

export const deleteLedgerEntry = async (personType, personId, entryId) => {
  const collectionName = (personType === 'supplier' || personType === 'suppliers') ? 'suppliers' : 'customers';
  const entryRef = doc(db, collectionName, personId, "ledger", entryId);
  const personRef = doc(db, collectionName, personId);

  const rows = await readLedgerRows(collectionName, personId);
  const newBalance = balanceFromRows(rows.filter(r => r.id !== entryId));

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

    transaction.update(personRef, { balance: newBalance });
    transaction.delete(entryRef);

    return { deletedEntryId: entryId, newBalance, personId };
  });
};
