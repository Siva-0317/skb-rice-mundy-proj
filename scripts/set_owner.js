/**
 * Promote a signed-up account to the 'owner' role.
 *
 * Why this exists
 * ---------------
 * firestore.rules decides who may edit master data by reading /users/{authUid}.role.
 * AuthContext defaults to 'staff' when that document is missing, so an account that
 * has never had one silently behaves as a restricted user: the sidebar shows "Staff"
 * and every owner-gated action is denied by the security rules. Step 3 of the seed
 * instructions covers creating this document by hand; this script does it for you and
 * is safe to re-run.
 *
 * Usage
 * -----
 *   # Point at a service account key, then:
 *   GOOGLE_APPLICATION_CREDENTIALS=./seed/serviceAccountKey.json \
 *     node scripts/set_owner.js <auth-uid> [email] [name]
 *
 * The Auth UID is in Firebase Console → Authentication → Users → "User UID".
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [uid, email = '', name = 'Owner'] = process.argv.slice(2);

if (!uid) {
  console.error('Usage: node scripts/set_owner.js <auth-uid> [email] [name]');
  process.exit(1);
}

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

const run = async () => {
  const ref = db.collection('users').doc(uid);
  const before = await ref.get();

  await ref.set(
    { name, email, role: 'owner', updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  const after = await ref.get();
  console.log(
    `${before.exists ? 'Updated' : 'Created'} /users/${uid} → role: ${after.data().role}`
  );
  console.log('Sign out and back in for the app to pick up the new role.');
  process.exit(0);
};

run().catch(err => {
  console.error('[set_owner] failed:', err);
  process.exit(1);
});
