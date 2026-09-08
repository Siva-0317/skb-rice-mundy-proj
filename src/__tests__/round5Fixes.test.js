import { describe, it, expect, vi, beforeEach } from 'vitest';

// Round-5 QA (08 Sept 2026) — the HIGH and MEDIUM findings, pinned:
//   1. a negative "Amount paid now" was saved on a sale and inflated the balance
//   2. deleting a purchase whose bags were already sold clamped stock to 0 and
//      left phantom stock once the sale was reversed
//   3. a category could be created with the same name as an existing one
//   4. a supplier-level payment never reached the bills it paid for

let firestoreState;

vi.mock('../firebase/config', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id, sub, subId) => ({ col, id: id || `new-${Math.random()}`, sub, subId })),
  collection: vi.fn((_db, col) => ({ col })),
  query: vi.fn((c) => c),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 'ts'),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), update: vi.fn(), commit: vi.fn(async () => {}) })),
  getDoc: vi.fn(async (ref) => {
    const row = (firestoreState[ref.col] || []).find(r => r.id === ref.id);
    return { exists: () => !!row, data: () => row, id: ref.id };
  }),
  getDocs: vi.fn(async (q) => {
    const rows = firestoreState[q.col] || [];
    return { empty: rows.length === 0, size: rows.length, docs: rows.map(r => ({ id: r.id, ref: { col: q.col, id: r.id }, data: () => r })) };
  }),
  runTransaction: vi.fn(async (_db, fn) => fn({
    get: async (ref) => {
      const row = (firestoreState[ref.col] || []).find(r => r.id === ref.id);
      return { exists: () => !!row, data: () => row, id: ref.id };
    },
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  firestoreState = {};
});

describe('1. sales refuse a negative "amount paid now"', () => {
  it('createSale throws before touching the database', async () => {
    const { createSale } = await import('../firebase/sales');
    const { runTransaction } = await import('firebase/firestore');
    await expect(createSale({
      customerId: 'c1', customerName: 'X', date: '2026-09-08', advance: -100, remarks: '',
      rows: [{ itemId: 'i1', item: 'Sona Raw', bags: 3, mrp: 1800 }],
    })).rejects.toThrow(/cannot be negative/);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('createSale refuses a line with zero or negative bags', async () => {
    const { createSale } = await import('../firebase/sales');
    await expect(createSale({
      customerId: 'c1', customerName: 'X', date: '2026-09-08', advance: 0, remarks: '',
      rows: [{ itemId: 'i1', item: 'Sona Raw', bags: -5, mrp: 1800 }],
    })).rejects.toThrow(/greater than zero/);
  });

  it('editSale refuses a negative bill-level payment too', async () => {
    const { editSale } = await import('../firebase/sales');
    await expect(editSale('s1', {
      customerId: 'c1', customerName: 'X', date: '2026-09-08', advance: 0, remarks: '',
      rows: [{ itemId: 'i1', item: 'Sona Raw', bags: 1, mrp: 1800 }], paymentAmount: -1, paymentMode: 'Cash',
    })).rejects.toThrow(/cannot be negative/);
  });
});

describe('2. a purchase cannot be deleted once its bags have been sold', () => {
  beforeEach(() => {
    firestoreState = {
      purchases: [{ id: 'p1', billNo: 'PUR-2026-0005', supplierId: 's1', itemId: 'i1', bags: 5, total: 7000, amountPaid: 0 }],
      suppliers: [{ id: 's1', balance: 7000 }],
      items: [{ id: 'i1', name: 'Steam Rice', stock: 1 }],   // 9 came in, 8 were sold
    };
  });

  it('refuses instead of clamping the stock to zero', async () => {
    const { deletePurchase } = await import('../firebase/purchases');
    await expect(deletePurchase('p1')).rejects.toThrow(/only 1 are in stock now \(4 already sold/);
  });

  it('the dialog pre-check names the shortfall', async () => {
    const { getPurchaseDeletionBlockers } = await import('../firebase/purchases');
    const blockers = await getPurchaseDeletionBlockers(firestoreState.purchases[0]);
    expect(blockers).toEqual([{ itemId: 'i1', name: 'Steam Rice', bags: 5, stock: 1, shortfall: 4 }]);
  });

  it('still deletes when the bags are all in stock', async () => {
    firestoreState.items[0].stock = 9;
    const { deletePurchase, getPurchaseDeletionBlockers } = await import('../firebase/purchases');
    expect(await getPurchaseDeletionBlockers(firestoreState.purchases[0])).toEqual([]);
    await expect(deletePurchase('p1')).resolves.toMatchObject({ deleted: true });
  });
});

describe('3. category names are unique, ignoring case and spacing', () => {
  beforeEach(() => {
    firestoreState = { categories: [{ id: 'c1', key: 'raw', label: 'Raw Rice' }] };
  });

  it('rejects "raw rice" when "Raw Rice" exists', async () => {
    const { addCategory } = await import('../firebase/items');
    await expect(addCategory({ label: 'raw  rice' })).rejects.toThrow(/already exists/);
  });

  it('rejects a clashing key even with a different label', async () => {
    const { addCategory } = await import('../firebase/items');
    await expect(addCategory({ label: 'Raw', key: 'raw' })).rejects.toThrow(/key "raw" already exists/);
  });

  it('accepts a genuinely new category and derives its key', async () => {
    const { addCategory } = await import('../firebase/items');
    const created = await addCategory({ label: 'Broken Rice', labelTamil: 'நொய்' });
    expect(created.key).toBe('broken-rice');
    expect(created.labelTamil).toBe('நொய்');
  });

  it('lets a category be renamed to itself but not onto another', async () => {
    firestoreState.categories.push({ id: 'c2', key: 'boiled', label: 'Boiled Rice' });
    const { updateCategory } = await import('../firebase/items');
    await expect(updateCategory('c1', { label: 'RAW RICE' })).resolves.toBeUndefined();
    await expect(updateCategory('c1', { label: 'Boiled Rice' })).rejects.toThrow(/already exists/);
  });
});

describe('4. supplier payments are spread oldest-bill-first', () => {
  const docsFor = (rows) => rows.map(r => ({ ref: { col: 'purchases', id: r.id }, data: r }));

  it('fills the oldest bill first and carries the rest forward', async () => {
    const { planAllocation } = await import('../firebase/supplierAllocations');
    const plan = planAllocation(docsFor([
      { id: 'a', billNo: 'PUR-1', total: 11000, amountPaid: 0, date: 1 },
      { id: 'b', billNo: 'PUR-2', total: 7000, amountPaid: 0, date: 2 },
    ]), 15000);
    expect(plan.allocations).toEqual([
      { purchaseId: 'a', billNo: 'PUR-1', amount: 11000 },
      { purchaseId: 'b', billNo: 'PUR-2', amount: 4000 },
    ]);
    expect(plan.unallocated).toBe(0);
    expect(plan.patches.find(p => p.ref.id === 'b').patch).toEqual({ amountPaid: 4000, amountPaidViaSupplier: 4000, balanceDue: 3000 });
  });

  it('leaves the excess as supplier credit when every bill is settled', async () => {
    const { planAllocation } = await import('../firebase/supplierAllocations');
    const plan = planAllocation(docsFor([{ id: 'a', billNo: 'PUR-1', total: 1000, amountPaid: 600, date: 1 }]), 1000);
    expect(plan.allocations).toEqual([{ purchaseId: 'a', billNo: 'PUR-1', amount: 400 }]);
    expect(plan.unallocated).toBe(600);
  });

  it('undoes an old spread before applying a new one, writing each bill once', async () => {
    const { planReallocation } = await import('../firebase/supplierAllocations');
    const plan = planReallocation(
      docsFor([{ id: 'a', billNo: 'PUR-1', total: 11000, amountPaid: 6000, amountPaidViaSupplier: 6000, date: 1 }]),
      [{ purchaseId: 'a', billNo: 'PUR-1', amount: 6000 }],
      1000,
    );
    expect(plan.patches).toHaveLength(1);
    expect(plan.patches[0].patch).toEqual({ amountPaid: 1000, amountPaidViaSupplier: 1000, balanceDue: 10000 });
  });

  it('a bill-level payment already on the bill is untouched by the reversal', async () => {
    const { planReallocation } = await import('../firebase/supplierAllocations');
    // 3,000 paid on the bill directly, 2,000 via the supplier; supplier payment removed
    const plan = planReallocation(
      docsFor([{ id: 'a', billNo: 'PUR-1', total: 11000, amountPaid: 5000, amountPaidViaSupplier: 2000, date: 1 }]),
      [{ purchaseId: 'a', amount: 2000 }],
      0,
    );
    expect(plan.patches[0].patch).toEqual({ amountPaid: 3000, amountPaidViaSupplier: 0, balanceDue: 8000 });
  });
});
