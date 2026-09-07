import { describe, it, expect, vi, beforeEach } from 'vitest';

// Found while implementing category deletion, and it had to be fixed BEFORE
// shipping it.
//
// getCategoryPnL seeded its accumulator only from the live categories
// collection, and every accumulator line was wrapped in `if (catMap[catKey])`.
// A purchase or sale whose category no longer existed was therefore dropped
// from the report in silence — the totals just got smaller.
//
// That matters here specifically because the client's instruction was that
// deleting a category must NOT delete the transactions. Keeping the rows in the
// database while they vanish from the P&L is the same loss from the business's
// point of view.
//
// A second, pre-existing bug in the same lines: an unresolvable category was
// defaulted to 'raw', which did not lose the row but filed it under Raw Rice
// and inflated that category's figures.

let purchaseDocs = [];
let salesDocs = [];
let itemDocs = [];
let categoryDocs = [];

vi.mock('../firebase/config', () => ({ db: {} }));

const asDate = (iso) => ({ toDate: () => new Date(iso) });

const snapOf = (rows) => ({
  docs: rows.map(r => ({ id: r.id, data: () => r })),
  size: rows.length,
  empty: rows.length === 0,
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 'ts'),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), set: vi.fn(), update: vi.fn(), commit: vi.fn() })),
  query: vi.fn((col) => col),
  getDocs: vi.fn(async (target) => {
    const name = target?.name;
    if (name === 'purchases') return snapOf(purchaseDocs);
    if (name === 'sales') return snapOf(salesDocs);
    if (name === 'items') return snapOf(itemDocs);
    if (name === 'categories') return snapOf(categoryDocs);
    return snapOf([]);
  }),
}));

let getCategoryPnL;
const RANGE = { from: '2026-09-01', to: '2026-09-30' };

beforeEach(async () => {
  vi.clearAllMocks();
  ({ getCategoryPnL } = await import('../firebase/reports'));

  categoryDocs = [{ id: 'c1', key: 'raw', label: 'Raw Rice', order: 1 }];
  itemDocs = [{ id: 'i-sona', name: 'Sona Raw', categoryKey: 'raw' }];

  purchaseDocs = [
    { id: 'p1', date: asDate('2026-09-07'), items: [{ itemId: 'i-sona', categoryKey: 'raw', bags: 10, amount: 11000 }] },
    // A purchase in a category that has since been deleted.
    { id: 'p2', date: asDate('2026-09-07'), items: [{ itemId: 'i-gone', categoryKey: 'carshed', bags: 5, amount: 7000 }] },
  ];
  salesDocs = [
    { id: 's1', date: asDate('2026-09-07'), items: [{ itemId: 'i-sona', categoryKey: 'raw', bags: 6, amount: 10500 }] },
    { id: 's2', date: asDate('2026-09-07'), items: [{ itemId: 'i-gone', categoryKey: 'carshed', bags: 2, amount: 3400 }] },
  ];
});

const rowFor = (rows, match) => rows.find(r => new RegExp(match, 'i').test(r.category || r.label || r.key || ''));

describe('getCategoryPnL with a deleted category', () => {
  it('still reports the deleted category\'s purchases and sales', async () => {
    const { rows } = await getCategoryPnL(RANGE);
    const orphan = rowFor(rows, 'carshed');

    // Before the fix this row did not exist at all and its figures were gone.
    expect(orphan).toBeDefined();
    expect(orphan.bagsBought).toBe(5);
    expect(orphan.bagsSold).toBe(2);
  });

  it('names the row so the cause is obvious rather than cryptic', async () => {
    const { rows } = await getCategoryPnL(RANGE);
    const orphan = rowFor(rows, 'carshed');
    expect(orphan.category || orphan.label).toMatch(/uncategorised/i);
  });

  it('does not misfile the deleted category\'s figures under Raw Rice', async () => {
    const { rows } = await getCategoryPnL(RANGE);
    const raw = rowFor(rows, 'raw rice');

    // Raw Rice must show only its own trade: 10 bags bought, 6 sold.
    expect(raw.bagsBought).toBe(10);
    expect(raw.bagsSold).toBe(6);
  });

  it('accounts for every bag that was traded', async () => {
    const { rows } = await getCategoryPnL(RANGE);
    const bought = rows.reduce((s, r) => s + (r.bagsBought || 0), 0);
    const sold = rows.reduce((s, r) => s + (r.bagsSold || 0), 0);

    // 10 + 5 bought, 6 + 2 sold. Before the fix these were 10 and 6.
    expect(bought).toBe(15);
    expect(sold).toBe(8);
  });
});

describe('getCategoryPnL with no category information at all', () => {
  it('does not silently credit Raw Rice with an unknown line', async () => {
    purchaseDocs = [{ id: 'p3', date: asDate('2026-09-07'), items: [{ itemId: 'i-mystery', bags: 9, amount: 9000 }] }];
    salesDocs = [];

    const { rows } = await getCategoryPnL(RANGE);
    const raw = rowFor(rows, 'raw rice');
    expect(raw.bagsBought).toBe(0);

    const unknown = rowFor(rows, 'unknown');
    expect(unknown).toBeDefined();
    expect(unknown.bagsBought).toBe(9);
  });
});
