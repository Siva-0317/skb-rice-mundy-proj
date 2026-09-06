import { describe, it, expect } from 'vitest';
import { groupItemsByCategory } from '../utils/itemGrouping';

// NEW-06 — Item Masters and Inventory both rendered `categories.map(...)`, so an
// item whose categoryKey matched no category document was filed into a bucket
// nobody iterated. It stayed in Total Bags, in the Dashboard's Stock by Variety
// and in the Stock Summary report, but appeared in no editable table, so it
// could not be corrected from inside the app at all.
//
// Round 3 found "Broken Rice" with categoryKey 'boiled-rice' in exactly that
// state — 400 bags, Rs 3,60,000 — orphaned when the duplicate "Boiled Rice"
// category was deleted.

const CATEGORIES = [
  { key: 'raw', label: 'Raw Rice', labelTamil: 'பச்சை அரிசி' },
  { key: 'boiled', label: 'Boiled Rice', labelTamil: 'புழுங்கல் அரிசி' },
];

describe('groupItemsByCategory', () => {
  it('surfaces an orphaned category key instead of swallowing its items', () => {
    const items = [
      { id: 'i1', name: 'Sona Raw', categoryKey: 'raw', stock: 260 },
      { id: 'i2', name: 'HMT Boiled', categoryKey: 'boiled', stock: 4922 },
      { id: 'i3', name: 'Broken Rice', categoryKey: 'boiled-rice', stock: 400 },
    ];

    const { grouped, displayCategories } = groupItemsByCategory(items, CATEGORIES);

    const orphan = displayCategories.find(c => c.key === 'boiled-rice');
    expect(orphan).toBeDefined();
    expect(orphan.isOrphan).toBe(true);
    expect(orphan.label).toBe('Uncategorised');
    expect(grouped['boiled-rice']).toHaveLength(1);
    expect(grouped['boiled-rice'][0].name).toBe('Broken Rice');
  });

  it('renders every bag the totals count', () => {
    const items = [
      { id: 'i1', categoryKey: 'raw', stock: 418 },
      { id: 'i2', categoryKey: 'boiled', stock: 5563 },
      { id: 'i3', categoryKey: 'boiled-rice', stock: 400 },
    ];

    const { grouped, displayCategories } = groupItemsByCategory(items, CATEGORIES);

    const headerTotal = items.reduce((s, i) => s + i.stock, 0);
    const renderedTotal = displayCategories
      .flatMap(c => grouped[c.key] || [])
      .reduce((s, i) => s + i.stock, 0);

    // This equality is the whole point: the table must account for every bag
    // the header claims. Before the fix these were 6,381 and 5,981.
    expect(renderedTotal).toBe(headerTotal);
    expect(renderedTotal).toBe(6381);
  });

  it('leaves the category list untouched when nothing is orphaned', () => {
    const items = [{ id: 'i1', categoryKey: 'raw', stock: 10 }];
    const { displayCategories } = groupItemsByCategory(items, CATEGORIES);

    expect(displayCategories).toHaveLength(2);
    expect(displayCategories.some(c => c.isOrphan)).toBe(false);
  });

  it('keeps real categories ahead of orphaned ones, and sorts the orphans', () => {
    const items = [
      { id: 'a', categoryKey: 'zzz-gone' },
      { id: 'b', categoryKey: 'aaa-gone' },
      { id: 'c', categoryKey: 'raw' },
    ];
    const keys = groupItemsByCategory(items, CATEGORIES).displayCategories.map(c => c.key);
    expect(keys).toEqual(['raw', 'boiled', 'aaa-gone', 'zzz-gone']);
  });

  it('does not invent an orphan group for a category with no items', () => {
    const { displayCategories } = groupItemsByCategory([], CATEGORIES);
    expect(displayCategories.some(c => c.isOrphan)).toBe(false);
  });

  it('groups an item with no categoryKey at all rather than dropping it', () => {
    const { grouped, displayCategories } = groupItemsByCategory(
      [{ id: 'x', name: 'Stray', stock: 5 }], CATEGORIES
    );
    const orphan = displayCategories.find(c => c.isOrphan);
    expect(orphan).toBeDefined();
    expect(orphan.labelTamil).toBe('(no category)');
    expect(grouped[orphan.key]).toHaveLength(1);
  });

  it('does not let a duplicate category key wipe a bucket that already has items', () => {
    const dupes = [...CATEGORIES, { key: 'raw', label: 'Raw Rice (dupe)' }];
    const { grouped } = groupItemsByCategory([{ id: 'i1', categoryKey: 'raw' }], dupes);
    expect(grouped.raw).toHaveLength(1);
  });

  it('shows an item once even if it arrives twice', () => {
    const twice = [{ id: 'i1', categoryKey: 'raw' }, { id: 'i1', categoryKey: 'raw' }];
    const { grouped } = groupItemsByCategory(twice, CATEGORIES);
    expect(grouped.raw).toHaveLength(1);
  });

  it('handles empty input without throwing', () => {
    expect(() => groupItemsByCategory()).not.toThrow();
    expect(groupItemsByCategory().displayCategories).toEqual([]);
  });
});
