import { collection, query, where, getDocs, orderBy, limit as firestoreLimit } from "firebase/firestore";
import { db } from "./config";
import { getCustomerStatus } from "../utils/customerStatus";

const LOW_STOCK_THRESHOLD = 15;

export const getWeekSales = async () => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const q = query(
    collection(db, "sales"),
    where("date", ">=", sevenDaysAgo),
    where("date", "<=", today)
  );

  const snapshot = await getDocs(q);
  const sales = snapshot.docs.map(doc => doc.data());

  // Initialize all 7 days with 0
  const daysMap = {};
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    daysMap[d.toISOString().split('T')[0]] = {
      day: dayNames[d.getDay()],
      total: 0,
      fullDate: d.toISOString().split('T')[0]
    };
  }

  sales.forEach(sale => {
    const d = sale.date.toDate ? sale.date.toDate() : new Date(sale.date);
    const dateStr = d.toISOString().split('T')[0];
    if (daysMap[dateStr]) {
      daysMap[dateStr].total += (sale.totalAmount || 0);
    }
  });

  return Object.values(daysMap);
};

export const getTodayStats = async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Today Sales
  const salesQ = query(collection(db, "sales"), where("date", ">=", todayStart), where("date", "<=", todayEnd));
  const salesSnap = await getDocs(salesQ);
  const todaySales = salesSnap.docs.reduce((acc, doc) => acc + (doc.data().totalAmount || 0), 0);

  // Today Purchases
  const purchQ = query(collection(db, "purchases"), where("date", ">=", todayStart), where("date", "<=", todayEnd));
  const purchSnap = await getDocs(purchQ);
  const todayPurchases = purchSnap.docs.reduce((acc, doc) => acc + (doc.data().totalAmount || 0), 0);

  // Overdue Customers
  // Fetch all customers with balance > 0, then compute overdue status client-side.
  // Note: This scales fine up to a few hundred customers; a denormalized counter would be needed at much larger scale.
  const custQ = query(collection(db, "customers"), where("balance", ">", 0));
  const custSnap = await getDocs(custQ);
  const overdueCustomers = custSnap.docs.filter(d => getCustomerStatus({ id: d.id, ...d.data() }) === 'overdue').length;

  // Low Stock Items (query all items, then filter client side)
  const itemsSnap = await getDocs(collection(db, "items"));
  const lowStockItems = itemsSnap.docs.filter(d => {
    const data = d.data();
    return data.active !== false && data.stock < LOW_STOCK_THRESHOLD;
  }).length;

  return {
    todaySales,
    todayPurchases,
    overdueCustomers,
    lowStockItems
  };
};

export const getDashboardRecentSales = async (limitCount = 7) => {
  const q = query(collection(db, "sales"), orderBy("date", "desc"), firestoreLimit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getDashboardRecentPurchases = async (limitCount = 5) => {
  const q = query(collection(db, "purchases"), orderBy("date", "desc"), firestoreLimit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};
