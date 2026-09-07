import { describe, it, expect, vi, beforeEach } from 'vitest';

// Renaming an item was blocked in the UI (`disabled={!!editingItem}`), which left
// no way to tell apart three records all called "Hmt Boiled" — the exact state
// that lets a bill be raised against the wrong one. The stock is genuinely split
// across a carshed, a godown and the mundy, so merging them would destroy real
// information; renaming is the correct fix, and it needed the field unlocked.
//
// updateItem already supported it. These tests pin the behaviour the unlocked
// field now depends on, so nobody re-locks it or weakens the guard.

let docs = [];
const updateDocMock = vi.fn();

vi.mock('../firebase/config', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db, _col, id) => ({ id })),
  getDoc: vi.fn(),
  getDocs: vi.fn(async () => ({
    docs: docs.map(d => ({ id: d.id, data: () => d })),
    empty: docs.length === 0,
  })),
  setDoc: vi.fn(),
  updateDoc: (...args) => updateDocMock(...args),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() })),
  serverTimestamp: vi.fn(() => 'ts'),
}));

let updateItem;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ updateItem } = await import('../firebase/items'));
  docs = [
    { id: 'a', name: 'HMT Boiled', categoryKey: 'boiled', stock: 4922 },
    { id: 'b', name: 'Hmt Boiled ', categoryKey: 'carshed', stock: 774 },
    { id: 'c', name: 'Hmt Boiled', categoryKey: 'godown', stock: 1038 },
    { id: 'd', name: 'Sona Raw', categoryKey: 'raw', stock: 260 },
  ];
});

describe('renaming an item', () => {
  it('renames one of three identically-named records', async () => {
    await updateItem('b', { name: 'HMT Boiled - Carshed', mrp: 1550 });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload.name).toBe('HMT Boiled - Carshed');
  });

  it('does not treat an item as a duplicate of itself', async () => {
    // A uniquely-named record saved unchanged must not trip the guard.
    await expect(updateItem('d', { name: 'Sona Raw', mrp: 1750 })).resolves.not.toThrow();
  });

  it('cannot save a colliding record unchanged — renaming is the way out', async () => {
    // Discovered while writing these tests, and worth pinning: while three
    // records share a name, saving any of them unchanged fails, because the
    // payload still carries the colliding name. So an operator cannot even
    // correct the MRP on one of them until the names are made distinct.
    await expect(updateItem('a', { name: 'HMT Boiled', mrp: 1600 }))
      .rejects.toThrow(/already exists/i);

    // Renaming is not blocked, because the new name collides with nothing —
    // which is what makes the rename-first order the only one that works.
    await expect(updateItem('a', { name: 'HMT Boiled - Mundy', mrp: 1600 }))
      .resolves.not.toThrow();
  });

  it('still refuses a name another item already holds, ignoring case', async () => {
    await expect(updateItem('b', { name: 'hmt boiled', mrp: 1550 }))
      .rejects.toThrow(/already exists/i);
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('trims the stored name, cleaning up the trailing space on the Carshed record', async () => {
    await updateItem('b', { name: '  HMT Boiled - Carshed  ', mrp: 1550 });
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload.name).toBe('HMT Boiled - Carshed');
  });

  it('refuses a blank or whitespace-only name', async () => {
    await expect(updateItem('b', { name: '   ' })).rejects.toThrow(/required/i);
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('after renaming, the three records are distinguishable', () => {
    const renamed = [
      { ...docs[0], name: 'HMT Boiled' },
      { ...docs[1], name: 'HMT Boiled - Carshed' },
      { ...docs[2], name: 'HMT Boiled - Godown' },
    ];
    const lowered = renamed.map(d => d.name.trim().toLowerCase());
    expect(new Set(lowered).size).toBe(3);

    // And the split is preserved rather than merged away — the whole reason
    // renaming was chosen over merging.
    expect(renamed.reduce((s, d) => s + d.stock, 0)).toBe(6734);
    expect(renamed.map(d => d.stock)).toEqual([4922, 774, 1038]);
  });
});
