import { doc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./config";
import { toMillis } from "../utils/dateIST";

/**
 * Supplier-level payments used to reduce only the supplier's running balance,
 * so a bill stayed "UNPAID / due ₹11,000" while the supplier owed ₹5,000 — the
 * same money, two different answers. A supplier payment is now allocated
 * oldest-bill-first across the supplier's open purchases, and the allocations
 * are stored on the ledger row so they can be reversed when the payment is
 * edited or deleted, or when a bill it covered is deleted.
 *
 * Every purchase carries two paid counters:
 *   amountPaid            — everything applied to the bill (bill-level + allocated)
 *   amountPaidViaSupplier — the part that came from supplier-level payments
 * The split matters when a purchase is deleted: its bill-level payments go with
 * it, but an allocated supplier payment is real money that stays on the
 * supplier as credit.
 *
 * All helpers here follow the Firestore rule that every read in a transaction
 * happens before the first write: callers read purchase docs first, then apply.
 */

const num = (v) => Number(v) || 0;
const totalOf = (data) => num(data.total || data.totalAmount);
const openAmount = (data) => Math.max(0, totalOf(data) - num(data.amountPaid));

/** Open purchases for a supplier, oldest first. Read OUTSIDE the transaction. */
export const fetchOpenPurchaseRefs = async (supplierId) => {
  const snap = await getDocs(query(collection(db, "purchases"), where("supplierId", "==", supplierId)));
  return snap.docs
    .map(d => ({ ref: d.ref, date: toMillis(d.data().date), open: openAmount(d.data()) }))
    .filter(p => p.open > 0)
    .sort((a, b) => a.date - b.date)
    .map(p => p.ref);
};

/** Refs for the purchases a ledger row's allocations point at. */
export const allocationRefs = (allocations = []) =>
  allocations.filter(a => a && a.purchaseId).map(a => doc(db, "purchases", a.purchaseId));

/** Read purchase docs inside a transaction. Missing docs (deleted bills) are skipped. */
export const readPurchaseDocs = async (transaction, refs) => {
  const seen = new Set();
  const docs = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    const snap = await transaction.get(ref);
    if (snap.exists()) docs.push({ ref, data: snap.data() });
  }
  return docs;
};

/**
 * Compute the end state of a set of purchases after undoing `oldAllocations`
 * and applying `newAmount` oldest-first. Pure: returns the allocations made and
 * one patch per touched purchase, so each doc is written exactly once.
 */
export const planReallocation = (purchaseDocs, oldAllocations = [], newAmount = 0) => {
  const state = new Map(purchaseDocs.map(p => [p.ref.id, { ref: p.ref, data: { ...p.data }, touched: false }]));

  for (const a of oldAllocations) {
    const p = state.get(a.purchaseId);
    if (!p) continue; // bill deleted since — deletePurchase already settled it
    p.data.amountPaid = Math.max(0, num(p.data.amountPaid) - num(a.amount));
    p.data.amountPaidViaSupplier = Math.max(0, num(p.data.amountPaidViaSupplier) - num(a.amount));
    p.touched = true;
  }

  const ordered = [...state.values()].sort((x, y) => toMillis(x.data.date) - toMillis(y.data.date));
  let remaining = num(newAmount);
  const allocations = [];
  for (const p of ordered) {
    if (remaining <= 0) break;
    const open = openAmount(p.data);
    if (open <= 0) continue;
    const applied = Math.min(open, remaining);
    remaining -= applied;
    p.data.amountPaid = num(p.data.amountPaid) + applied;
    p.data.amountPaidViaSupplier = num(p.data.amountPaidViaSupplier) + applied;
    p.touched = true;
    allocations.push({ purchaseId: p.ref.id, billNo: p.data.billNo || '', amount: applied });
  }

  const patches = [...state.values()].filter(p => p.touched).map(p => ({
    ref: p.ref,
    patch: {
      amountPaid: num(p.data.amountPaid),
      amountPaidViaSupplier: num(p.data.amountPaidViaSupplier),
      balanceDue: totalOf(p.data) - num(p.data.amountPaid),
    },
  }));

  return { allocations, patches, unallocated: remaining };
};

/** Plan a fresh allocation (no previous allocations to undo). */
export const planAllocation = (purchaseDocs, amount) => planReallocation(purchaseDocs, [], amount);

/** Write the patches from planReallocation / planAllocation. */
export const applyPatches = (transaction, patches, { date, mode, serverTimestamp }) => {
  for (const { ref, patch } of patches) {
    transaction.update(ref, {
      ...patch,
      ...(date ? { lastPaymentDate: date } : {}),
      ...(mode ? { lastPaymentMode: mode } : {}),
      updatedAt: serverTimestamp(),
    });
  }
};

/** Human-readable suffix for a ledger description. */
export const describeAllocations = (allocations = []) =>
  allocations.length ? ` · applied to ${allocations.map(a => a.billNo || a.purchaseId).join(', ')}` : '';
