/**
 * Remove test categories and de-duplicate the two 'Boiled Rice' categories.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *
 *   # See what would happen (writes nothing):
 *   GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/skb-rice-mundy/serviceAccountKey.json \
 *     node scripts/clean_categories.js
 *
 *   # Actually do it:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/skb-rice-mundy/serviceAccountKey.json \
 *     node scripts/clean_categories.js --apply
 *
 * Why this was rewritten
 * ----------------------
 * The previous version matched items by `categoryId`. No item in this database
 * has that field — the app links items to categories exclusively by
 * `categoryKey` (see ItemsList, AddItemModal, NewPurchaseModal, seed.js).
 * So its "repoint the items" batch selected nothing, every time, and it then
 * deleted the category anyway. The net effect was to orphan items rather than
 * migrate them. This version matches on `categoryKey`, and refuses to delete
 * any category that still has items pointing at it.
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const TEST_KEYS = ['test', 'test1', 'Sample Rice', 'Credit'];
const BATCH_LIMIT = 450; // Firestore hard-caps a batch at 500 writes.

try {
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
} catch {
  console.error(
    'Could not initialise firebase-admin.\n' +
    'Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file and retry.'
  );
  process.exit(1);
}

const db = getFirestore();
const log = (...a) => console.log(...a);
const plan = [];   // { kind, detail, run }

const commitInChunks = async ops => {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
};

const run = async () => {
  const [catsSnap, itemsSnap] = await Promise.all([
    db.collection('categories').get(),
    db.collection('items').get(),
  ]);

  const categories = catsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const items = itemsSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));

  const itemsForKey = key => items.filter(i => i.categoryKey === key);

  log(`\nFound ${categories.length} categories, ${items.length} items.\n`);
  log('Categories currently in the database:');
  for (const c of categories) {
    log(`  • id=${c.id}  key=${JSON.stringify(c.key)}  label=${JSON.stringify(c.label)}  → ${itemsForKey(c.key).length} item(s)`);
  }

  // ── 1. Test categories ──────────────────────────────────────────────
  log('\n── Test categories ──');
  const testCats = categories.filter(c => TEST_KEYS.includes(c.key) || TEST_KEYS.includes(c.label));
  if (!testCats.length) log('  none found.');
  for (const c of testCats) {
    const used = itemsForKey(c.key);
    if (used.length) {
      log(`  SKIP  ${JSON.stringify(c.key)} — still referenced by ${used.length} item(s): ${used.map(i => i.name).join(', ')}`);
      log('        Reassign those items first; deleting now would orphan them.');
      continue;
    }
    log(`  DELETE category ${JSON.stringify(c.key)} (id=${c.id}) — unreferenced.`);
    plan.push({ run: () => db.collection('categories').doc(c.id).delete() });
  }

  // ── 2. Duplicate 'Boiled Rice' ──────────────────────────────────────
  log("\n── Duplicate 'Boiled Rice' ──");
  const dups = categories.filter(c => c.key === 'Boiled Rice' || c.label === 'Boiled Rice');
  if (dups.length < 2) {
    log(`  ${dups.length} match — nothing to merge.`);
  } else {
    const scored = dups.map(c => ({ ...c, count: itemsForKey(c.key).length }))
                       .sort((a, b) => b.count - a.count);
    const retain = scored[0];
    log(`  RETAIN id=${retain.id} key=${JSON.stringify(retain.key)} (${retain.count} item(s))`);

    for (const dropped of scored.slice(1)) {
      const affected = itemsForKey(dropped.key);
      if (dropped.key !== retain.key && affected.length) {
        log(`  REPOINT ${affected.length} item(s) from key ${JSON.stringify(dropped.key)} → ${JSON.stringify(retain.key)}:`);
        affected.forEach(i => log(`            - ${i.name}`));
        plan.push({
          run: () => commitInChunks(affected.map(i => b => b.update(i.ref, { categoryKey: retain.key }))),
        });
      } else if (dropped.key === retain.key) {
        log(`  Item links need no change — both docs share key ${JSON.stringify(dropped.key)}.`);
      }
      log(`  DELETE duplicate category id=${dropped.id} key=${JSON.stringify(dropped.key)}`);
      plan.push({ run: () => db.collection('categories').doc(dropped.id).delete() });
    }
  }

  // ── 3. Orphan check ─────────────────────────────────────────────────
  log('\n── Orphaned items (categoryKey matching no category) ──');
  const keys = new Set(categories.map(c => c.key));
  const orphans = items.filter(i => i.categoryKey && !keys.has(i.categoryKey));
  if (!orphans.length) log('  none.');
  else orphans.forEach(i => log(`  ! ${i.name} → categoryKey ${JSON.stringify(i.categoryKey)} does not exist`));

  // ── Execute or report ───────────────────────────────────────────────
  if (!plan.length) {
    log('\nNothing to do.\n');
    return;
  }
  if (!APPLY) {
    log(`\nDRY RUN — ${plan.length} operation(s) planned, nothing written.`);
    log('Re-run with --apply to perform them.\n');
    return;
  }
  log(`\nApplying ${plan.length} operation(s)...`);
  for (const p of plan) await p.run();
  log('Done.\n');
};

run().then(() => process.exit(0)).catch(err => {
  console.error('[clean_categories] failed:', err);
  process.exit(1);
});
