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

---

## Round 4 — the two defects round 3 found

### NEW-07 (High) — customer statement went stale after any deletion
Every ledger row carried a `balanceAfter` written at insert time, and the
customer statement rendered that stored value. Nothing rewrote it when a row
was removed, so deleting a bill left the surviving rows showing a balance from
before the deletion. Observed live: a customer whose real balance was
-Rs 1,000 had their only remaining ledger row printing -Rs 4,250.

The Business Ledger never had the problem, because `getGlobalLedger` already
accumulated its own running total on read.

Fix: `src/utils/ledgerBalance.js` derives the column instead of storing it, and
both `getCustomerLedgerPaginated` and `getSupplierLedgerPaginated` now use it.
The ordering is made total — date, createdAt, seq, then document id — so two
reads of the same data cannot swap rows and make the balance appear to jump.

Two things worth knowing about this shape:
- It **repairs statements a past deletion already corrupted**, with no data
  migration. The stale stored field is simply ignored from now on.
- No future deletion path has to remember to recompute anything, so it cannot
  drift back.

`closingBalance()` is exported alongside it for checking a statement against the
balance held on the customer or supplier document.

### NEW-06 (High) — items whose category was deleted became unmanageable
`Broken Rice` carried `categoryKey: 'boiled-rice'`; the real category's key is
`boiled`. Item Masters and Inventory each rendered `categories.map(...)`, so the
bucket built for an unknown key was never iterated, while the totals still
counted it. 400 bags worth Rs 3,60,000 appeared in Total Bags, on the Dashboard
and in the Stock Summary report, but in no editable table — so they could not be
edited, adjusted, deactivated or deleted from anywhere in the app, while staying
fully sellable.

The bug existed twice because the grouping existed twice. Both copies are now
replaced by `src/utils/itemGrouping.js`, which returns the groups **and** the
category list to render, appending one "Uncategorised" entry per orphaned key,
flagged `isOrphan` and badged "missing category" in the UI with the missing key
named in its tooltip.

Two smaller things fixed while there:
- `expandedCats` is now seeded from the items as well as the categories. An
  unseeded group renders collapsed, which would have left the orphan just as
  hidden as before.
- The shared version keeps Inventory's duplicate-key and duplicate-id guards,
  which Item Masters had been missing.

Still needs doing in the data: re-point `Broken Rice` to `boiled` in the Firebase
Console. The code change makes it visible and editable; it does not decide which
category it belongs in.

### BUG-10 (Medium) — future-dated transactions
Round 3 recorded this as fully open. That was too harsh, and the correction is
worth recording: `Sales.jsx` and `RecordPaymentModal` already refused a future
date at save. What was missing:

- No `max` on any date input, so nothing stopped the date being picked. The only
  feedback was a toast after pressing Save. All five transaction date inputs now
  carry `max={getISTTodayDateString()}`.
- **Three forms had no guard at all**: `NewPurchaseModal`,
  `RecordSupplierPaymentModal` and `RecordPurchasePaymentModal` would have saved
  a future-dated record. All three now refuse one, matching the two that did.

Back-dating stays available, which the business needs.

### Tests
`ledgerBalance.test.js` (9) reproduces the exact round-3 deletion scenario and
pins that a stale stored value is ignored. `itemGrouping.test.js` (10) asserts
the rendered rows account for every bag the header counts — the equality that
was 6,381 vs 5,981 before the fix.

71 tests passing (was 53), clean `vite build`, oxlint 42 warnings / 0 errors.

---

## Round 5 — items could not be renamed

Deciding what to do about the three records all called some form of "Hmt Boiled"
(4,922 in Boiled Rice, 774 in Carshed, 1,038 in Godown — 6,734 bags between them)
raised a question only the business could answer: are Carshed and Godown storage
locations, or was the split an accident?

They are locations. So the stock split is real information and merging would
destroy it; the fix is to rename the records so they stop being confusable at the
point of sale.

That turned out to be impossible. `AddItemModal` set `disabled={!!editingItem}`
on the Item Name field, so an existing item's name could not be changed anywhere
in the app. `updateItem` had supported renaming all along — it trims, rejects an
empty name, and runs a case-insensitive duplicate check that correctly excludes
the item being edited. Only the UI blocked it.

The field is now editable. Opening Stock stays locked on edit, which is correct:
stock moves through Adjust Stock so it is audited and carries a reason.

Past bills are unaffected. A sale stores the item name as a snapshot alongside
the itemId, so an old invoice keeps the name it was written with — which is the
right behaviour for a ledger.

### A trap found while testing this

While duplicates exist, **none of them can be saved unchanged**. Saving one of
the three sends its unchanged name, which collides with its siblings, and the
guard refuses it — so an operator cannot correct even the MRP on any of them.
Renaming is not blocked, because the new name collides with nothing.

The order therefore has to be: rename first, then any other edit works. Pinned by
a test so the behaviour is not mistaken for a bug later.

### Data still to do
- Rename `Hmt Boiled` (Carshed, 774) and `Hmt Boiled` (Godown, 1,038) so all
  three are distinct. The Carshed record's stored name also has a trailing space,
  which the rename will trim away.
- Delete the two zero-stock `Sona Raw` / `sona raw` records left from round 1
  testing.

78 tests passing (was 71), clean build, oxlint 42 warnings / 0 errors.

---

## Round 6 — the full sweep after the rename went live

Two defects, both live, both affecting money. Plus a correction to what the
round 5 note above claims.

### Correction to round 5

That note says `updateItem` "had supported renaming all along ... Only the UI
blocked it." That was wrong, and unlocking the field is what exposed it.

### R4-D2 (Critical) — no item could be edited at all, ever

`AddItemModal.handleSubmit` called

```js
updateItem(editingItem.id, { categoryKey, bagKg, mrp })
```

with no `name`. `updateItem` treats a missing name as blank and throws
"Item name is required.", so **every** item edit failed — a plain MRP, bag-size
or category correction included, not only a rename. The console confirmed it:
seven save attempts, seven identical server-side errors.

This is original code (commit `9f571ac`), not a regression. The disabled Item
Name field hid it for months: the field looked deliberately read-only rather
than silently unsent, and nobody had reason to suspect the payload.

`itemRename.test.js` exercises `updateItem` directly, so it passed throughout
and caught none of this. `itemEditModal.test.jsx` goes through the modal and
asserts on the payload the form actually sends. Reverting the one-line fix
turns two of its six tests red.

The catch block also flattened every failure into "Failed to save item",
hiding the one message an operator can act on — "An item with the name X
already exists." It now surfaces the real reason.

### R4-D3 (Critical) — supplier payment edits wrote to the wrong side

`recordSupplierPayment` and `recordPayment` both store a payment as
`{ debit: 0, credit: amount }`. `editLedgerEntry` did not: it branched on
`isSupplier`, read the old amount off `debit` — always 0 — and wrote the new
amount to `debit` as well, leaving the original `credit` in place.

Reproduced live on Kalambur AMK: an Rs 11,000 bill, an Rs 4,000 payment,
edited to Rs 6,000.

| | showed |
|---|---|
| the ledger row | debit Rs 6,000 **and** credit Rs 4,000 — a bill and a payment at once |
| the statement | Rs 13,000 |
| the header | Rs 1,000 |
| the Supplier Balance report | "paid Rs 10,000" — summing both sides of the row |
| **correct** | **Rs 5,000** |

Because `oldAmount` came back 0 the delta was the whole new amount, so the
balance was reduced by it a second time on top of the original payment. The
customer path was unaffected: it read and wrote `credit`, where the amount
actually lives. The branch is gone — a payment is a credit for both.

**The balance is now recomputed from the person's rows** rather than nudged by
a delta, in both `editLedgerEntry` and `deleteLedgerEntry`. A delta is only
correct while the stored figure is, and this function used to corrupt that
figure: a skewed balance would otherwise stay skewed forever, since every
later delta lands on top of the wrong number. Deriving it means one bad write
cannot outlive the next edit, and the damaged Kalambur AMK record repairs
itself the first time anyone edits or deletes that payment. Same reasoning as
the statement's running balance in `utils/ledgerBalance.js`.

Reverting either half turns six of the eight tests in
`editLedgerEntry.test.js` red.

### R4-D1 (High) — every deploy risked a blank page

`firebase.json` set no `Cache-Control`, so Firebase served `index.html` with
`max-age=3600`. For an hour after any deploy a returning user runs the old
app — and the old content-hashed bundle is gone, so the `"**" -> /index.html`
rewrite answers the request for it with `index.html` at status 200. With the
`nosniff` header already in place the browser refuses to execute it and the
user gets a blank page, recoverable only by a hard refresh.

Confirmed against the live site: `fetch('/assets/index-COr-ZApF.js')` returned
`200`, an HTML body, `cache-control: max-age=3600` and `nosniff`. This session
hit it in the middle of testing, which is how it was found.

`index.html` is now `no-cache, no-store, must-revalidate`; `/assets/**` is
`immutable` for a year, which is safe because those filenames are hashed.

### R4-D4 (Gap) — a category can be created but never deleted or renamed

There is no `deleteCategory` anywhere in `src/`, and no delete or rename
control in the Item Masters UI — only Add Category inside the Add Item modal.
Verified by creating one: once saved it is permanent from inside the app.

This is also how round 4's NEW-06 orphan happened. The duplicate "Boiled Rice"
category was removed from the **Firebase Console**, not the app, so nothing
re-pointed its item and 400 bags went invisible. While the console is the only
way to remove a category, that will recur. The `itemGrouping` fix surfaces such
items rather than hiding them, but the cause is still open.

Not fixed here: deciding what happens to an item whose category is deleted is
the client's call — block the delete, or re-point the items first.

92 tests passing (was 78), clean build, oxlint 42 warnings / 0 errors.

### Verified after the deploy (bundle index-WOZfADgy.js)

- **R4-D1** — `index.html` serves `no-cache, no-store, must-revalidate`;
  `/assets/**` serves `public, max-age=31536000, immutable`.
- **R4-D2** — all three renames saved: `HMT Boiled` (4,922),
  `HMT Boiled - Carshed` (774), `HMT Boiled - Godown` (1,038), with the
  Carshed record's trailing space trimmed away. Item editing works for the
  first time, which was the blocker on the whole round 5 objective.
- **R4-D3** — the Kalambur AMK record was repaired by editing the payment
  once. Row went from `debit 6,000 / credit 4,000 / balance 13,000` to
  `credit 6,000 / balance 5,000`; the header from Rs 1,000 to Rs 5,000; the
  Supplier Balance report from `paid 10,000 / payable 1,000` to
  `paid 6,000 / payable 5,000`. All four sources now agree, on the correct
  figure. The self-repair worked as designed — corrupted row and skewed
  stored balance both healed on one edit, no migration.
- **Data** — both zero-stock `Sona Raw` records deleted. There are now **zero
  duplicate item names anywhere in the app**, and the purchase item picker
  lists 16 items, every one uniquely identifiable. That closes the
  mis-billing risk this whole thread started from.
- **Reconciliation** — Inventory reads 16 items / 8,307 bags, re-summed row by
  row and matching the header exactly.

Still open: **R4-D4**, and the leftover `ZZ Test Cat` category, which needs a
Firebase Console delete precisely because R4-D4 is unfixed.

---

## Round 6 postscript — a fix of mine that hung the app

Worth recording, because the tests did not catch it and the shape is worth
remembering.

The balance recompute in `9e8c5b6` issued its collection query from **inside**
the `runTransaction` callback. A query made there can block on the same stream
the transaction is holding. The payment edit then hung on "Saving..."
indefinitely — no error, no toast, no console entry, nothing written. It
surfaced on the very first live use, repairing Kalambur AMK.

The failure was at least clean: the transaction never committed, so no partial
state. But a payment edit that never returns is worse than the defect it
replaced.

`e9e44d2` reads the ledger once, before the transaction opens, and that single
read serves both the recency guard and the recompute — the separate `limit(10)`
query is gone. The transaction still re-reads and re-validates the entry and
the person document before writing.

The trade-off, stated plainly: the rows are read a moment before the commit, so
a concurrent write could in principle land in between. Acceptable here — one
operator, a handful of rows per person — and it is why the entry's own checks
stayed inside the transaction.

**Why the tests missed it.** All eight tests in `editLedgerEntry.test.js`
passed while the feature was unusable, because every one of them tested the
arithmetic and none tested the mechanics. Two tests now pin the ordering: one
asserts `getDocs` has already been called by the time the transaction opens,
the other that the ledger is read exactly once. Moving the read back inside
turns the first red while the other nine stay green.

94 tests passing, clean build, oxlint 42 warnings / 0 errors.

---

## Round 7 — R4-D4 closed: categories can be deleted

Client's decision: deleting a category deletes the items filed under it, but
**not** the transactions those items appear in.

### Why that is safe for history

Every sale line stores `{ itemId, item: <name>, cat: <categoryKey> }` and every
purchase line stores `{ itemId, itemName, categoryKey }`, all written at the
time of the transaction. A bill therefore does not read the item document to
display itself, so an old invoice still shows the right product at the right
price after both the item and the category are gone. That is the correct
behaviour for a ledger anyway: a bill should record what was sold that day, not
follow later edits to the master record.

What genuinely does go is the **stock** those items held — bags and stock value
drop out of every total. `getCategoryDeletionImpact()` measures that before
anything is deleted so the confirmation can state the number, alongside a count
of the sales and purchases that will be kept. The dialog requires the category
name to be typed, matching the existing customer-delete pattern.

`deleteCategory()` deliberately ignores the "item has transaction history" guard
that `deleteItem` enforces, which is why it needs its own implementation rather
than looping over `deleteItem`. It also removes items whose category document is
already missing, so it cleans up the NEW-06 orphan state.

### A trap that had to be fixed first

`getCategoryPnL` seeded its accumulator only from the live `categories`
collection and wrapped every accumulator line in `if (catMap[catKey])`. A
purchase or sale in a category that no longer existed was **silently dropped**
from the report — the totals simply got smaller, with nothing to indicate it.

Shipping category deletion on top of that would have quietly erased exactly the
history the client asked to preserve. Keeping the rows in the database while
they vanish from the P&L is the same loss from the business's point of view.
Unknown keys now get their own `Uncategorised (<key>)` row.

A second, pre-existing bug in the same lines: an unresolvable category was
defaulted to `'raw'`, so those figures were not lost but **misfiled**, inflating
Raw Rice. Unknown now stays unknown.

Reverting the report fix turns four of that file's five tests red; reverting the
cascade turns three of the other file's eleven red.

### Worth a decision, not changed here

The standalone Delete Item button still refuses an item that appears in any sale
or purchase, telling the operator to deactivate it instead. The category cascade
now deletes such items anyway. So the guard offers a safety that is one click
away via the category, and the client's written note ("delete item created at
any time / alter or delete the item & its stock") arguably asks for it to go.
Left as-is because removing it was not what was asked for.

No security-rules change was needed: `categories` and `items` already allow
`delete: if isOwner()`. The stale comment on the items rule has been corrected.

110 tests passing (was 94), clean build, oxlint 42 warnings / 0 errors.

---

# Fixes applied after QA round 5 (08 Sept 2026)

Live-site test run: 130 cases, 114 pass / 14 fail. The two HIGH and four MEDIUM
findings are fixed below. Verified with `npx vitest run` (129 tests, all passing —
19 new: 14 in `round5Fixes.test.js`, 5 in `editLedgerEntry.test.js`) and
`npx vite build`. oxlint: 0 errors.

## R5-H1 (High) — a negative "Amount paid now" was saved on a sale

Entering `-100` in AMOUNT PAID NOW and saving stored `advance: -100`. The bill
showed Paid ₹-100 / Due ₹5,500 and the customer's balance rose by ₹100 — a
negative credit. `createSale`/`editSale` only did `Number(advance) || 0`.

**Fix.** `sales.js` gains `assertNonNegativeMoney` and `assertSaleRows`: both
create and edit refuse a negative advance, a negative bill-level payment, a
non-positive bag count or a negative price before any read. `Sales.jsx` mirrors
it: the Save button is disabled, the field turns red with an inline message,
and negative bag counts no longer render a negative subtotal as an "advance"
(the SALE-06 cosmetic finding).

## R5-H2 (High) — deleting a purchase after its bags were sold left phantom stock

Purchase 5 bags (4 → 9), sell 8 (→ 1), delete the purchase: `deletePurchase`
did `Math.max(0, stock - bags)`, so stock went to 0 instead of -4 and the 4-bag
shortfall vanished. Deleting the sale afterwards restored +8 → 8 bags on hand
against a true 4.

**Fix.** The transaction now refuses when `currentStock < bags` with a message
naming the item, the shortfall and what to do ("delete the related sales or
adjust the stock first"). `getPurchaseDeletionBlockers` runs the same check up
front so `DeletePurchaseModal` explains the block and disables the button
before the user tries.

## R5-M1 (Medium) — inactive items still appeared in the Sales item search

The Active toggle's tooltip promises to hide the item from sales dropdowns; the
search used the full `getItems()` list. `Sales.jsx` now passes only
`active !== false` items to `InvoiceRowsTable` (the full list is kept for
resolving old bills on edit); `NewPurchaseModal` filters the same way.

## R5-M2 (Medium) — duplicate category names; no rename; no Tamil name

"raw rice" could be added alongside "Raw Rice". `addCategory`/`updateCategory`
now enforce case- and whitespace-insensitive uniqueness on label and key.
`AddCategoryModal` gains a Tamil-name field, and `ItemsList` gains a pencil next
to each category header that opens the same modal in edit mode (delete already
shipped in round 4 — see above — but was not yet deployed at test time). Empty
Tamil names no longer render as "()".

## R5-M3 (Medium) — a supplier-level payment never reached the bills it paid for

Recording ₹6,000 on the supplier page lowered the supplier's balance to ₹5,000,
but PUR-2026-0004 still read UNPAID / due ₹11,000. Same money, two answers.

**Fix.** New `firebase/supplierAllocations.js`. `recordSupplierPayment` spreads
the amount oldest-bill-first over the supplier's open purchases, updates each
bill's `amountPaid`/`balanceDue` and records `allocations` on the ledger row
(the description reads "Payment made · Cash · applied to PUR-…"). Purchases gain
`amountPaidViaSupplier` so the two sources of payment stay distinguishable:

- `editLedgerEntry` on a supplier payment undoes the old spread and re-applies
  the new amount, writing each bill once.
- `deleteLedgerEntry` gives the bills their dues back.
- `deletePurchase` no longer adds back the allocated part (that money was paid
  and stays as supplier credit), keeps the supplier-payment row, and only strips
  this bill from its allocations. Bill-level payment rows are deleted as before.

Open bills are read before the transaction opens, for the same reason the
ledger read is (see round 4): a query inside `runTransaction` can hang.

## R5-M4 (Medium) — an item with sales history could be deleted

`deleteItem` already refused (round 3), but the dialog only warned about stock
and offered "Delete Anyway"; the refusal arrived as a toast afterwards. New
`getItemTransactionUsage` counts the sale and purchase bills an item is on;
`DeleteItemModal` calls it on open, shows the counts, and disables the button.

## Also in this round (Low)

Pluralisation ("1 item", "1 sale"); empty Tamil category label hidden.

## Data left behind by the test run

Two categories could not be removed from the live site at the time (no delete
UI deployed): `raw rice` (duplicate, created while reproducing R5-M2) and
`ZZ Test Cat`. Delete both from Masters → Item Masters once this build is live.
