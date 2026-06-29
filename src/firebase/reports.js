import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "./config";

export const getSalesReport = async ({ from, to, categoryKey }) => {
  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);

  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "sales"),
    where("date", ">=", fromDate),
    where("date", "<=", toDate),
    orderBy("date", "desc")
  );

  const snapshot = await getDocs(q);
  let results = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    let items = data.items || [];
    
    if (categoryKey) {
      items = items.filter(item => item.cat === categoryKey);
    }

    if (items.length > 0) {
      // Recalculate if filtered
      const calculatedAmount = categoryKey 
        ? items.reduce((sum, item) => sum + ((Number(item.bags) || 0) * (Number(item.rate) || 0)), 0)
        : data.totalAmount;

      results.push({
        id: doc.id,
        ...data,
        items,
        totalAmount: calculatedAmount
      });
    }
  });

  return results;
};

export const getPurchasesReport = async ({ from, to, categoryKey }) => {
  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);

  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "purchases"),
    where("date", ">=", fromDate),
    where("date", "<=", toDate),
    orderBy("date", "desc")
  );

  const snapshot = await getDocs(q);
  let results = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    let items = data.items || [];
    
    if (categoryKey) {
      items = items.filter(item => item.cat === categoryKey);
    }

    if (items.length > 0) {
      // Recalculate if filtered
      const calculatedAmount = categoryKey 
        ? items.reduce((sum, item) => sum + ((Number(item.bags) || 0) * (Number(item.rate) || 0)), 0)
        : data.totalAmount;

      results.push({
        id: doc.id,
        ...data,
        items,
        totalAmount: calculatedAmount
      });
    }
  });

  return results;
};
