import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// We'll try initializing without credentials to see if Application Default Credentials work.
try {
  initializeApp();
} catch (e) {
  console.error("Failed to initialize firebase-admin. ADC not found.");
  process.exit(1);
}

const db = getFirestore();

async function cleanCategories() {
  console.log("Starting cleanup...");
  const categoriesRef = db.collection('categories');
  const snapshot = await categoriesRef.get();
  
  const categories = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // 1. Delete unused test categories
  const testKeys = ['test', 'test1', 'Sample Rice', 'Credit'];
  const toDelete = categories.filter(c => testKeys.includes(c.key) || testKeys.includes(c.label));
  
  for (const c of toDelete) {
    console.log(`Deleting test category: ${c.key}`);
    await categoriesRef.doc(c.id).delete();
  }
  
  // 2. Handle duplicate 'Boiled Rice'
  const boiledRiceCats = categories.filter(c => c.key === 'Boiled Rice' || c.label === 'Boiled Rice');
  if (boiledRiceCats.length > 1) {
    console.log(`Found ${boiledRiceCats.length} 'Boiled Rice' categories.`);
    
    // Check which one is used
    const itemsRef = db.collection('items');
    const itemsSnap = await itemsRef.get();
    
    let retainId = boiledRiceCats[0].id;
    let deleteId = boiledRiceCats[1].id;
    
    let retainCount = 0;
    let deleteCount = 0;
    
    itemsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.categoryKey === boiledRiceCats[0].key || data.categoryId === boiledRiceCats[0].id) {
        retainCount++;
      }
      if (data.categoryKey === boiledRiceCats[1].key || data.categoryId === boiledRiceCats[1].id) {
        deleteCount++;
      }
    });
    
    if (deleteCount > retainCount) {
      retainId = boiledRiceCats[1].id;
      deleteId = boiledRiceCats[0].id;
    }
    
    console.log(`Retaining ${retainId} (used in ${Math.max(retainCount, deleteCount)} items). Deleting ${deleteId}.`);
    
    // Update items to point to retainId
    const batch = db.batch();
    itemsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.categoryId === deleteId) {
        batch.update(doc.ref, { categoryId: retainId });
      }
    });
    await batch.commit();
    console.log("Updated items.");
    
    await categoriesRef.doc(deleteId).delete();
    console.log(`Deleted duplicate category ${deleteId}.`);
  }
  
  console.log("Cleanup complete!");
}

cleanCategories().catch(console.error);
