import { describe, it, expect } from 'vitest';
import { withRunningBalance, closingBalance } from '../utils/ledgerBalance';

// NEW-07 — the customer statement's Balance column used to render the
// `balanceAfter` written onto each row at insert time. Nothing rewrote it when
// a row was deleted, so removing a bill left every surviving row of that
// customer's statement showing a balance from before the deletion. Observed in
// round 3: a customer whose real balance was -1,000 had their only remaining
// ledger row printing -4,250.
//
// The column is now derived on read. These tests pin that it is derived from
// the rows actually present, and that it agrees with the customer's balance.

const d = (iso) => new Date(iso);

describe('withRunningBalance', () => {
  it('accumulates debits and credits oldest-first and returns newest-first', () => {
    const rows = withRunningBalance([
      { id: 'b', date: d('2026-09-02'), debit: 0, credit: 400 },
      { id: 'a', date: d('2026-09-01'), debit: 1000, credit: 0 },
      { id: 'c', date: d('2026-09-03'), debit: 250, credit: 0 },
    ]);

    // Newest first for display.
    expect(rows.map(r => r.id)).toEqual(['c', 'b', 'a']);
    // 1000 -> 600 -> 850, read oldest to newest.
    expect(rows.map(r => r.balanceAfter)).toEqual([850, 600, 1000]);
  });

  it('ignores a stale stored balanceAfter rather than trusting it', () => {
    const rows = withRunningBalance([
      // What a surviving row looks like after its sibling bill was deleted:
      // the stored figure still remembers the deleted entries.
      { id: 'p1', date: d('2026-09-06'), debit: 0, credit: 1000, balanceAfter: -4250 },
    ]);

    expect(rows[0].balanceAfter).toBe(-1000);
    expect(rows[0].balanceAfter).not.toBe(-4250);
  });

  it('reproduces the exact round-3 scenario end to end', () => {
    // Bill Rs 1,750 fully paid, Rs 3,250 excess auto-applied, then Rs 1,000 paid.
    const full = [
      { id: 'bill', date: d('2026-09-06'), debit: 1750, credit: 1750, seq: 1 },
      { id: 'auto', date: d('2026-09-06'), debit: 0, credit: 3250, seq: 2 },
      { id: 'pay', date: d('2026-09-06'), debit: 0, credit: 1000, seq: 3 },
    ];
    expect(withRunningBalance(full).map(r => r.balanceAfter)).toEqual([-4250, -3250, 0]);

    // Now delete the bill, which takes its auto-applied excess with it.
    const afterDelete = full.filter(e => e.id === 'pay');
    const rows = withRunningBalance(afterDelete);

    // The statement must agree with the customer's recomputed balance of -1,000,
    // not keep showing the -4,250 it had before the deletion.
    expect(rows).toHaveLength(1);
    expect(rows[0].balanceAfter).toBe(-1000);
  });

  it('puts an opening balance first via its seq of -1, whatever order it arrives in', () => {
    const sameDay = d('2026-08-01');
    const rows = withRunningBalance([
      { id: 'sale', date: sameDay, debit: 500, credit: 0, seq: 0 },
      { id: 'open', date: sameDay, debit: 1200, credit: 0, seq: -1 },
    ]);

    expect(rows.map(r => r.id)).toEqual(['sale', 'open']);
    expect(rows.map(r => r.balanceAfter)).toEqual([1700, 1200]);
  });

  it('orders deterministically when date, createdAt and seq all tie', () => {
    const same = { date: d('2026-08-01'), createdAt: d('2026-08-01'), seq: 0, debit: 100, credit: 0 };
    const once = withRunningBalance([{ ...same, id: 'y' }, { ...same, id: 'x' }]);
    const again = withRunningBalance([{ ...same, id: 'x' }, { ...same, id: 'y' }]);

    // Two reads of the same data must not swap rows, or the balance column
    // appears to jump between page loads.
    expect(once.map(r => r.id)).toEqual(again.map(r => r.id));
  });

  it('does not mutate the array or the entries it was given', () => {
    const original = [{ id: 'a', date: d('2026-09-01'), debit: 10, credit: 0, balanceAfter: 999 }];
    const copy = JSON.parse(JSON.stringify(original));
    withRunningBalance(original);

    expect(JSON.parse(JSON.stringify(original))).toEqual(copy);
  });

  it('treats missing and non-numeric amounts as zero', () => {
    const rows = withRunningBalance([
      { id: 'a', date: d('2026-09-01'), debit: 100 },
      { id: 'b', date: d('2026-09-02'), credit: undefined, debit: null },
      { id: 'c', date: d('2026-09-03'), debit: 'not a number', credit: 40 },
    ]);
    expect(rows.map(r => r.balanceAfter)).toEqual([60, 100, 100]);
  });
});

describe('closingBalance', () => {
  it('equals the last running balance', () => {
    const entries = [
      { id: 'a', date: d('2026-09-01'), debit: 1000, credit: 0 },
      { id: 'b', date: d('2026-09-02'), debit: 0, credit: 400 },
    ];
    const rows = withRunningBalance(entries);
    expect(closingBalance(entries)).toBe(rows[0].balanceAfter);
    expect(closingBalance(entries)).toBe(600);
  });

  it('is zero for an empty statement', () => {
    expect(closingBalance([])).toBe(0);
  });
});
