import { describe, it, expect, vi, beforeEach } from 'vitest';

// BUG-02 / BUG-24 — every screen must count the same stock.
//
// getUniqueActiveItems used to drop any item whose name matched one already seen
// (case-insensitively), keeping whichever sorted first. The Dashboard, the Inventory
// page and the Total Inventory report were built on it; the Stock Summary and Current
// Stock reports read the items collection directly. The result was one business
// reporting two stock levels — 6,033 bags against 8,317 — with 2,284 bags worth about
// Rs 32 lakh visible in one place and invisible in the other.

const mockDocs = [
  { id: 'i1', name: 'HMT Boiled',  categoryKey: 'boiled',  stock: 4932, mrp: 1550, active: true },
  { id: 'i2', name: 'Hmt Boiled',  categoryKey: 'carshed', stock: 774,  mrp: 1550, active: true },
  { id: 'i3', name: 'Hmt Boiled',  categoryKey: 'godown',  stock: 1038, mrp: 1550, active: true },
  { id: 'i4', name: 'Broken Boiled', categoryKey: 'boiled', stock: 472, mrp: 850,  active: true },
  { id: 'i5', name: 'Sona Raw',    categoryKey: 'raw',     stock: 260,  mrp: 1750, active: true },
  { id: 'i6', name: 'Retired Item', categoryKey: 'raw',    stock: 99,   mrp: 100,  active: false },
];

vi.mock('../firebase/config', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(async () => ({
    docs: mockDocs.map(d => ({ id: d.id, data: () => d })),
    empty: mockDocs.length === 0,
  })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() })),
  serverTimestamp: vi.fn(() => 'ts'),
}));

let getActiveItems, getDuplicateItemNames;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ getActiveItems, getDuplicateItemNames } = await import('../firebase/items'));
});

describe('BUG-02 / BUG-24 — active item set', () => {
  it('keeps every active item, including ones whose names collide', async () => {
    const items = await getActiveItems();
    expect(items).toHaveLength(5);
    expect(items.map(i => i.id).sort()).toEqual(['i1', 'i2', 'i3', 'i4', 'i5']);
  });

  it('excludes items explicitly marked inactive', async () => {
    const items = await getActiveItems();
    expect(items.find(i => i.id === 'i6')).toBeUndefined();
  });

  it('counts the full stock, not a de-duplicated subset', async () => {
    const items = await getActiveItems();
    const bags = items.reduce((sum, i) => sum + Number(i.stock || 0), 0);
    // 4932 + 774 + 1038 + 472 + 260 — the three name-colliding records account for
    // 2,284 bags that the old de-duplication silently discarded.
    expect(bags).toBe(7476);
    expect(bags).not.toBe(7476 - 2284);
  });

  it('values the full stock', async () => {
    const items = await getActiveItems();
    const value = items.reduce((sum, i) => sum + Number(i.stock || 0) * Number(i.mrp || 0), 0);
    expect(value).toBe(4932 * 1550 + 774 * 1550 + 1038 * 1550 + 472 * 850 + 260 * 1750);
  });

  it('reports colliding names so they can be merged at source', async () => {
    const dupes = await getDuplicateItemNames();
    expect(dupes).toContain('hmt boiled');
    expect(dupes).not.toContain('sona raw');
  });
});
