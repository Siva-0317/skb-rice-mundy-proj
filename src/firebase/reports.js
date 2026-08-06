import { collection, query, where, getDocs } from "firebase/firestore";
import { getCategories } from "./items";
import { db } from "./config";
import { getCustomerStatus } from "../utils/customerStatus";
import { businessDayStartUtc, businessDayEndUtc, getISTTodayAsUtcMidnight, getISTDateString } from "../utils/dateIST";

// Helper to convert date-only input strings ('YYYY-MM-DD') to a Firestore range. These
// map straight to UTC-midnight instants — matching exactly how business dates (sale.date,
// purchase.date) are stored — with no local-timezone-dependent mutation involved.
const getRangeQuery = (from, to) => ({
  fromDate: businessDayStartUtc(from),
  toDate: businessDayEndUtc(to)
});

// CARD 1: Customer-wise Balance
export const getCustomerWiseBalanceReport = async ({ from, to }) => {
  const snap = await getDocs(collection(db, "customers"));
  const fromDate = from ? businessDayStartUtc(from) : null;
  const toDate = to ? businessDayEndUtc(to) : null;

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
    const mrp = item.mrp !== undefined && item.mrp !== null ? Number(item.mrp) : (Number(item.rate) || 0);
    const stockKg = stockBags * bagKg;
    const stockValue = stockBags * mrp;
    const categoryName = catMap.get(item.categoryKey) || item.categoryKey || '-';

    rows.push({
      id: item.id,
      name: item.name || '-',
      category: categoryName,
      bagSize: bagKg ? `${bagKg} kg` : '-',
      stockBags,
      stockKg,
      mrp,
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
  const targetYear = year || Number(getISTDateString(new Date()).slice(0, 4));
  const fromDate = new Date(Date.UTC(targetYear, 0, 1, 0, 0, 0, 0));
  const toDate = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));

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
    const mIdx = d.getUTCMonth();
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

// PURCHASE REPORTS

// CARD 1: Supplier-wise Purchases
export const getpurchasesReport = async ({ from, to }) => {
  const { fromDate, toDate } = getRangeQuery(from, to);
  const [purchasesSnap, itemsSnap] = await Promise.all([
    getDocs(collection(db, "purchases")),
    getDocs(collection(db, "items"))
  ]);

  const itemMap = new Map();
  itemsSnap.docs.forEach(docSnap => {
    itemMap.set(docSnap.id, docSnap.data());
  });

  const supplierMap = new Map();

  purchasesSnap.docs.forEach(docSnap => {
    const p = { id: docSnap.id, ...docSnap.data() };
    const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date || p.createdAt?.toDate?.() || 0);
    if (isNaN(pDate.getTime()) || pDate < fromDate || pDate > toDate) return;

    const suppId = p.supplierId || 'unknown';
    const suppName = p.supplierName || 'Unknown Supplier';

    if (!supplierMap.has(suppId)) {
      supplierMap.set(suppId, {
        id: suppId,
        supplierName: suppName,
        bills: 0,
        bags: 0,
        kgs: 0,
        totalCost: 0
      });
    }
    const entry = supplierMap.get(suppId);
    entry.bills += 1;
    entry.totalCost += Number(p.total || p.totalAmount || 0);

    if (p.items && Array.isArray(p.items)) {
      p.items.forEach(row => {
        const b = Number(row.bags || 0);
        const itemObj = itemMap.get(row.itemId) || {};
        const kgPerBag = Number(row.bagKg || itemObj.bagKg || 26);
        entry.bags += b;
        entry.kgs += b * kgPerBag;
      });
    } else {
      const b = Number(p.bags || 0);
      const itemObj = itemMap.get(p.itemId) || {};
      const kgPerBag = Number(itemObj.bagKg || 26);
      entry.bags += b;
      entry.kgs += b * kgPerBag;
    }
  });

  const rows = Array.from(supplierMap.values()).sort((a, b) => b.totalCost - a.totalCost);
  const summary = rows.reduce((acc, r) => ({
    bills: acc.bills + r.bills,
    bags: acc.bags + r.bags,
    kgs: acc.kgs + r.kgs,
    totalCost: acc.totalCost + r.totalCost
  }), { bills: 0, bags: 0, kgs: 0, totalCost: 0 });

  return { rows, summary };
};

// CARD 2: Category-wise Purchase vs Sale (P&L)
export const getCategoryPnL = async ({ from, to }) => {
  const { fromDate, toDate } = getRangeQuery(from, to);
  const [purchasesSnap, salesSnap, itemsSnap] = await Promise.all([
    getDocs(collection(db, "purchases")),
    getDocs(collection(db, "sales")),
    getDocs(collection(db, "items"))
  ]);

  const itemCatMap = new Map();
  itemsSnap.docs.forEach(d => {
    itemCatMap.set(d.id, d.data().categoryKey);
  });

  const cats = await getCategories();
  const catMap = {};
  cats.forEach(c => {
    catMap[c.key] = { key: c.key, label: c.label, bagsBought: 0, purchaseCost: 0, bagsSold: 0, salesRevenue: 0 };
  });

  purchasesSnap.docs.forEach(docSnap => {
    const p = docSnap.data();
    const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date || p.createdAt?.toDate?.() || 0);
    if (isNaN(pDate.getTime()) || pDate < fromDate || pDate > toDate) return;

    if (p.items && Array.isArray(p.items)) {
      p.items.forEach(row => {
        const catKey = row.categoryKey || itemCatMap.get(row.itemId) || 'raw';
        if (catMap[catKey]) {
          catMap[catKey].bagsBought += Number(row.bags || 0);
          catMap[catKey].purchaseCost += Number(row.amount || (Number(row.bags || 0) * Number(row.rate || 0)));
        }
      });
    } else {
      const catKey = p.categoryKey || itemCatMap.get(p.itemId) || 'raw';
      if (catMap[catKey]) {
        catMap[catKey].bagsBought += Number(p.bags || 0);
        catMap[catKey].purchaseCost += Number(p.total || p.totalAmount || 0);
      }
    }
  });

  salesSnap.docs.forEach(docSnap => {
    const s = docSnap.data();
    const sDate = s.date?.toDate ? s.date.toDate() : new Date(s.date || 0);
    if (isNaN(sDate.getTime()) || sDate < fromDate || sDate > toDate) return;

    if (s.items && Array.isArray(s.items)) {
      s.items.forEach(row => {
        let catKey = row.categoryKey || itemCatMap.get(row.itemId);
        if (!catKey && row.cat) {
          const lower = row.cat.toLowerCase();
          if (lower.includes('raw')) catKey = 'raw';
          else if (lower.includes('half') || lower.includes('steam')) catKey = 'steam';
          else if (lower.includes('boiled')) catKey = 'boiled';
          else if (lower.includes('basmathi')) catKey = 'basmathi';
          else if (lower.includes('seeraga') || lower.includes('samba')) catKey = 'seeraga';
        }
        if (!catKey) catKey = 'raw';
        if (catMap[catKey]) {
          const b = Number(row.bags || 0);
          const amt = row.amount !== undefined ? Number(row.amount) : b * Number(row.rate || 0);
          catMap[catKey].bagsSold += b;
          catMap[catKey].salesRevenue += amt;
        }
      });
    }
  });

  let totalRevenueSummary = 0;
  let totalComputedCost = 0;

  const rows = Object.values(catMap).map(c => {
    const avgBuyPrice = c.bagsBought > 0 ? c.purchaseCost / c.bagsBought : null;
    const avgSellPrice = c.bagsSold > 0 ? c.salesRevenue / c.bagsSold : 0;
    
    let grossProfit = null;
    let margin = null;

    if (avgBuyPrice !== null) {
      const costOfGoodsSold = c.bagsSold * avgBuyPrice;
      grossProfit = c.salesRevenue - costOfGoodsSold;
      margin = c.salesRevenue > 0 ? (grossProfit / c.salesRevenue) * 100 : 0;
      totalRevenueSummary += c.salesRevenue;
      totalComputedCost += costOfGoodsSold;
    }

    return {
      category: c.label,
      categoryKey: c.key,
      bagsBought: c.bagsBought,
      avgBuyPrice,
      bagsSold: c.bagsSold,
      avgSellPrice,
      grossProfit,
      margin
    };
  });

  const overallProfit = totalRevenueSummary - totalComputedCost;
  const overallMargin = totalRevenueSummary > 0 ? (overallProfit / totalRevenueSummary) * 100 : 0;

  return {
    rows,
    summary: {
      overallGrossProfit: overallProfit,
      overallMargin
    }
  };
};

// CARD 3: Item-wise Purchase Data
export const getItemPurchaseData = async ({ from, to }) => {
  const { fromDate, toDate } = getRangeQuery(from, to);
  const [purchasesSnap, itemsSnap] = await Promise.all([
    getDocs(collection(db, "purchases")),
    getDocs(collection(db, "items"))
  ]);

  const itemMasterMap = new Map();
  itemsSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    itemMasterMap.set(docSnap.id, {
      name: data.name || '-',
      categoryKey: data.categoryKey || 'raw',
      bagKg: Number(data.bagKg || 26)
    });
  });

  const itemMap = new Map();

  purchasesSnap.docs.forEach(docSnap => {
    const p = { id: docSnap.id, ...docSnap.data() };
    const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date || p.createdAt?.toDate?.() || 0);
    if (isNaN(pDate.getTime()) || pDate < fromDate || pDate > toDate) return;

    const processItem = (itemId, itemName, catKey, b, cost, bagKgVal) => {
      if (!itemMap.has(itemId)) {
        const master = itemMasterMap.get(itemId) || { name: itemName || 'Unknown Item', categoryKey: catKey || 'raw', bagKg: bagKgVal || 26 };
        itemMap.set(itemId, {
          id: itemId,
          itemName: master.name,
          categoryKey: master.categoryKey,
          bills: 0,
          bagsBought: 0,
          totalKgs: 0,
          totalCost: 0
        });
      }
      const entry = itemMap.get(itemId);
      entry.bills += 1;
      entry.bagsBought += b;
      entry.totalKgs += b * (bagKgVal || itemMasterMap.get(itemId)?.bagKg || 26);
      entry.totalCost += cost;
    };

    if (p.items && Array.isArray(p.items)) {
      p.items.forEach(row => {
        const b = Number(row.bags || 0);
        const cost = Number(row.amount || (b * Number(row.rate || 0)));
        processItem(row.itemId || 'unknown', row.item || row.itemName, row.categoryKey, b, cost, Number(row.bagKg));
      });
    } else {
      const b = Number(p.bags || 0);
      const cost = Number(p.total || p.totalAmount || 0);
      processItem(p.itemId || 'unknown', p.itemName, p.categoryKey, b, cost, null);
    }
  });

  const cats = await getCategories();
  const CATEGORY_LABELS = {};
  cats.forEach(c => CATEGORY_LABELS[c.key] = c.label);

  const rows = Array.from(itemMap.values()).map(entry => ({
    ...entry,
    category: CATEGORY_LABELS[entry.categoryKey] || entry.categoryKey || '-',
    avgCostPerBag: entry.bagsBought > 0 ? entry.totalCost / entry.bagsBought : 0
  })).sort((a, b) => b.totalCost - a.totalCost);

  const summary = rows.reduce((acc, r) => ({
    bills: acc.bills + r.bills,
    bagsBought: acc.bagsBought + r.bagsBought,
    totalKgs: acc.totalKgs + r.totalKgs,
    totalCost: acc.totalCost + r.totalCost
  }), { bills: 0, bagsBought: 0, totalKgs: 0, totalCost: 0 });

  return { rows, summary };
};

// CARD 4: Current Stock by Category (Value)
export const getCategoryStockValueReport = async () => {
  const itemsSnap = await getDocs(collection(db, "items"));

  const cats = await getCategories();
  const CATEGORY_LABELS = {};
  cats.forEach(c => CATEGORY_LABELS[c.key] = c.label);

  const catMap = {};
  cats.forEach(c => {
    catMap[c.key] = { category: c.label, categoryKey: c.key, itemCount: 0, totalBags: 0, totalKgs: 0, stockValue: 0 };
  });

  itemsSnap.docs.forEach(docSnap => {
    const item = docSnap.data();
    if (item.active === false) return;
    const catKey = item.categoryKey || 'raw';
    if (!catMap[catKey]) {
      catMap[catKey] = { category: CATEGORY_LABELS[catKey] || catKey, categoryKey: catKey, itemCount: 0, totalBags: 0, totalKgs: 0, stockValue: 0 };
    }
    const bags = Number(item.stock || 0);
    const bagKg = Number(item.bagKg || 26);
    const effPrice = item.mrp !== undefined && item.mrp !== null ? Number(item.mrp) : (Number(item.rate) || 0);

    catMap[catKey].itemCount += 1;
    catMap[catKey].totalBags += bags;
    catMap[catKey].totalKgs += bags * bagKg;
    catMap[catKey].stockValue += bags * effPrice;
  });

  const rows = Object.values(catMap).map(c => ({
    ...c,
    avgRate: c.totalBags > 0 ? c.stockValue / c.totalBags : 0
  })).sort((a, b) => b.stockValue - a.stockValue);

  const summary = rows.reduce((acc, r) => ({
    itemCount: acc.itemCount + r.itemCount,
    totalBags: acc.totalBags + r.totalBags,
    totalKgs: acc.totalKgs + r.totalKgs,
    stockValue: acc.stockValue + r.stockValue
  }), { itemCount: 0, totalBags: 0, totalKgs: 0, stockValue: 0 });

  return { rows, summary };
};

// CARD 5: Purchase History (Date-wise)
export const getDateWisePurchaseReport = async ({ from, to }) => {
  const { fromDate, toDate } = getRangeQuery(from, to);
  const purchasesSnap = await getDocs(collection(db, "purchases"));

  const dateMap = new Map();

  purchasesSnap.docs.forEach(docSnap => {
    const p = docSnap.data();
    const d = p.date?.toDate ? p.date.toDate() : new Date(p.date || p.createdAt?.toDate?.() || 0);
    if (isNaN(d.getTime()) || d < fromDate || d > toDate) return;
    const dateStr = d.toISOString().split('T')[0];

    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, { id: dateStr, dateStr, dateObj: d, bills: 0, bags: 0, totalCost: 0 });
    }
    const entry = dateMap.get(dateStr);
    entry.bills += 1;
    entry.totalCost += Number(p.total || p.totalAmount || 0);

    if (p.items && Array.isArray(p.items)) {
      p.items.forEach(row => {
        entry.bags += Number(row.bags || 0);
      });
    } else {
      entry.bags += Number(p.bags || 0);
    }
  });

  const rows = Array.from(dateMap.values()).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  const summary = rows.reduce((acc, r) => ({
    bills: acc.bills + r.bills,
    bags: acc.bags + r.bags,
    totalCost: acc.totalCost + r.totalCost
  }), { bills: 0, bags: 0, totalCost: 0 });

  return { rows, summary };
};

// QUICK STATS for Reports page header
export const getQuickStats = async () => {
  const [customersSnap, suppliersSnap, salesSnap] = await Promise.all([
    getDocs(collection(db, "customers")),
    getDocs(collection(db, "suppliers")),
    getDocs(collection(db, "sales"))
  ]);

  let totalOutstanding = 0;
  let customersWithDues = 0;
  customersSnap.docs.forEach(docSnap => {
    const bal = Number(docSnap.data().balance) || 0;
    if (bal > 0) {
      totalOutstanding += bal;
      customersWithDues += 1;
    }
  });

  let supplierBalancePayable = 0;
  let suppliersWithPayables = 0;
  suppliersSnap.docs.forEach(docSnap => {
    const bal = Number(docSnap.data().balance) || 0;
    if (bal > 0) {
      supplierBalancePayable += bal;
      suppliersWithPayables += 1;
    }
  });

  const today = getISTTodayAsUtcMidnight();
  const tonight = new Date(today);
  tonight.setUTCHours(23, 59, 59, 999);

  let todaysSales = 0;
  let todaysBills = 0;
  let todaysBags = 0;

  salesSnap.docs.forEach(docSnap => {
    const s = docSnap.data();
    const sDate = s.date?.toDate ? s.date.toDate() : new Date(s.date || 0);
    if (isNaN(sDate.getTime()) || sDate < today || sDate > tonight) return;
    todaysSales += Number(s.totalAmount || s.total || 0);
    todaysBills += 1;
    if (s.items && Array.isArray(s.items)) {
      s.items.forEach(item => {
        todaysBags += Number(item.bags || 0);
      });
    } else if (s.rows && Array.isArray(s.rows)) {
      s.rows.forEach(item => {
        todaysBags += Number(item.bags || item.qty || 0);
      });
    }
  });

  return {
    totalOutstanding,
    customersWithDues,
    supplierBalancePayable,
    suppliersWithPayables,
    todaysSales,
    todaysBills,
    todaysBags
  };
};

// CARD 6 (Purchase): Supplier Balance Report
export const getSupplierBalanceReport = async ({ from, to }) => {
  const { fromDate, toDate } = getRangeQuery(from, to);
  const [suppliersSnap, purchasesSnap] = await Promise.all([
    getDocs(collection(db, "suppliers")),
    getDocs(collection(db, "purchases"))
  ]);

  const purchasedMap = new Map();
  purchasesSnap.docs.forEach(docSnap => {
    const p = docSnap.data();
    const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date || p.createdAt?.toDate?.() || 0);
    if (isNaN(pDate.getTime()) || pDate < fromDate || pDate > toDate) return;
    const suppId = p.supplierId;
    if (suppId) {
      purchasedMap.set(suppId, (purchasedMap.get(suppId) || 0) + Number(p.total || p.totalAmount || 0));
    }
  });

  const rows = [];
  let totalBalancePayable = 0;
  let totalPurchasedSum = 0;
  let totalPaidSum = 0;

  suppliersSnap.docs.forEach(docSnap => {
    const s = docSnap.data();
    const balancePayable = Number(s.balance) || 0;
    const totalPurchased = purchasedMap.get(docSnap.id) || 0;
    const totalPaid = totalPurchased - balancePayable;

    if (balancePayable > 0) {
      totalBalancePayable += balancePayable;
    }
    totalPurchasedSum += totalPurchased;
    totalPaidSum += totalPaid;

    rows.push({
      id: docSnap.id,
      supplierName: s.name || '-',
      phone: s.phone || '-',
      location: s.location || '-',
      totalPurchased,
      totalPaid,
      balancePayable
    });
  });

  rows.sort((a, b) => b.balancePayable - a.balancePayable);

  return {
    rows,
    summary: {
      totalPurchased: totalPurchasedSum,
      totalPaid: totalPaidSum,
      totalBalancePayable
    }
  };
};

// CARD 7 (Purchase): Stock Summary by Variety
export const getStockSummaryByVariety = async () => {
  const itemsSnap = await getDocs(collection(db, "items"));
  const cats = await getCategories();
  const CATEGORY_LABELS = {};
  cats.forEach(c => CATEGORY_LABELS[c.key] = c.label);

  const catMap = {};
  cats.forEach(c => {
    catMap[c.key] = { category: c.label, categoryKey: c.key, itemCount: 0, totalBags: 0, stockValue: 0 };
  });

  itemsSnap.docs.forEach(docSnap => {
    const item = docSnap.data();
    if (item.active === false) return;
    const catKey = item.categoryKey || 'raw';
    if (!catMap[catKey]) {
      catMap[catKey] = { category: CATEGORY_LABELS[catKey] || catKey, categoryKey: catKey, itemCount: 0, totalBags: 0, stockValue: 0 };
    }
    const bags = Number(item.stock || 0);
    const effPrice = item.mrp !== undefined && item.mrp !== null ? Number(item.mrp) : (Number(item.rate) || 0);

    catMap[catKey].itemCount += 1;
    catMap[catKey].totalBags += bags;
    catMap[catKey].stockValue += bags * effPrice;
  });

  const rows = Object.values(catMap).map(c => ({ ...c })).sort((a, b) => b.stockValue - a.stockValue);
  const summary = rows.reduce((acc, r) => ({
    itemCount: acc.itemCount + r.itemCount,
    totalBags: acc.totalBags + r.totalBags,
    stockValue: acc.stockValue + r.stockValue
  }), { itemCount: 0, totalBags: 0, stockValue: 0 });

  return { rows, summary };
};

// CARD 7 (Sales): Current Stock Report
export const getCurrentStockReport = async () => {
  const itemsSnap = await getDocs(collection(db, "items"));
  const cats = await getCategories();
  const CATEGORY_LABELS = {};
  cats.forEach(c => CATEGORY_LABELS[c.key] = c.label);

  const rows = [];
  let totalBags = 0;
  let totalStockValue = 0;

  itemsSnap.docs.forEach(docSnap => {
    const item = { id: docSnap.id, ...docSnap.data() };
    if (item.active === false) return;
    const catKey = item.categoryKey || 'raw';
    const category = CATEGORY_LABELS[catKey] || item.category || catKey;
    const bags = Number(item.stock || 0);
    const mrp = item.mrp !== undefined && item.mrp !== null ? Number(item.mrp) : (Number(item.rate) || 0);
    const stockValue = bags * mrp;

    totalBags += bags;
    totalStockValue += stockValue;

    rows.push({
      id: item.id,
      name: item.name || '-',
      category,
      categoryKey: catKey,
      bagsInStock: bags,
      mrp,
      stockValue
    });
  });

  rows.sort((a, b) => {
    const catComp = (a.category || '').localeCompare(b.category || '');
    if (catComp !== 0) return catComp;
    return (a.name || '').localeCompare(b.name || '');
  });

  return {
    rows,
    summary: {
      totalBags,
      stockValue: totalStockValue
    }
  };
};

