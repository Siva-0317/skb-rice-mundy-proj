/**
 * Group items under the categories a screen will render.
 *
 * Why this is shared
 * ------------------
 * Item Masters and Inventory each had their own copy of this grouping, and both
 * copies had the same defect: they built a bucket for an item whose categoryKey
 * matched no category document, then rendered `categories.map(...)`, so that
 * bucket was never iterated. The item stayed in every total — Total Bags, the
 * Dashboard's Stock by Variety, the Stock Summary report — while appearing in
 * no editable table, which made it impossible to correct from inside the app.
 * Round 3 found 400 bags worth Rs 3,60,000 in exactly that state, after the
 * duplicate "Boiled Rice" category was deleted without re-pointing its item.
 *
 * One implementation means one place for that rule to be right.
 *
 * @param {Array} items       Items to group; each may carry a categoryKey.
 * @param {Array} categories  Category documents, each with key/label/labelTamil.
 * @returns {{ grouped: Object, displayCategories: Array }}
 *   `grouped` maps category key to its items. `displayCategories` is the
 *   category list to render: the real categories, followed by one synthetic
 *   "Uncategorised" entry per orphaned key, each flagged `isOrphan`.
 */
export const groupItemsByCategory = (items = [], categories = []) => {
  const grouped = {};

  // Duplicate category keys would otherwise reset a bucket that already has
  // items in it, silently dropping them from the screen.
  const seenKeys = new Set();
  categories.forEach(c => {
    if (c && c.key && !seenKeys.has(c.key)) {
      seenKeys.add(c.key);
      grouped[c.key] = [];
    }
  });

  // The same item id arriving twice should occupy one row, not two.
  const seenItemIds = new Set();
  items.forEach(item => {
    if (!item || seenItemIds.has(item.id)) return;
    seenItemIds.add(item.id);

    const key = item.categoryKey ?? '';
    if (grouped[key]) grouped[key].push(item);
    else grouped[key] = [item];
  });

  const known = new Set(categories.map(c => c && c.key));
  const orphanKeys = Object.keys(grouped)
    .filter(key => !known.has(key) && grouped[key].length > 0)
    .sort();

  const displayCategories = [
    ...categories,
    ...orphanKeys.map(key => ({
      key,
      label: 'Uncategorised',
      // The raw key is the most useful thing to show here: it is what has to be
      // corrected on each item, and it names the category that went missing.
      labelTamil: key || '(no category)',
      isOrphan: true,
    })),
  ];

  return { grouped, displayCategories };
};
