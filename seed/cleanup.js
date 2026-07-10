// One-time cleanup: wipes customer-facing transactional data so you can start fresh.
//
// DELETES:  every customer (and their `ledger` subcollection) + every sale,
//           then resets the sale bill counter so bills restart at SKB-2026-0001.
// KEEPS:    items, categories, suppliers, purchases (master data & supplier side).
//
// The Admin SDK ignores Firestore security rules, so this works even though the
// app blocks all deletes at the rules level. Requires serviceAccountKey.json in
// this /seed folder (same key the seed script uses).
//
// Run:  node cleanup.js

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

async function deleteCollection(db, collectionRef, label) {
  const snap = await collectionRef.get();
  let count = 0;
  for (const docSnap of snap.docs) {
    // Delete known subcollections first (customers have a `ledger` subcollection).
    const subLedger = docSnap.ref.collection('ledger');
    const subSnap = await subLedger.get();
    for (const sub of subSnap.docs) {
      await sub.ref.delete();
    }
    await docSnap.ref.delete();
    count++;
  }
  console.log(`  Deleted ${count} ${label}.`);
  return count;
}

async function run() {
  try {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(
        'Missing serviceAccountKey.json in /seed directory.\n' +
        'Download it from Firebase Console -> Project Settings -> Service Accounts -> Generate new private key.'
      );
    }

    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();

    console.log('Starting customer-data cleanup...');

    console.log('Deleting customers (and their ledgers)...');
    await deleteCollection(db, db.collection('customers'), 'customers');

    console.log('Deleting sales...');
    await deleteCollection(db, db.collection('sales'), 'sales');

    console.log('Resetting sale bill counter to start at SKB-2026-0001...');
    await db.collection('counters').doc('billCounters').set(
      { nextSaleBill: 1 },
      { merge: true }
    );
    console.log('  Counter reset.');

    console.log('\nCleanup complete. Items, categories, suppliers and purchases were left untouched.');
    process.exit(0);
  } catch (error) {
    console.error('\n[CLEANUP ERROR]:', error.message);
    process.exit(1);
  }
}

run();
