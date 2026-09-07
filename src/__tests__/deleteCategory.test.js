import { describe, it, expect, vi, beforeEach } from 'vitest';

// The client's instruction: deleting a category takes its items with it, but
// must NOT take the transactions. That split is only safe because every sale
// line stores { itemId, item: <name>, cat: <categoryKey> } and every purchase
// line stores { itemId, itemName, categoryKey } — all written at sale time — so
// an old bill still shows the right product after the master record is gone.
//
// These tests pin both halves: the cascade deletes items and the category doc
// and nothing else, and it ignores deleteItem's "has transaction history"
// guard, which is the whole reason the cascade needs its own implementation.

let itemDocs = [];
let categoryDocs = [];
let salesDocs = [];
let purchaseDocs = [];

const batchDeletes = [];
const commitMock = vi.fn();

vi.mock('../firebase/config', () => ({ db: {} }));

const snapOf = (rows) => ({
  docs: rows.map(r => ({ id: r.id, ref: { id: r.id, __col: r.__col }, data: () => r })),
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
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 'ts'),
  where: vi.fn((field, _op, value) => ({ field, value })),
  query: vi.fn((col, ...clauses) => ({ col, clauses })),
  getDocs: vi.fn(async (target) => {
    const name = target?.name || target?.col?.name;
    const where = (target?.clauses || []).find(c => c?.field);
    if (name === 'items') {
      const rows = itemDocs.map(r => ({ ...r, __col: 'items' }));
      return snapOf(where ? rows.filter(r => r[where.field] === where.value) : rows);
    }
    if (name === 'categories') {
      const rows = categoryDocs.map(r => ({ ...r, __col: 'categories' }));
      return snapOf(where ? rows.filter(r => r[where.field] === where.value) : rows);
    }
    if (name === 'sales') return snapOf(salesDocs);
    if (name === 'purchases') return snapOf(purchaseDocs);
    return snapOf([]);
  }),
  writeBatch: vi.fn(() => ({
    delete: (ref) => batchDeletes.push(ref),
    set: vi.fn(),
    update: vi.fn(),
    commit: commitMock,
  })),
}));

let deleteCategory, getCategoryDeletionImpact;

beforeEach(async () => {
  vi.clearAllMocks();
  batchDeletes.length = 0;
  ({ deleteCategory, getCategoryDeletionImpact } = await import('../firebase/items'));

  categoryDocs = [
    { id: 'cat-carshed', key: 'carshed', label: 'Carshed' },
    { id: 'cat-raw', key: 'raw', label: 'Raw Rice' },
  ];
  itemDocs = [
    { id: 'i-hmt-carshed', name: 'HMT Boiled - Carshed', categoryKey: 'carshed', stock: 774, mrp: 1550 },
    { id: 'i-vel', name: 'Vel Maligai Thamarai', categoryKey: 'carshed', stock: 100, mrp: 1600 },
    { id: 'i-sona', name: 'Sona Raw', categoryKey: 'raw', stock: 260, mrp: 1750 },
  ];
  salesDocs = [
    { id: 's1', items: [{ itemId: 'i-hmt-carshed', item: 'HMT Boiled - Carshed', cat: 'carshed', bags: 4 }] },
    { id: 's2', items: [{ itemId: 'i-sona', item: 'Sona Raw', cat: 'raw', bags: 6 }] },
  ];
  purchaseDocs = [
    { id: 'p1', itemId: 'i-vel', itemName: 'Vel Maligai Thamarai', categoryKey: 'carshed', bags: 10 },
  ];
});

describe('deleteCategory', () => {
  it('deletes the category and every item under it', async () => {
    const result = await deleteCategory('carshed');

    expect(result.itemsDeleted).toBe(2);
    expect(result.categoryDocsDeleted).toBe(1);
    const ids = batchDeletes.map(r => r.id).sort();
    expect(ids).toEqual(['cat-carshed', 'i-hmt-carshed', 'i-vel']);
  });

  it('deletes items that appear in sales and purchases, which deleteItem refuses to touch', async () => {
    // i-hmt-carshed is on a sale and i-vel is on a purchase. deleteItem would
    // throw for both; the cascade is explicitly allowed to remove them.
    await deleteCategory('carshed');
    expect(batchDeletes.map(r => r.id)).toContain('i-hmt-carshed');
    expect(batchDeletes.map(r => r.id)).toContain('i-vel');
  });

  it('never deletes a sale or a purchase', async () => {
    await deleteCategory('carshed');
    const collections = batchDeletes.map(r => r.__col);
    expect(collections).not.toContain('sales');
    expect(collections).not.toContain('purchases');
    // Only items and the category document.
    expect(new Set(collections)).toEqual(new Set(['items', 'categories']));
  });

  it('leaves other categories and their items alone', async () => {
    await deleteCategory('carshed');
    const ids = batchDeletes.map(r => r.id);
    expect(ids).not.toContain('i-sona');
    expect(ids).not.toContain('cat-raw');
  });

  it('refuses a category that does not exist', async () => {
    await expect(deleteCategory('no-such-key')).rejects.toThrow(/not found/i);
  });

  it('still removes orphaned items when the category document is already gone', async () => {
    // The state NEW-06 left behind: items pointing at a key with no category doc.
    categoryDocs = [{ id: 'cat-raw', key: 'raw', label: 'Raw Rice' }];
    const result = await deleteCategory('carshed');
    expect(result.itemsDeleted).toBe(2);
    expect(result.categoryDocsDeleted).toBe(0);
  });
});

describe('getCategoryDeletionImpact', () => {
  it('reports the stock that will disappear, which is the part that is not recoverable', async () => {
    const impact = await getCategoryDeletionImpact('carshed');

    expect(impact.itemCount).toBe(2);
    expect(impact.totalBags).toBe(874);            // 774 + 100
    expect(impact.stockValue).toBe(774 * 1550 + 100 * 1600);
  });

  it('counts the transactions that will survive, so the operator can see they are kept', async () => {
    const impact = await getCategoryDeletionImpact('carshed');
    expect(impact.affectedSales).toBe(1);
    expect(impact.affectedPurchases).toBe(1);
  });

  it('does not count transactions belonging to other categories', async () => {
    const impact = await getCategoryDeletionImpact('raw');
    expect(impact.affectedSales).toBe(1);
    expect(impact.affectedPurchases).toBe(0);
  });

  it('deletes nothing', async () => {
    await getCategoryDeletionImpact('carshed');
    expect(batchDeletes).toHaveLength(0);
    expect(commitMock).not.toHaveBeenCalled();
  });

  it('handles an empty category', async () => {
    categoryDocs.push({ id: 'cat-empty', key: 'empty', label: 'Empty' });
    const impact = await getCategoryDeletionImpact('empty');
    expect(impact.itemCount).toBe(0);
    expect(impact.totalBags).toBe(0);
    expect(impact.affectedSales).toBe(0);
  });
});
