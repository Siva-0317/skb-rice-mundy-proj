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
let purchaseRows;            // the supplier's purchase bills (for allocation)
let getDocsCalls;            // ledger reads only
let purchaseQueryCalls;
let getDocsCallsAtTransactionOpen;
const entryUpdate = vi.fn();
const personUpdate = vi.fn();
const purchaseUpdate = vi.fn();

vi.mock('../firebase/config', () => ({ db: {} }));

vi.mock('../utils/dateIST', () => ({ toMillis: (v) => Number(v) || 0 }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id, sub, subId) => ({ col, id, sub, subId })),
  collection: vi.fn((_db, col) => ({ col })),
  query: vi.fn((c) => c),
  orderBy: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 'ts'),
  // One read of the whole ledger now serves both the recency guard and the
  // balance recompute. `allRows` stands in for the person's ledger. A supplier
  // edit additionally reads the supplier's purchases (a different collection)
  // so the payment can be re-spread over the open bills.
  getDocs: vi.fn(async (q) => {
    if (q && q.col === 'purchases') {
      purchaseQueryCalls += 1;
      return {
        empty: purchaseRows.length === 0,
        docs: purchaseRows.map(r => ({ id: r.id, ref: { col: 'purchases', id: r.id }, data: () => r })),
      };
    }
    getDocsCalls += 1;
    return {
      empty: allRows.length === 0,
      docs: allRows.map(r => ({ id: r.id, data: () => r })),
    };
  }),
  // The ledger query now runs BEFORE the transaction opens, not inside it — a
  // query issued from within a runTransaction callback can block on the stream
  // the transaction holds and hang the save with no error at all. Observed live
  // on 07 Sept 2026: the button sat on "Saving..." indefinitely and nothing was
  // written. These tests pin the ordering.
  runTransaction: vi.fn(async (_db, fn) => {
    if (getDocsCallsAtTransactionOpen === null) {
      getDocsCallsAtTransactionOpen = getDocsCalls;
    }
    return fn({
      get: async (ref) => {
        if (ref.sub === 'ledger') return { exists: () => true, data: () => entryData };
        if (ref.col === 'purchases') {
          const row = purchaseRows.find(r => r.id === ref.id);
          return { exists: () => !!row, data: () => row };
        }
        return { exists: () => true, data: () => personData };
      },
      update: (ref, data) => {
        if (ref.sub === 'ledger') return entryUpdate(data);
        if (ref.col === 'purchases') return purchaseUpdate(ref.id, data);
        return personUpdate(data);
      },
      delete: () => {},
    });
  }),
}));

let editLedgerEntry;

beforeEach(async () => {
  vi.clearAllMocks();
  getDocsCalls = 0;
  purchaseQueryCalls = 0;
  getDocsCallsAtTransactionOpen = null;
  purchaseRows = [];
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

describe('the ledger read is not made inside the transaction', () => {
  it('reads the rows before the transaction opens', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 6000, mode: 'Cash' });

    // If this is 0, the query moved back inside runTransaction and the save can
    // hang forever on the live site with no error to show for it.
    expect(getDocsCallsAtTransactionOpen).toBeGreaterThan(0);
  });

  it('reads the ledger exactly once', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 6000, mode: 'Cash' });
    // One read now serves both the recency guard and the balance recompute.
    expect(getDocsCalls).toBe(1);
  });

  it('reads the open purchases before the transaction too, for a supplier', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 6000, mode: 'Cash' });
    expect(purchaseQueryCalls).toBe(1);
  });

  it('does not read purchases for a customer payment', async () => {
    await editLedgerEntry('customer', 'cus-1', 'pay-1', { amount: 6000, mode: 'Cash' });
    expect(purchaseQueryCalls).toBe(0);
  });
});

describe('editing a supplier payment re-spreads it over the open bills', () => {
  // Round-5 finding: a supplier-level payment lowered the supplier's balance
  // but left the bill reading UNPAID / due ₹11,000 while the header said ₹5,000.
  beforeEach(() => {
    purchaseRows = [
      { id: 'pur-1', billNo: 'PUR-2026-0004', total: 11000, amountPaid: 4000, amountPaidViaSupplier: 4000, balanceDue: 7000, date: 2 },
    ];
    entryData = { type: 'payment', debit: 0, credit: 4000, date: 3, createdAt: 3, seq: 0,
      allocations: [{ purchaseId: 'pur-1', billNo: 'PUR-2026-0004', amount: 4000 }] };
    allRows = [
      { id: 'pay-1', ...entryData },
      { id: 'bill-1', type: 'purchase', debit: 11000, credit: 0, date: 3, createdAt: 2, seq: 0 },
    ];
  });

  it('raises the bill\'s paid figure when the payment is raised', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 6000, mode: 'Cash' });
    const [id, patch] = purchaseUpdate.mock.calls[0];
    expect(id).toBe('pur-1');
    expect(patch.amountPaid).toBe(6000);
    expect(patch.amountPaidViaSupplier).toBe(6000);
    expect(patch.balanceDue).toBe(5000);
    // and the ledger row records the new spread
    expect(entryUpdate.mock.calls[0][0].allocations).toEqual([
      { purchaseId: 'pur-1', billNo: 'PUR-2026-0004', amount: 6000 },
    ]);
  });

  it('gives the bill its due back when the payment is lowered', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 1000, mode: 'Cash' });
    const [, patch] = purchaseUpdate.mock.calls[0];
    expect(patch.amountPaid).toBe(1000);
    expect(patch.balanceDue).toBe(10000);
  });

  it('never applies more to a bill than it is worth', async () => {
    await editLedgerEntry('supplier', 'sup-1', 'pay-1', { amount: 20000, mode: 'Cash' });
    const [, patch] = purchaseUpdate.mock.calls[0];
    expect(patch.amountPaid).toBe(11000);
    expect(patch.balanceDue).toBe(0);
    // the excess stays on the supplier as credit: 11,000 - 20,000
    expect(personUpdate.mock.calls[0][0].balance).toBe(-9000);
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
