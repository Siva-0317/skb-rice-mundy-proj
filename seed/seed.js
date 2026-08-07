const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ─── Init ────────────────────────────────────────────────────────────────────

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    '[ERROR] Missing serviceAccountKey.json in /seed directory.\n' +
    'Download it from Firebase Console → Project Settings → Service Accounts → Generate new private key.'
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
console.log('Loaded service account for project:', serviceAccount.project_id);

initializeApp({
  credential: cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key,
  }),
});

const db = getFirestore();

// ─── Categories ───────────────────────────────────────────────────────────────

async function seedCategories() {
  const categories = [
    { key: 'raw', label: 'Raw Rice', labelTamil: 'பச்சை அரிசி', order: 1 },
    { key: 'boiled', label: 'Boiled Rice', labelTamil: 'புழுங்கல் அரிசி', order: 2 },
    { key: 'steam', label: 'Half Boiled Rice (Steam)', labelTamil: 'அரை புழுங்கல் அரிசி', order: 3 },
    { key: 'basmathi', label: 'Basmathi', labelTamil: 'பாஸ்மதி', order: 4 },
    { key: 'seeraga', label: 'Seeraga Samba', labelTamil: 'சீரக சம்பா', order: 5 },
  ];

  for (const cat of categories) {
    await db.collection('categories').doc(cat.key).set(cat);
  }
  console.log(`✓ ${categories.length} categories seeded`);
}

// ─── Counters ─────────────────────────────────────────────────────────────────

async function seedCounters() {
  // merge:true so re-running never resets an already-in-use counter back to 1
  await db.collection('counters').doc('billCounters').set(
    { nextSaleBill: 1, nextPurchaseBill: 1 },
    { merge: true }
  );
  console.log('✓ counters/billCounters seeded (merge — existing values preserved)');
}

// ─── Items ────────────────────────────────────────────────────────────────────

const ITEMS = [
  // RAW RICE — bagKg: 26
  { name: "Vaibhav", categoryKey: 'raw', bagKg: 26, mrp: 1650 },
  { name: "Air Force", categoryKey: 'raw', bagKg: 26, mrp: 1600 },
  { name: "Bhavani Rice", categoryKey: 'raw', bagKg: 26, mrp: 900 },
  { name: "Five Star", categoryKey: 'raw', bagKg: 26, mrp: 1400 },
  { name: "Broken Rice", categoryKey: 'raw', bagKg: 26, mrp: 850 },
  { name: "Veeru", categoryKey: 'raw', bagKg: 26, mrp: 1700 },
  { name: "Ambati's Rice", categoryKey: 'raw', bagKg: 26, mrp: 1650 },

  // BOILED RICE — mixed bag sizes
  { name: "Rettaikilli", categoryKey: 'boiled', bagKg: 26, mrp: 1500 },
  { name: "Maragathananayam", categoryKey: 'boiled', bagKg: 26, mrp: 1500 },
  { name: "Thamaraisudar", categoryKey: 'boiled', bagKg: 26, mrp: 1500 },
  { name: "Rettaikilli Brown Bag", categoryKey: 'boiled', bagKg: 26, mrp: 1900 },
  { name: "Annapoorna", categoryKey: 'boiled', bagKg: 25, mrp: 1350 },
  { name: "Bullet Rice", categoryKey: 'boiled', bagKg: 25, mrp: 1250 },
  { name: "Thangamalai", categoryKey: 'boiled', bagKg: 25, mrp: 1350 },
  { name: "Shakthi Special", categoryKey: 'boiled', bagKg: 25, mrp: 1350 },
  { name: "VIP", categoryKey: 'boiled', bagKg: 25, mrp: 1300 },
  { name: "Pachai Killi", categoryKey: 'boiled', bagKg: 25, mrp: 1300 },
  { name: "Titanic", categoryKey: 'boiled', bagKg: 25, mrp: 1300 },
  { name: "Yellow Thamarai", categoryKey: 'boiled', bagKg: 25, mrp: 1650 },
  { name: "Meenatchi Spl", categoryKey: 'boiled', bagKg: 25, mrp: 1250 },
  { name: "ThangaSeval", categoryKey: 'boiled', bagKg: 25, mrp: 1250 },
  { name: "Broken Rice-Rettaikilli", categoryKey: 'boiled', bagKg: 26, mrp: 850 },
  { name: "Broken Rice-Thanharatham", categoryKey: 'boiled', bagKg: 26, mrp: 800 },

  // HALF BOILED (STEAM) — bagKg: 26
  { name: "RL", categoryKey: 'steam', bagKg: 26, mrp: 1650 },
  { name: "VRI", categoryKey: 'steam', bagKg: 26, mrp: 1350 },

  // BASMATHI
  { name: "Zareena XXXL", categoryKey: 'basmathi', bagKg: 30, mrp: 3000 },
  { name: "Zareena Classic", categoryKey: 'basmathi', bagKg: 25, mrp: 2875 },

  // SEERAGA SAMBA
  { name: "Arcadia", categoryKey: 'seeraga', bagKg: 25, mrp: 5500 },
];

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function seedItems() {
  for (const item of ITEMS) {
    const slug = toSlug(item.name);
    await db.collection('items').doc(slug).set({
      name: item.name,
      categoryKey: item.categoryKey,
      bagKg: item.bagKg,
      mrp: item.mrp,       // single price field — no `rate`
      stock: 0,              // owner sets real stock via Inventory → Adjust
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`✓ ${ITEMS.length} items seeded (all stock = 0, mrp only, no rate field)`);
}

// ─── Placeholder user ─────────────────────────────────────────────────────────

async function seedPlaceholderUser() {
  await db.collection('users').doc('__placeholder__').set({
    name: 'Owner',
    email: '',
    role: 'owner',
    note: 'Delete this doc. After owner logs in, create a new doc with ID = their Firebase Auth UID.',
  });
  console.log('✓ placeholder user doc written to /users/__placeholder__');
}

// ─── Run ──────────────────────────────────────────────────────────────────────

async function run() {
  try {
    console.log('\nStarting schema seed...\n');

    await seedCategories();
    await seedCounters();
    await seedItems();
    await seedPlaceholderUser();

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Schema seed complete ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next steps:
 1. Firebase Console → Authentication → add owner email/password.
 2. Open the app and log in as owner.
 3. Firestore → /users → delete __placeholder__ doc → create new doc
    with ID = owner's Auth UID, fields: { name, email, role:'owner' }
 4. Inventory → Adjust → enter real stock bag counts per item.
 5. Add customers and suppliers through the app UI.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    process.exit(0);

  } catch (err) {
    console.error('\n[SEED ERROR]:', err);
    process.exit(1);
  }
}

run();