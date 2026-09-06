import { collection, query, where, getDocs, orderBy, limit as firestoreLimit } from "firebase/firestore";
import { db } from "./config";
import { getActiveItems } from "./items";
import { getCustomerStatus } from "../utils/customerStatus";
import { getISTTodayAsUtcMidnight, toMillis, toDateObj } from "../utils/dateIST";
import { LOW_STOCK_THRESHOLD } from "../utils/constants";

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const getWeekSales = async () => {
  // Everything below stays in one UTC-midnight frame anchored to "today in IST" — this
  // is what keeps the chart correct regardless of the viewing device's own timezone.
  const todayAnchor = getISTTodayAsUtcMidnight();
  const sevenDaysAgo = new Date(todayAnchor);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  const rangeEnd = new Date(todayAnchor);
  rangeEnd.setUTCHours(23, 59, 59, 999);

  const q = query(
    collection(db, "sales"),
    where("date", ">=", sevenDaysAgo),
    where("date", "<=", rangeEnd)
  );

  const snapshot = await getDocs(q);
  const sales = snapshot.docs.map(doc => doc.data());

  // Initialize all 7 days with 0
  const daysMap = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().split('T')[0];
    daysMap[key] = {
      day: dayNames[d.getUTCDay()],
      total: 0,
      fullDate: key
    };
  }

  sales.forEach(sale => {
    const d = toDateObj(sale.date);
    if (!d) return;
    const dateStr = d.toISOString().split('T')[0];
    if (daysMap[dateStr]) {
      daysMap[dateStr].total += (sale.totalAmount || 0);
    }
  });

  return Object.values(daysMap);
};

export const getTodayStats = async () => {
  const todayStart = getISTTodayAsUtcMidnight();
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCHours(23, 59, 59, 999);

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
  // Three distinct figures, kept separate so they can never contradict each other:
  //  - grossReceivable: what customers owe us (positive balances only)
  //  - advanceHeld:     what we hold on their behalf (negative balances, as a positive)
  //  - totalOutstanding: the net of the two — this is the figure that ties out to the
  //                      Ledger's running balance, so the two screens always agree.
  // Overdue is a subset of grossReceivable, never of the net, which is why it is
  // reported alongside grossReceivable rather than beneath the net total.
  const custQ = query(collection(db, "customers"));
  const custSnap = await getDocs(custQ);
  let grossReceivable = 0;
  let advanceHeld = 0;
  let overdueAmount = 0;
  let overdueCustomers = 0;
  custSnap.docs.forEach(d => {
    const data = d.data();
    const bal = Number(data.balance) || 0;
    if (bal > 0) grossReceivable += bal;
    else advanceHeld += -bal;
    const status = getCustomerStatus({ id: d.id, ...data });
    if (status === 'overdue' && bal > 0) {
      overdueCustomers += 1;
      overdueAmount += bal;
    }
  });
  const totalOutstanding = grossReceivable - advanceHeld;

  // Low Stock Items & Current Stock
  const activeItems = await getActiveItems();

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
    grossReceivable,
    advanceHeld,
    overdueAmount,
    overdueCustomers,
    currentStockBags,
    varietiesCount,
    lowStockItems,
    items: activeItems
  };
};

export const getDashboardRecentSales = async (limitCount = 7) => {
  // Same-day sales all share one `date` value (UTC midnight of that business day), so
  // Firestore's orderBy("date") alone leaves them in an arbitrary tie-break order, not
  // creation order. Over-fetch a buffer past limitCount so a client-side sort by
  // createdAt can correctly re-rank same-day ties before truncating to limitCount.
  const q = query(collection(db, "sales"), orderBy("date", "desc"), firestoreLimit(limitCount + 15));
  const snap = await getDocs(q);
  const sales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  sales.sort((a, b) => {
    const dateDiff = toMillis(b.date) - toMillis(a.date);
    if (dateDiff !== 0) return dateDiff;
    return toMillis(b.createdAt) - toMillis(a.createdAt);
  });
  return sales.slice(0, limitCount);
};

export const getStockByVariety = async (limitCount = 8) => {
  // Same source as every other stock figure, so the panel can never disagree with
  // the Current Stock tile above it.
  const activeItems = await getActiveItems();

  return activeItems
    .map(i => ({
      id: i.id,
      name: i.name || '-',
      bags: Number(i.stock || 0)
    }))
    .sort((a, b) => b.bags - a.bags)
    .slice(0, limitCount);
};
