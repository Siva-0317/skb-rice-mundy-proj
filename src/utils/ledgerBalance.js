import { toMillis } from './dateIST';

/**
 * Order ledger entries oldest → newest, stamp each with the balance that
 * follows it, then hand them back newest-first for bank-statement display.
 *
 * Why this is computed rather than read
 * -------------------------------------
 * Every ledger row used to carry a `balanceAfter` written at insert time, and
 * the customer statement rendered that stored value verbatim. Nothing rewrote
 * it when a row was removed, so deleting a bill left every surviving row of
 * that customer's statement showing a balance from before the deletion — the
 * statement and the customer's actual balance silently diverged. The business
 * ledger never had the problem because getGlobalLedger already accumulated its
 * own running total on read.
 *
 * Deriving the column instead of storing it means it cannot drift: no deletion
 * path, present or future, has to remember to recompute anything. It also
 * repairs statements that a past deletion already corrupted, without a data
 * migration — the stale stored field is simply ignored.
 *
 * The ordering must be total, or two rows sharing a date and timestamp could
 * swap between reads and make the balance column appear to jump around:
 * date, then createdAt, then seq (opening balances carry seq -1 so they sort
 * first), and finally document id as a stable tiebreak.
 */
export const withRunningBalance = (entries) => {
  const ordered = [...entries].sort((a, b) => {
    const dateDiff = toMillis(a.date) - toMillis(b.date);
    if (dateDiff !== 0) return dateDiff;

    const createdDiff = toMillis(a.createdAt) - toMillis(b.createdAt);
    if (createdDiff !== 0) return createdDiff;

    const seqDiff = (Number(a.seq) || 0) - (Number(b.seq) || 0);
    if (seqDiff !== 0) return seqDiff;

    return String(a.id) < String(b.id) ? -1 : 1;
  });

  let running = 0;
  const stamped = ordered.map(entry => {
    running += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
    return { ...entry, balanceAfter: running };
  });

  stamped.reverse();
  return stamped;
};

/**
 * The closing balance implied by a set of ledger entries. Useful for checking
 * a statement against the balance held on the customer or supplier document —
 * if these two disagree, one of them is wrong and it is worth knowing which.
 */
export const closingBalance = (entries) =>
  entries.reduce(
    (sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0),
    0
  );
