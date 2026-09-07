import { describe, it, expect, vi, beforeEach } from 'vitest';

// Editing a SUPPLIER payment corrupted both the entry and the balance.
//
// recordSupplierPayment and recordPayment both store a payment the same way:
// { debit: 0, credit: amount }. editLedgerEntry did not: it branched on
// isSupplier and read the old amount off `debit`, then wrote the new amount to
// `debit` as well, leaving the original `credit` untouched.
//
// Observed live on 07 Sept 2026, editing a Rs 4,000 supplier payment to Rs 6,000
// against a Rs 11,000 bill:
//   - the row became debit 6,000 AND credit 4,000 — a bill and a payment at once
//   - the derived ledger balance read Rs 13,000 (11,000 + 6,000 - 4,000)
//   - the stored supplier balance read Rs 1,000 (11,000 - 4,000 - 6,000)
//   - the correct figure was Rs 5,000, and the two disagreed with each other
//
// oldAmount came back 0 every time, so the delta was the whole new amount and
// the balance was reduced by it a second time on top of the original payment.

let entryData;
let personData;
let allRows;
const entryUpdate = vi.fn();
const personUpdate = vi.fn();

vi.mock('../firebase/config', () => ({ db: {} }));

vi.mock('../utils/dateIST', () => ({ toMillis: (v) => Number(v) || 0 }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id, sub, subId) => ({ col, id, sub, subId })),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 'ts'),
  // Two different reads now go through getDocs: the recency guard, and the
  // full-ledger read the balance is recomputed from. `allRows` stands in for the
  // person's whole ledger.
  getDocs: vi.fn(async () => ({
    empty: false,
    docs: allRows.map(r => ({ id: r.id, data: () => r })),
  })),
  runTransaction: vi.fn(async (_db, fn) =>
    fn({
      get: async (ref) =>
        ref.sub === 'ledger'
          ? { exists: () => true, data: () => entryData }
          : { exists: () => true, data: () => personData },
      update: (ref, data) =>
        ref.sub === 'ledger' ? entryUpdate(data) : personUpdate(data),
    })
  ),
}));

let editLedgerEntry;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ editLedgerEntry } = await import('../firebase/ledger'));
  // The live state: an Rs 11,000 bill part-paid with Rs 4,000.
  entryData = { type: 'payment', debit: 0, credit: 4000, date: 3, createdAt: 3, seq: 0 };
  personData = { balance: 7000 };
  allRows = [
    { id: 'pay-1', ...entryData },
    { id: 'bill-1', type: 'purchase', debit: 11000, credit: 0, date: 3, createdAt: 2, seq: 0 },
  ];
});

describe('editLedgerEntry on a supplier payment', () => {
  it('keeps the payment on the credit side', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 6000, mode: 'Cash' });

    const written = entryUpdate.mock.calls[0][0];
    expect(written.credit).toBe(6000);
    // The row must not also claim a debit, or it reads as a bill and a payment
    // at the same time.
    expect(written.debit).toBe(0);
  });

  it('moves the balance by the difference, not by the whole new amount', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 6000, mode: 'Cash' });

    // 7,000 outstanding, paying 2,000 more than before -> 5,000.
    expect(personUpdate.mock.calls[0][0].balance).toBe(5000);
    // The bug produced 1,000 here: it subtracted the full 6,000 again.
    expect(personUpdate.mock.calls[0][0].balance).not.toBe(1000);
  });

  it('agrees with the balance the ledger derives from the rows', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 6000, mode: 'Cash' });

    const written = entryUpdate.mock.calls[0][0];
    const rows = [
      { debit: 11000, credit: 0 },                                  // the bill
      { debit: written.debit, credit: written.credit },             // the edited payment
    ];
    const derived = rows.reduce((s, r) => s + r.debit - r.credit, 0);

    // The header and the statement have to tell the operator the same thing.
    expect(derived).toBe(5000);
    expect(derived).toBe(personUpdate.mock.calls[0][0].balance);
    expect(written.balanceAfter).toBe(derived);
  });

  it('raises the balance again when a payment is corrected downwards', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 1000, mode: 'Cash' });
    // Paid 3,000 less than recorded, so 3,000 more is owed: 7,000 -> 10,000.
    expect(personUpdate.mock.calls[0][0].balance).toBe(10000);
  });

  it('repairs a row an earlier edit already mangled', async () => {
    // What the bug left behind: debit and credit both set.
    entryData = { type: 'payment', debit: 6000, credit: 4000, date: 3, createdAt: 3, seq: 0 };
    personData = { balance: 1000 };   // the skewed figure the bug left behind
    allRows = [
      { id: 'pay-1', ...entryData },
      { id: 'bill-1', type: 'purchase', debit: 11000, credit: 0, date: 3, createdAt: 2, seq: 0 },
    ];

    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 4000, mode: 'Cash' });

    const written = entryUpdate.mock.calls[0][0];
    expect(written.debit).toBe(0);
    expect(written.credit).toBe(4000);
    // And the skewed balance is corrected rather than carried forward: the rows
    // say 11,000 - 4,000, so 7,000 — not 1,000 nudged by a delta.
    expect(personUpdate.mock.calls[0][0].balance).toBe(7000);
  });
});

describe('editLedgerEntry on a customer payment', () => {
  beforeEach(() => {
    entryData = { type: 'payment', debit: 0, credit: 4000, date: 3, createdAt: 3, seq: 0 };
    personData = { balance: 7000 };
    allRows = [
      { id: 'pay-1', ...entryData },
      { id: 'bill-1', type: 'sale', debit: 11000, credit: 0, date: 3, createdAt: 2, seq: 0 },
    ];
  });

  it('behaves identically, because both are stored as credits', async () => {
    await editLedgerEntry('customer', 'cus-1', 'pay-1', { amount: 6000, mode: 'UPI' });

    const written = entryUpdate.mock.calls[0][0];
    expect(written.credit).toBe(6000);
    expect(written.debit).toBe(0);
    expect(personUpdate.mock.calls[0][0].balance).toBe(5000);
  });

  it('still refuses anything that is not a payment', async () => {
    entryData = { type: 'sale', debit: 5000, credit: 0, date: 3, createdAt: 3, seq: 0 };
    await expect(
      editLedgerEntry('customer', 'cus-1', 'pay-1', { amount: 100, mode: 'Cash' })
    ).rejects.toThrow(/only payment entries/i);
    expect(entryUpdate).not.toHaveBeenCalled();
  });

  it('refuses a zero or negative amount', async () => {
    await expect(
      editLedgerEntry('customer', 'cus-1', 'pay-1', { amount: 0, mode: 'Cash' })
    ).rejects.toThrow(/greater than 0/i);
  });
});
