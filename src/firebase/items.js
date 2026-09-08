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

const slugifyCategory = (label) => String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const normaliseLabel = (label) => String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();

// A category name must be unique, ignoring case and spacing. Without this, "raw rice"
// was accepted alongside "Raw Rice" and the two could never be told apart in reports.
// The key is checked too because it is what items and bills reference.
const assertCategoryUnique = async ({ label, key }, excludeId = null) => {
  const snapshot = await getDocs(collection(db, "categories"));
  const wantedLabel = normaliseLabel(label);
  const wantedKey = key ? String(key).trim().toLowerCase() : null;
  snapshot.docs.forEach(d => {
    if (excludeId && d.id === excludeId) return;
    const c = d.data();
    if (normaliseLabel(c.label) === wantedLabel) {
      throw new Error(`A category named "${c.label}" already exists.`);
    }
    if (wantedKey && String(c.key || '').toLowerCase() === wantedKey) {
      throw new Error(`A category with the key "${c.key}" already exists.`);
    }
  });
};

export const addCategory = async (data) => {
  const label = String(data.label || '').trim();
  if (!label) throw new Error("Category name is required.");
  const key = (data.key && String(data.key).trim()) || slugifyCategory(label);
  if (!key) throw new Error("Category key could not be derived from the name.");
  await assertCategoryUnique({ label, key });

  const newDocRef = doc(collection(db, "categories"));
  const payload = {
    ...data,
    label,
    key,
    labelTamil: data.labelTamil ? String(data.labelTamil).trim() : '',
    order: data.order || Date.now(), // Fallback order to end of list
    createdAt: serverTimestamp()
  };
  await setDoc(newDocRef, payload);
  return { id: newDocRef.id, ...payload };
};

export const updateCategory = async (id, data) => {
  const catRef = doc(db, "categories", id);
  const patch = { ...data };
  if (patch.label !== undefined) {
    patch.label = String(patch.label).trim();
    if (!patch.label) throw new Error("Category name is required.");
    await assertCategoryUnique({ label: patch.label, key: patch.key }, id);
  }
  if (patch.labelTamil !== undefined) patch.labelTamil = String(patch.labelTamil).trim();
  await updateDoc(catRef, { ...patch, updatedAt: serverTimestamp() });
};


/**
 * Count what a category delete would take with it, without deleting anything.
 *
 * The operator needs to see the size of this before confirming: the items go,
 * and their stock goes out of every total with them. The transactions do not —
 * a sale or purchase stores the item name and category key as a snapshot
 * alongside the id, so historic bills keep reading correctly after both the
 * item and the category are gone.
 */
export const getCategoryDeletionImpact = async (categoryKey) => {
  const itemsSnap = await getDocs(query(collection(db, "items"), where("categoryKey", "==", categoryKey)));
  const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const itemIds = new Set(items.map(i => i.id));

  const [salesSnap, purchasesSnap] = await Promise.all([
    getDocs(collection(db, "sales")),
    getDocs(collection(db, "purchases")),
  ]);

  const countsLine = (row) => itemIds.has(row?.itemId);
  const affectedSales = salesSnap.docs.filter(d => (d.data().items || []).some(countsLine)).length;
  const affectedPurchases = purchasesSnap.docs.filter(d => {
    const p = d.data();
    return Array.isArray(p.items) ? p.items.some(countsLine) : itemIds.has(p.itemId);
  }).length;

  return {
    items,
    itemCount: items.length,
    totalBags: items.reduce((sum, i) => sum + (Number(i.stock) || 0), 0),
    stockValue: items.reduce((sum, i) => sum + (Number(i.stock) || 0) * (Number(i.mrp) || 0), 0),
    affectedSales,
    affectedPurchases,
  };
};

/**
 * Delete a category and every item filed under it. Transactions are left alone.
 *
 * This deliberately ignores the "item has transaction history" guard that
 * deleteItem enforces. That guard exists to stop a bill pointing at nothing,
 * but a bill does not point at the item document for its display: every sale
 * line stores { itemId, item: <name>, cat: <categoryKey> } and every purchase
 * line stores { itemId, itemName, categoryKey }, all written at the time of the
 * sale. So an old invoice still shows the right product at the right price
 * after the master record is gone, which is the correct behaviour for a ledger
 * anyway — a bill should record what was sold that day, not follow later edits.
 *
 * What genuinely does go: the stock those items held. Bags and stock value drop
 * out of every total. That is why getCategoryDeletionImpact exists — so the
 * confirmation can state the number before it happens.
 */
export const deleteCategory = async (categoryKey) => {
  const catsSnap = await getDocs(query(collection(db, "categories"), where("key", "==", categoryKey)));
  const itemsSnap = await getDocs(query(collection(db, "items"), where("categoryKey", "==", categoryKey)));

  if (catsSnap.empty && itemsSnap.empty) {
    throw new Error("Category not found.");
  }

  const refs = [
    ...itemsSnap.docs.map(d => d.ref),
    ...catsSnap.docs.map(d => d.ref),
  ];

  // Firestore caps a batch at 500 operations.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  return {
    deleted: true,
    categoryKey,
    itemsDeleted: itemsSnap.size,
    categoryDocsDeleted: catsSnap.size,
  };
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
  
  return items;
};

// Every active item, with no de-duplication.
//
// This used to drop any item whose name matched one already seen (case-insensitively),
// keeping whichever happened to sort first. That silently removed real stock from every
// figure built on it — the Dashboard, the Inventory page and the Total Inventory report
// — while the reports built straight off the `items` collection kept counting it, so the
// same business reported two different stock levels. Duplicate item names are a data
// problem to be merged at source, not a display problem to be hidden: an item holding
// bags must be counted wherever stock is counted.
export const getActiveItems = async () => {
  const allItems = await getItems();

  const seenIds = new Set();
  return allItems.filter(i => {
    if (seenIds.has(i.id)) return false;   // guard against a repeated doc id only
    seenIds.add(i.id);
    return i.active !== false;
  });
};

// Kept as an alias so existing call sites keep working; both now return the full
// active set. Prefer getActiveItems in new code.
export const getUniqueActiveItems = getActiveItems;

// Item names that collide case-insensitively across active items. Used to warn the
// operator where two records represent the same physical product, so they can be
// merged instead of quietly diverging.
export const getDuplicateItemNames = async () => {
  const items = await getActiveItems();
  const counts = new Map();
  items.forEach(i => {
    const key = (i.name || '').trim().toLowerCase();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, n]) => n > 1)
    .map(([key]) => key);
};

export const addItem = async (data) => {
  const cleanName = (data.name || '').trim();
  if (!cleanName) throw new Error("Item name is required.");

  // Check for duplicates
  const allItemsSnap = await getDocs(collection(db, "items"));
  const duplicate = allItemsSnap.docs.find(d => {
    return (d.data().name || '').trim().toLowerCase() === cleanName.toLowerCase();
  });
  if (duplicate) {
    throw new Error(`An item with the name "${cleanName}" already exists.`);
  }

  const newDocRef = doc(collection(db, "items"));
  const payload = {
    ...data,
    name: cleanName,
    mrp: Number(data.mrp) || (Number(data.rate) || 0),
    updatedAt: serverTimestamp()
  };
  delete payload.rate;
  await setDoc(newDocRef, payload);
  return newDocRef.id;
};

export const updateItem = async (itemId, data) => {
  const cleanName = (data.name || '').trim();
  if (!cleanName) throw new Error("Item name is required.");

  // Check for duplicates
  const allItemsSnap = await getDocs(collection(db, "items"));
  const duplicate = allItemsSnap.docs.find(d => {
    if (d.id === itemId) return false;
    return (d.data().name || '').trim().toLowerCase() === cleanName.toLowerCase();
  });
  if (duplicate) {
    throw new Error(`An item with the name "${cleanName}" already exists.`);
  }

  const itemRef = doc(db, "items", itemId);
  const payload = { ...data, name: cleanName, updatedAt: serverTimestamp() };
  if (payload.mrp !== undefined) payload.mrp = Number(payload.mrp);
  delete payload.rate;
  await updateDoc(itemRef, payload);
};

export const setItemActive = async (itemId, isActive) => {
  const itemRef = doc(db, "items", itemId);
  await updateDoc(itemRef, { active: isActive });
};

export const adjustStock = async (itemId, newStock, oldStock, reason, userEmail) => {
  if (!reason || reason.trim() === '') {
    throw new Error('Reason is required for stock adjustment');
  }

  const itemRef = doc(db, "items", itemId);
  const adjustmentRef = doc(collection(db, "inventory_adjustments"));
  
  const batch = writeBatch(db);
  
  batch.update(itemRef, { stock: Number(newStock), updatedAt: serverTimestamp() });
  
  batch.set(adjustmentRef, {
    itemId,
    oldStock: Number(oldStock),
    newStock: Number(newStock),
    difference: Number(newStock) - Number(oldStock),
    reason: reason.trim(),
    adjustedBy: userEmail || 'Unknown',
    timestamp: serverTimestamp()
  });

  await batch.commit();
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

/**
 * How many purchase and sale bills reference an item. Used both to refuse a
 * delete and to tell the operator up front, in the dialog, why the button is
 * disabled. Bills snapshot the item name, so history would survive a delete,
 * but reports that group by itemId would silently lose those lines.
 */
export const getItemTransactionUsage = async (itemId) => {
  const purchasesSnap = await getDocs(query(collection(db, "purchases"), where("itemId", "==", itemId)));
  // Sale lines live inside an array, which Firestore cannot query by field; scan client-side.
  const salesSnap = await getDocs(collection(db, "sales"));
  const sales = salesSnap.docs.filter(d => {
    const data = d.data();
    return Array.isArray(data.items) && data.items.some(i => i.itemId === itemId);
  }).length;
  return { purchases: purchasesSnap.size, sales };
};

export const deleteItem = async (itemId) => {
  const itemRef = doc(db, "items", itemId);
  const itemSnap = await getDoc(itemRef);
  
  if (!itemSnap.exists()) {
    throw new Error("Item not found");
  }
  
  const itemName = itemSnap.data().name || 'Unknown Item';

  const usage = await getItemTransactionUsage(itemId);
  if (usage.purchases > 0) {
    throw new Error(`Cannot delete '${itemName}' — it appears on ${usage.purchases} purchase bill(s). Deactivate it instead using the Active toggle.`);
  }
  if (usage.sales > 0) {
    throw new Error(`Cannot delete '${itemName}' — it appears on ${usage.sales} sale bill(s). Deactivate it instead using the Active toggle.`);
  }

  // If no transactions exist, safely delete the item
  await deleteDoc(itemRef);
  return { deleted: true, itemId, itemName };
};
