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
  let todaySales = 0;
  let todayBagsMoved = 0;
  salesSnap.docs.forEach(doc => {
    const data = doc.data();
    todaySales += (data.totalAmount || 0);
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach(row => {
        const bags = Number(row.bags) || 0;
        todayBagsMoved += bags;
      });
    } else if (data.rows && Array.isArray(data.rows)) {
      data.rows.forEach(row => {
        const bags = Number(row.bags || row.qty) || 0;
        todayBagsMoved += bags;
      });
    }
  });
  const todaySalesCount = salesSnap.docs.length;

  // Overdue Customers & Total Outstanding
  const custQ = query(collection(db, "customers"), where("balance", ">", 0));
  const custSnap = await getDocs(custQ);
  let totalOutstanding = 0;
  let overdueAmount = 0;
  let overdueCustomers = 0;
  custSnap.docs.forEach(d => {
    const data = d.data();
    const bal = Number(data.balance) || 0;
    totalOutstanding += bal;
    const status = getCustomerStatus({ id: d.id, ...data });
    if (status === 'overdue') {
      overdueCustomers += 1;
      overdueAmount += bal;
    }
  });

  // Low Stock Items & Current Stock
  const itemsSnap = await getDocs(collection(db, "items"));
  const activeItems = itemsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(i => i.active !== false);

  let currentStockBags = 0;
  activeItems.forEach(i => {
    const stock = Number(i.stock) || 0;
    currentStockBags += stock;
  });

  const varietiesCount = activeItems.length;
  const lowStockItems = activeItems.filter(i => Number(i.stock) < LOW_STOCK_THRESHOLD).length;

  return {
    todaySales,
    todaySalesCount,
    todayBagsMoved,
    totalOutstanding,
    overdueAmount,
    overdueCustomers,
    currentStockBags,
    varietiesCount,
    lowStockItems,
    items: activeItems
  };
};

export const getDashboardRecentSales = async (limitCount = 7) => {
  const q = query(collection(db, "sales"), orderBy("date", "desc"), firestoreLimit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getStockByVariety = async (limitCount = 8) => {
  const itemsSnap = await getDocs(collection(db, "items"));
  const activeItems = itemsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(i => i.active !== false);

  return activeItems
    .map(i => ({
      id: i.id,
      name: i.name || '-',
      bags: Number(i.stock || 0)
    }))
    .sort((a, b) => b.bags - a.bags)
    .slice(0, limitCount);
};
