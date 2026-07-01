import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./config";
import { getCustomerStatus } from "../utils/customerStatus";

// Helper to convert date input to Firestore range
const getRangeQuery = (from, to) => {
  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
};

// CARD 1: Customer-wise Balance
export const getCustomerWiseBalanceReport = async ({ from, to }) => {
  const snap = await getDocs(collection(db, "customers"));
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);
  if (toDate) toDate.setHours(23, 59, 59, 999);

  let totalOutstanding = 0;
  const rows = [];

  snap.docs.forEach(docSnap => {
    const data = docSnap.data();
    const customer = { id: docSnap.id, ...data };
    const balance = Number(customer.balance) || 0;
    if (balance > 0) {
      totalOutstanding += balance;
    }

    const status = getCustomerStatus(customer);
    const lastPaymentDate = customer.lastPayment?.toDate ? customer.lastPayment.toDate() : (customer.lastPayment ? new Date(customer.lastPayment) : null);
    const lastPurchaseDate = customer.lastPurchase?.toDate ? customer.lastPurchase.toDate() : (customer.lastPurchase ? new Date(customer.lastPurchase) : null);

    let isPaymentOutsideRange = false;
    if (lastPaymentDate && fromDate && toDate) {
      if (lastPaymentDate < fromDate || lastPaymentDate > toDate) {
        isPaymentOutsideRange = true;
      }
    } else if (!lastPaymentDate) {
      isPaymentOutsideRange = true;
    }

    rows.push({
      id: customer.id,
      name: customer.name || '-',
      phone: customer.phone || '-',
      balance,
      status,
      lastPayment: lastPaymentDate,
      lastPurchase: lastPurchaseDate,
      isPaymentOutsideRange
    });
  });

  rows.sort((a, b) => b.balance - a.balance);

  return {
    rows,
    summary: { totalOutstanding }
  };
};

// CARD 2: Customer-wise Sales
export const getCustomerWiseSalesReport = async ({ from, to }) => {
  const { fromDate, toDate } = getRangeQuery(from, to);
  const q = query(
    collection(db, "sales"),
    where("date", ">=", fromDate),
    where("date", "<=", toDate)
  );
  const snap = await getDocs(q);

  const customerMap = new Map();

  snap.docs.forEach(docSnap => {
    const sale = docSnap.data();
    const cid = sale.customerId || 'unknown';
    const cname = sale.customerName || 'Unknown Customer';

    if (!customerMap.has(cid)) {
      customerMap.set(cid, { id: cid, name: cname, bills: 0, bags: 0, kgs: 0, total: 0 });
    }
    const entry = customerMap.get(cid);
    entry.bills += 1;
    entry.total += Number(sale.totalAmount) || 0;

    if (sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        const b = Number(item.bags) || 0;
        const kg = Number(item.bagKg) || 0;
        entry.bags += b;
        entry.kgs += b * kg;
      });
    }
  });

  const rows = Array.from(customerMap.values()).sort((a, b) => b.total - a.total);

  const summary = rows.reduce((acc, r) => ({
    bills: acc.bills + r.bills,
    bags: acc.bags + r.bags,
    kgs: acc.kgs + r.kgs,
    total: acc.total + r.total
  }), { bills: 0, bags: 0, kgs: 0, total: 0 });

  return { rows, summary };
};

// CARD 3: Total Inventory Data
export const getTotalInventoryReport = async () => {
  const [itemsSnap, catsSnap] = await Promise.all([
    getDocs(collection(db, "items")),
    getDocs(collection(db, "categories"))
  ]);

  const catMap = new Map();
  catsSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    catMap.set(data.key || docSnap.id, data.label || data.name || '-');
  });

  const rows = [];
  itemsSnap.docs.forEach(docSnap => {
    const item = { id: docSnap.id, ...docSnap.data() };
    const stockBags = Number(item.stock) || 0;
    const bagKg = Number(item.bagKg) || 0;
    const rate = Number(item.rate) || 0;
    const stockKg = stockBags * bagKg;
    const stockValue = stockBags * rate;
    const categoryName = catMap.get(item.categoryKey) || item.categoryKey || '-';

    rows.push({
      id: item.id,
      name: item.name || '-',
      category: categoryName,
      bagSize: bagKg ? `${bagKg} kg` : '-',
      stockBags,
      stockKg,
      rate,
      stockValue
    });
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const summary = rows.reduce((acc, r) => ({
    stockBags: acc.stockBags + r.stockBags,
    stockKg: acc.stockKg + r.stockKg,
    stockValue: acc.stockValue + r.stockValue
  }), { stockBags: 0, stockKg: 0, stockValue: 0 });

  return { rows, summary };
};

// CARD 4: Total Sales (Date-wise)
export const getDateWiseSalesReport = async ({ from, to }) => {
  const { fromDate, toDate } = getRangeQuery(from, to);
  const q = query(
    collection(db, "sales"),
    where("date", ">=", fromDate),
    where("date", "<=", toDate)
  );
  const snap = await getDocs(q);

  const dateMap = new Map();

  snap.docs.forEach(docSnap => {
    const sale = docSnap.data();
    const d = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
    if (isNaN(d.getTime())) return;
    const dateStr = d.toISOString().split('T')[0];

    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, { id: dateStr, dateStr, dateObj: d, bills: 0, bags: 0, kgs: 0, total: 0 });
    }
    const entry = dateMap.get(dateStr);
    entry.bills += 1;
    entry.total += Number(sale.totalAmount) || 0;

    if (sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        const b = Number(item.bags) || 0;
        const kg = Number(item.bagKg) || 0;
        entry.bags += b;
        entry.kgs += b * kg;
      });
    }
  });

  const rows = Array.from(dateMap.values()).sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  const summary = rows.reduce((acc, r) => ({
    bills: acc.bills + r.bills,
    bags: acc.bags + r.bags,
    kgs: acc.kgs + r.kgs,
    total: acc.total + r.total
  }), { bills: 0, bags: 0, kgs: 0, total: 0 });

  return { rows, summary };
};

// CARD 5: Total Sales (Month-wise)
export const getMonthWiseSalesReport = async ({ year }) => {
  const targetYear = year || new Date().getFullYear();
  const fromDate = new Date(targetYear, 0, 1, 0, 0, 0, 0);
  const toDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

  const q = query(
    collection(db, "sales"),
    where("date", ">=", fromDate),
    where("date", "<=", toDate)
  );
  const snap = await getDocs(q);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const monthEntries = months.map((m, idx) => ({
    id: `m-${idx}`,
    monthIdx: idx,
    month: m,
    bills: 0,
    bags: 0,
    kgs: 0,
    total: 0
  }));

  snap.docs.forEach(docSnap => {
    const sale = docSnap.data();
    const d = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
    if (isNaN(d.getTime())) return;
    const mIdx = d.getMonth();
    if (mIdx >= 0 && mIdx < 12) {
      const entry = monthEntries[mIdx];
      entry.bills += 1;
      entry.total += Number(sale.totalAmount) || 0;

      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach(item => {
          const b = Number(item.bags) || 0;
          const kg = Number(item.bagKg) || 0;
          entry.bags += b;
          entry.kgs += b * kg;
        });
      }
    }
  });

  const summary = monthEntries.reduce((acc, r) => ({
    bills: acc.bills + r.bills,
    bags: acc.bags + r.bags,
    kgs: acc.kgs + r.kgs,
    total: acc.total + r.total
  }), { bills: 0, bags: 0, kgs: 0, total: 0 });

  return { rows: monthEntries, summary, year: targetYear };
};

// CARD 6: Item-wise Sales Data
export const getItemWiseSalesReport = async ({ from, to }) => {
  const { fromDate, toDate } = getRangeQuery(from, to);
  const [salesSnap, itemsSnap, catsSnap] = await Promise.all([
    getDocs(query(collection(db, "sales"), where("date", ">=", fromDate), where("date", "<=", toDate))),
    getDocs(collection(db, "items")),
    getDocs(collection(db, "categories"))
  ]);

  const catMap = new Map();
  catsSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    catMap.set(data.key || docSnap.id, data.label || data.name || '-');
  });

  const itemMasterMap = new Map();
  itemsSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    itemMasterMap.set(docSnap.id, {
      name: data.name || '-',
      category: catMap.get(data.categoryKey) || data.categoryKey || '-'
    });
  });

  const itemMap = new Map();

  salesSnap.docs.forEach(docSnap => {
    const sale = { id: docSnap.id, ...docSnap.data() };
    const seenItemsInBill = new Set();

    if (sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(row => {
        const itemId = row.itemId || 'unknown';
        if (!itemMap.has(itemId)) {
          const master = itemMasterMap.get(itemId) || { name: row.item || row.itemName || 'Unknown Item', category: row.cat || '-' };
          itemMap.set(itemId, {
            id: itemId,
            name: master.name,
            category: master.category,
            bills: 0,
            bags: 0,
            kgs: 0,
            total: 0
          });
        }
        const entry = itemMap.get(itemId);
        if (!seenItemsInBill.has(itemId)) {
          seenItemsInBill.add(itemId);
          entry.bills += 1;
        }

        const b = Number(row.bags) || 0;
        const kg = Number(row.bagKg) || 0;
        const rate = Number(row.rate) || 0;
        entry.bags += b;
        entry.kgs += b * kg;
        entry.total += (row.amount !== undefined ? Number(row.amount) : b * rate);
      });
    }
  });

  const rows = Array.from(itemMap.values()).sort((a, b) => b.total - a.total);

  const summary = rows.reduce((acc, r) => ({
    bills: acc.bills + r.bills,
    bags: acc.bags + r.bags,
    kgs: acc.kgs + r.kgs,
    total: acc.total + r.total
  }), { bills: 0, bags: 0, kgs: 0, total: 0 });

  return { rows, summary };
};
