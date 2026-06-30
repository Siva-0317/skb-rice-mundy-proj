const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { parse } = require('csv-parse/sync');

async function seedCategories(db) {
  const initialCategories = [
    { key: 'raw', label: 'Raw Rice', labelTamil: 'பச்சை அரிசி', order: 1 },
    { key: 'boiled', label: 'Boiled Rice', labelTamil: 'புழுங்கல் அரிசி', order: 2 },
    { key: 'steam', label: 'Half Boiled Rice (Steam)', labelTamil: 'அரை புழுங்கல் அரிசி', order: 3 },
    { key: 'basmathi', label: 'Basmathi', labelTamil: 'பாஸ்மதி', order: 4 },
    { key: 'seeraga', label: 'Seeraga Samba', labelTamil: 'சீரக சம்பா', order: 5 }
  ];

  let count = 0;
  for (const cat of initialCategories) {
    // Deterministic ID = the category key itself (e.g. 'raw', 'boiled')
    await db.collection('categories').doc(cat.key).set(cat);
    count++;
  }
  return count;
}

async function seedItemsFromCsv(db, filePath) {
  const absolutePath = path.resolve(__dirname, filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing CSV file at ${filePath}. Please place items.csv in the /seed folder.`);
  }

  const csvContent = fs.readFileSync(absolutePath, 'utf8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  let count = 0;
  for (const row of records) {
    if (!row.name) continue;

    // Slug is item name lowercased and non-alphanumeric chars replaced with '-'
    const slug = row.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) continue;

    const data = {
      name: row.name,
      categoryKey: row.categoryKey,
      bagKg: Number(row.bagKg) || 0,
      rate: Number(row.rate) || 0,
      mrp: Number(row.mrp !== undefined && row.mrp !== '' ? row.mrp : row.rate) || 0,
      stock: Number(row.stock) || 0,
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Deterministic ID = item slug, making writes idempotent
    await db.collection('items').doc(slug).set(data);
    count++;
  }
  return count;
}

async function run() {
  try {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(
        'Missing serviceAccountKey.json in /seed directory.\n' +
        'Please download it from Firebase Console -> Project Settings -> Service Accounts -> Generate new private key.'
      );
    }

    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    const db = admin.firestore();

    console.log('Starting master data seed...');
    
    const catCount = await seedCategories(db);
    console.log(`Successfully seeded ${catCount} categories.`);

    const itemCount = await seedItemsFromCsv(db, './items.csv');
    console.log(`Successfully seeded ${itemCount} items from CSV.`);

    console.log(`Seed complete! Total records written: ${catCount + itemCount}`);
    process.exit(0);
  } catch (error) {
    console.error('\n[SEED ERROR]:', error.message);
    process.exit(1);
  }
}

run();
