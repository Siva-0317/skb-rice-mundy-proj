# Fixes applied after QA rounds 1 and 2

Every change below traces to a defect from the two test rounds. Verified with
`npx vitest run` (53 tests, all passing) and `npx vite build`.

---

## 1. NEW-01 (Critical) — every write to `items` was denied

**Why it failed.** Two independent causes in `firestore.rules`:

```
match /items/{itemId} {
  allow create, update: if isOwner();   // ← a sale decrements stock, so a sale is an "update"
  allow delete: if false;
}
// ...and /inventory_adjustments had no rule at all → denied by default
```

A sale, a purchase, a stock count and the stock restore inside a customer delete
all write `items/{id}.stock`. All of them were classified as master-data edits and
required the `owner` role. Sales are committed as one atomic batch, so the denied
item write rejected the whole commit — hence "Missing or insufficient permissions"
with nothing partially written. `adjustStock` also writes an audit row to
`inventory_adjustments`, a collection with no rule, which is denied by default.

**Third contributing cause.** The signed-in account has no `/users/{uid}` document.
`AuthContext` defaults to `role: 'staff'` when it is missing, so `isOwner()` was
false even for the business owner. Seed step 3 (creating that document) was never
completed — see fix 10.

**Fix.** `firestore.rules` now separates *stock movement* from *master-data edit*:

```
allow update: if isOwner() || (isAuthenticated() && isStockOnlyUpdate());
```

where `isStockOnlyUpdate()` permits a diff touching only `stock` and `updatedAt`,
and requires `stock` to be a non-negative number. Name, MRP, bag size, category and
the active flag stay owner-only. Added rules for `inventory_adjustments`
(append-only: create for any operator, never update or delete). Item and supplier
deletion allowed for owners; purchase deletion allowed for authenticated users,
matching the Delete controls the UI already offers.

Verified against every item write in the codebase — `sales.js` (create/edit/delete),
`purchases.js` (create/delete), `items.js` (adjustStock) and `customers.js`
(delete cascade) all write `{stock}` or `{stock, updatedAt}` and nothing else.

---

## 2. BUG-02 / BUG-24 (Critical) — two different stock totals

**Why it failed.** `getUniqueActiveItems()` de-duplicated items by lower-cased name,
keeping whichever sorted first and silently discarding the rest **along with their
stock**. The Dashboard, the Inventory page and the Total Inventory report used it;
the Stock Summary and Current Stock reports read `items` directly. One business,
two answers: 6,033 bags against 8,317 — a 2,284-bag gap worth about ₹32 lakh.

**Fix.** `getActiveItems()` replaces it and drops the name de-duplication entirely
(the id guard remains). Duplicate names are a data problem to merge at source, not a
display problem to hide — an item holding bags must be counted wherever stock is
counted. `getUniqueActiveItems` is kept as an alias so no call site breaks.
`getStockByVariety` now reads the same helper instead of querying `items` separately.

Added `getDuplicateItemNames()` so colliding names can be surfaced for merging, and
the sale item picker now shows category and current stock beside each item so two
records with the same name can be told apart (was TC-S03).

---

## 3. BUG-20 / NEW-02 (Medium) — overdue was meaningless, then contradictory

**Why it failed.** Two separate problems.

*Ageing:* `getCustomerStatus` measured from `lastPayment || createdAt`. A customer who
had never paid was measured from the day their profile was created, so every such
customer was permanently overdue — including one who bought yesterday. That is why
100% of dues showed as overdue.

*Contradiction:* `getTodayStats` summed `totalOutstanding` over **all** balances
(netting advances) but `overdueAmount` over positive balances only. With a ₹750
advance in play the tile read "₹1,42,74,225 outstanding · ₹1,42,74,975 overdue" —
more overdue than outstanding.

**Fix.** The clock now runs from `lastPayment || lastPurchase || createdAt`, so any
fresh transaction resets it and "overdue" means "nothing has moved on this account in
15 days". `getTodayStats` now returns three separate figures — `grossReceivable`,
`advanceHeld` and the net `totalOutstanding` — and the Dashboard shows overdue against
the gross, with advances stated on their own line when any exist. The two numbers can
no longer contradict each other.

---

## 4. NEW-03 (Low) — `rate: NaN` written into every sale line

**Why it failed.** `Number(r.rate)` in `Sales.jsx`. Items carry only `mrp` now — the
legacy `rate` field is absent — and `Number(undefined)` is `NaN` (unlike `Number('')`,
which is 0). NaN is not valid JSON, persisted silently, and would poison any later sum
or average over the field.

**Fix.** A finite-checked `toNum()` helper applied to every numeric field on the row.

---

## 5. NEW-04 (Low) — mobile length unvalidated

`"12"` passed the character check and saved. Added a 7–15 digit range check in
`AddCustomerModal`, alongside the existing format check.

## 6. NEW-05 (Low) — global search could not find a bill

Added `searchSalesByBillNo()` (a prefix range query on `billNo`, limit 5 — a single
indexed read rather than loading the sales collection into the shell) and a **Bills**
section in the search dropdown. Also fixed the Items rows, which rendered `₹{i.rate}`
— an removed field — and so displayed a bare "₹".

## 7. BUG-18 (Low) — "1 transactions"

`pages/Customers.jsx` always used the plural. `CustomersList.jsx` already had the
singular/plural logic; the Customers page now matches it.

## 8. BUG-16 (Low) — suppliers could not be deleted

Added `deleteSupplier()`, guarded exactly like `deleteItem`: a supplier with purchase
history cannot be removed and the reason is shown verbatim. Wired to an owner-only
Delete control in `SuppliersList`. The leftover test categories are handled by the
existing `scripts/clean_categories.js` — see "Still to do".

---

## 9. `deleteCustomer` was non-atomic in the wrong order

Not from the test rounds — found while tracing BUG-23. The function deleted the
customer's **ledger first**, then restored stock and deleted sales. A failure at the
stock step (exactly what the rules bug caused) left the customer with their sales
intact but their entire statement already destroyed, and the balance unreconstructable.

Reordered: stock restore and sale deletion first, ledger second, customer document
last. A failure now leaves the customer whole and the operation can simply be retried.

---

## 10. Role bootstrap

Added `scripts/set_owner.js` to create/update `/users/{authUid}` with `role: 'owner'`,
which is the setup step that was never completed. Until it is run, the account behaves
as staff and master-data editing stays blocked *by design*.

`ItemsList` already computed `isOwner` but never used it, so a staff user saw Add /
Edit / Delete / Active controls that were guaranteed to fail. Those are now hidden or
disabled for non-owners, with a short explanation instead of a permission error.

---

## 11. Code quality

- **`firebase-admin` moved to `devDependencies`.** A privileged server-side SDK was
  declared as a runtime dependency of a browser app. It is used only by `seed/` (which
  declares it separately) and `scripts/`.
- **Removed a pointless dynamic `import("firebase/firestore")`** inside `deleteSale`.
  The module is statically imported by six other files, so the dynamic import bought
  no code-splitting and the bundler warned about it. That warning is now gone.
- **Stale test corrected.** `auth.test.jsx` asserted that a `beforeunload` listener
  signs the user out — the exact behaviour that caused BUG-01. The listener was
  removed but the test was not, so it encoded the bug as a requirement. It now asserts
  the opposite and guards against the regression returning.
- **New regression suites:** `regressions.test.js` (17 tests) and
  `stockReconciliation.test.js` (5 tests).

---

## Still to do — data and deployment, not code

1. **Deploy the rules:** `firebase deploy --only firestore:rules`. Nothing above
   unblocks sales until this runs; the deploy validates syntax server-side and is
   rejected atomically if invalid.
2. **Promote the owner account:** `node scripts/set_owner.js <auth-uid>`, then sign
   out and back in.
3. **Merge the duplicate item records.** `HMT Boiled` / `Hmt Boiled` / `Hmt Boiled`
   and the two `Broken Boiled` rows are three and two records for one product, holding
   2,284 bags between them. Now that all figures count them, decide the surviving
   record per product, move the stock onto it, and deactivate the others.
4. **Clean the test masters:** run `scripts/clean_categories.js` for the `test`,
   `test1`, `Sample Rice` and `Credit` categories and the duplicate `Boiled Rice`;
   delete supplier `Sample supplier 1` from the UI.
5. **`.env.test` holds a test password in the repo.** Harmless if that account is
   throwaway; worth rotating or gitignoring otherwise.
6. **Bundle is 1.45 MB (402 kB gzipped)** in a single chunk. Route-level `React.lazy`
   would cut first load materially. Not urgent.

---

## Round 3 — deletion removed, then reverted

Briefly, on my reading of the audit trail, deletion was taken out of the app and
replaced with archiving. The client's written requirements say the opposite:

> Customer: delete a customer created at any time; adjust or delete a
> transaction at any time.
> Purchase: record payment to supplier; delete the transaction if needed.
> Item: delete an item created at any time; alter or delete the item and its
> stock.

That round has been reverted. Deletion is back exactly as it was, restored from
the original download (`skb-rice-mundy-proj-main (1).zip`) rather than rewritten:
`DeleteCustomerModal.jsx`, `DeleteItemModal.jsx` and `DeletePurchaseModal.jsx`
are byte-identical to the originals, as are `deleteItem`, `deletePurchase` and
`deleteLedgerEntry`. `deleteSale` and `deleteCustomer` differ only by the two
round-2 fixes they already carried:

- `deleteSale` keeps the static `writeBatch` import in place of the dynamic
  `await import("firebase/firestore")`, which defeated bundling for no benefit.
- `deleteCustomer` keeps the reordering: sales and stock restoration run before
  the ledger wipe, so a failure at the permission-guarded stock step leaves the
  customer whole instead of destroying their statement.

The archive flag, its filtering and its UI were removed with the rest.

### One thing kept

`SupplierDetails` now has an Edit Payment modal alongside Delete Entry, wired to
the `editLedgerEntry('supplier', …)` path that already existed in the codebase
and had no caller. Customers had editing; suppliers had only deletion. This
matches "adjust **or** delete a transaction" and is two blocks to remove if it
is not wanted.

### Open against the written requirements

Three places where the code still refuses what the notes ask for:

1. **`deleteItem` refuses an item that appears in any sale or purchase**, and
   tells the operator to use the Active toggle. The note asks to delete an item
   at any time. Deleting a traded item leaves historic bills pointing at nothing.
2. **`deleteSupplier` refuses a supplier with purchase history**, same shape.
3. **Only the most recent payment is editable.** Editing an older one would make
   every balance after it wrong unless the whole running balance is recomputed.

Deciding these is the client's call, not a bug to fix quietly.

### Verification after revert
53 tests passing, clean `vite build`, oxlint 42 warnings / 0 errors.
