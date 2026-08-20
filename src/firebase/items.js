import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, orderBy, where, limit, writeBatch, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db } from "./config";

export const getCategories = async () => {
  const snapshot = await getDocs(collection(db, "categories"));
  const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Sort locally to avoid Firebase index errors if 'order' index is missing
  cats.sort((a, b) => (a.order || 99) - (b.order || 99));
  
  const seenKeys = new Set();
  return cats.filter(c => {
    if (seenKeys.has(c.key)) return false;
    seenKeys.add(c.key);
    return true;
  });
};

export const addCategory = async (data) => {
  const newDocRef = doc(collection(db, "categories"));
  const payload = {
    ...data,
    key: data.key || data.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    order: data.order || Date.now(), // Fallback order to end of list
    createdAt: serverTimestamp()
  };
  await setDoc(newDocRef, payload);
  return { id: newDocRef.id, ...payload };
};

export const updateCategory = async (id, data) => {
  const catRef = doc(db, "categories", id);
  await updateDoc(catRef, { ...data, updatedAt: serverTimestamp() });
};


export const getItems = async () => {
  const q = query(collection(db, "items"), orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  const items = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      mrp: data.mrp !== undefined && data.mrp !== null ? Number(data.mrp) : (Number(data.rate) || 0)
    };
  });
  
  // Deduplicate by itemId and name
  const seenIds = new Set();
  const seenNames = new Set();
  return items.filter(item => {
    if (seenIds.has(item.id)) return false;
    const nameKey = (item.name || '').trim().toLowerCase();
    if (seenNames.has(nameKey)) return false;
    seenIds.add(item.id);
    seenNames.add(nameKey);
    return true;
  });
};

export const addItem = async (data) => {
  const newDocRef = doc(collection(db, "items"));
  const payload = {
    ...data,
    mrp: Number(data.mrp) || (Number(data.rate) || 0),
    updatedAt: serverTimestamp()
  };
  delete payload.rate;
  await setDoc(newDocRef, payload);
  return newDocRef.id;
};

export const updateItem = async (itemId, data) => {
  const itemRef = doc(db, "items", itemId);
  const payload = { ...data, updatedAt: serverTimestamp() };
  if (payload.mrp !== undefined) payload.mrp = Number(payload.mrp);
  delete payload.rate;
  await updateDoc(itemRef, payload);
};

export const setItemActive = async (itemId, isActive) => {
  const itemRef = doc(db, "items", itemId);
  await updateDoc(itemRef, { active: isActive });
};

export const adjustStock = async (itemId, newStock) => {
  const itemRef = doc(db, "items", itemId);
  await updateDoc(itemRef, { stock: Number(newStock), updatedAt: serverTimestamp() });
};

let isSeeding = false;
let hasSeeded = false;

export const seedIfEmpty = async () => {
  if (isSeeding || hasSeeded) return;
  isSeeding = true;
  try {
    const categoriesSnapshot = await getDocs(collection(db, "categories"));
  
  if (categoriesSnapshot.empty) {
    const batch = writeBatch(db);
    
    const initialCategories = [
      {key:'raw',label:'Raw Rice',labelTamil:'பச்சை அரிசி',order:1},
      {key:'boiled',label:'Boiled Rice',labelTamil:'புழுங்கல் அரிசி',order:2},
      {key:'steam',label:'Half Boiled Rice (Steam)',labelTamil:'அரை புழுங்கல் அரிசி',order:3},
      {key:'basmathi',label:'Basmathi',labelTamil:'பாஸ்மதி',order:4},
      {key:'seeraga',label:'Seeraga Samba',labelTamil:'சீரக சம்பா',order:5}
    ];

    initialCategories.forEach(cat => {
      const docRef = doc(db, "categories", cat.key);
      batch.set(docRef, cat);
    });
    
    await batch.commit();
  }

  const itemsSnapshot = await getDocs(collection(db, "items"));
  
  if (itemsSnapshot.empty) {
    const batch = writeBatch(db);
    
    const seedItems = [
      { "name": "Vaibhav", "categoryKey": "raw", "bagKg": 26, "rate": 1650 },
      { "name": "Air Force", "categoryKey": "raw", "bagKg": 26, "rate": 1600 },
      { "name": "Bhavani Rice", "categoryKey": "raw", "bagKg": 26, "rate": 900 },
      { "name": "Five Star", "categoryKey": "raw", "bagKg": 26, "rate": 1400 },
      { "name": "Broken Rice", "categoryKey": "raw", "bagKg": 26, "rate": 850 },
      { "name": "Veeru", "categoryKey": "raw", "bagKg": 26, "rate": 1700 },
      { "name": "Ambati's Rice", "categoryKey": "raw", "bagKg": 26, "rate": 1650 },
      { "name": "Rettaikilli", "categoryKey": "boiled", "bagKg": 26, "rate": 1500 },
      { "name": "Maragathananayam", "categoryKey": "boiled", "bagKg": 26, "rate": 1500 },
      { "name": "Thamaraisudar", "categoryKey": "boiled", "bagKg": 26, "rate": 1500 },
      { "name": "Rettaikilli Brown Bag", "categoryKey": "boiled", "bagKg": 26, "rate": 1900 },
      { "name": "Annapoorna", "categoryKey": "boiled", "bagKg": 25, "rate": 1350 },
      { "name": "Bullet Rice", "categoryKey": "boiled", "bagKg": 25, "rate": 1250 },
      { "name": "Thangamalai", "categoryKey": "boiled", "bagKg": 25, "rate": 1350 },
      { "name": "Shakthi Special", "categoryKey": "boiled", "bagKg": 25, "rate": 1350 },
      { "name": "Broken Rice-Rettaikilli", "categoryKey": "boiled", "bagKg": 26, "rate": 850 },
      { "name": "Broken Rice-Thanharatham", "categoryKey": "boiled", "bagKg": 26, "rate": 800 },
      { "name": "VIP", "categoryKey": "boiled", "bagKg": 25, "rate": 1300 },
      { "name": "Pachai killi", "categoryKey": "boiled", "bagKg": 25, "rate": 1300 },
      { "name": "Titanic", "categoryKey": "boiled", "bagKg": 25, "rate": 1300 },
      { "name": "Yellow Thamarai", "categoryKey": "boiled", "bagKg": 25, "rate": 1650 },
      { "name": "Meenatchi Spl", "categoryKey": "boiled", "bagKg": 25, "rate": 1250 },
      { "name": "ThangaSeval", "categoryKey": "boiled", "bagKg": 25, "rate": 1250 },
      { "name": "RL", "categoryKey": "steam", "bagKg": 26, "rate": 1650 },
      { "name": "VRI", "categoryKey": "steam", "bagKg": 26, "rate": 1350 },
      { "name": "Zareena xxxl", "categoryKey": "basmathi", "bagKg": 30, "rate": 3000 },
      { "name": "Zareena Classic", "categoryKey": "basmathi", "bagKg": 25, "rate": 2875 },
      { "name": "ARCADIA", "categoryKey": "seeraga", "bagKg": 25, "rate": 5500 }
    ];

    seedItems.forEach(item => {
      const slug = item.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!slug) return;
      const docRef = doc(db, "items", slug);
      batch.set(docRef, {
        name: item.name,
        categoryKey: item.categoryKey,
        bagKg: item.bagKg,
        mrp: item.rate,
        stock: 0,
        active: true,
        updatedAt: serverTimestamp()
      });
    });
    
    await batch.commit();
  }
  
  hasSeeded = true;
  } catch (error) {
    console.error("Error seeding generic items:", error);
  } finally {
    isSeeding = false;
  }
};

export const deleteItem = async (itemId) => {
  const itemRef = doc(db, "items", itemId);
  const itemSnap = await getDoc(itemRef);
  
  if (!itemSnap.exists()) {
    throw new Error("Item not found");
  }
  
  const itemName = itemSnap.data().name || 'Unknown Item';

  // Check if item is used in purchases
  const purchasesQ = query(collection(db, "purchases"), where("itemId", "==", itemId), limit(1));
  const purchasesSnap = await getDocs(purchasesQ);
  if (!purchasesSnap.empty) {
    throw new Error(`Cannot delete '${itemName}' — it has existing purchase records. Deactivate it instead using the Active toggle.`);
  }

  // Check if item is used in sales
  // Fetch all sales and filter client-side as Firestore cannot natively query partial objects inside arrays
  const salesSnap = await getDocs(collection(db, "sales"));
  const isUsedInSales = salesSnap.docs.some(d => {
    const data = d.data();
    return data.items && data.items.some(i => i.itemId === itemId);
  });
  
  if (isUsedInSales) {
    throw new Error(`Cannot delete '${itemName}' — it has existing sales records. Deactivate it instead using the Active toggle.`);
  }

  // If no transactions exist, safely delete the item
  await deleteDoc(itemRef);
  return { deleted: true, itemId, itemName };
};
