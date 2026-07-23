# Codebase Audit — SKB Rice · Mundy

**Scope:** full `src/` tree (~10,000 lines across firebase/, pages/, components/, context/, utils/, `__tests__/`).
**Mode:** read-only. No code was changed while producing this report.
**Method:** four parallel deep-reads (Firebase data layer · Sales/Purchase/Reports pages · Customer/Supplier/Dashboard/Inventory pages · App infra/utils/tests), cross-checked for duplication across boundaries, then the highest-severity claims were independently re-verified against the source before being written up here.

Every issue below lists: file:line · what it is · why it matters · suggested fix direction (description only) · severity.

---

## 0. Critical — read these first

These are the findings most likely to cause real financial/data incorrectness or user-facing breakage, not just maintenance friction.

### C1. Payment amount can silently become `NaN` and corrupt a balance
**[src/firebase/customers.js:136](src/firebase/customers.js:136)**, **[src/firebase/suppliers.js:82](src/firebase/suppliers.js:82)**
```js
const numAmount = Number(amount);
if (numAmount <= 0) throw new Error("Payment amount must be greater than 0");
```
There's no `isNaN(numAmount)` check. If `amount` is ever a non-numeric string (a UI bug, a stray keystroke that slips past client validation, a future API caller), `Number(amount)` is `NaN`, and `NaN <= 0` evaluates to `false` — so the guard is bypassed and `NaN` gets written straight into `debit`/`credit`/`balance` on the customer or supplier doc inside the Firestore transaction. Once a document's `balance` field is `NaN`, every subsequent arithmetic update to it (`balance + amount`, `balance - amount`) stays `NaN` forever, and every page that renders `balance.toLocaleString()` on that record will crash (see C4/related findings below).
Contrast: `src/firebase/ledger.js:5-7` (`editLedgerEntry`) *does* check `isNaN(numAmount) || numAmount <= 0` — so the guard exists correctly elsewhere in the same codebase, just not here.
**Fix direction:** add the same `isNaN(...) ||` check to both `recordPayment` and `recordSupplierPayment`.
**Severity: Critical.**

### C2. Ledger "most recent payment" edit-guard picks the wrong entry on same-day ties
**[src/firebase/ledger.js:16, 29-31](src/firebase/ledger.js:16)**
```js
const recentQuery = query(ledgerColRef, orderBy("date", "desc"), limit(1));
...
const recentSnap = await getDocs(recentQuery);
if (!recentSnap.empty && recentSnap.docs[0].id !== entryId) {
  throw new Error("Only the most recent payment can be edited");
}
```
This sorts only by the business `date` field, with no tiebreak. The app very commonly has multiple ledger entries sharing the exact same `date` (multiple payments/sales recorded the same business day) — `src/firebase/customers.js`'s own `getCustomerLedgerPaginated`/`getGlobalLedger` explicitly sort by `(date, createdAt, seq)` to solve exactly this tie problem, but this guard query was never updated to match. Among same-`date` docs, Firestore's `limit(1)` tiebreaks by document ID, which has no relationship to actual recency.
**Why it matters:** the "only the most recent payment is editable" safety rule can pick the *wrong* document — either wrongly blocking a legitimate edit to the true latest payment, or (worse) wrongly permitting an edit to a stale entry that happens to sort first by ID.
**Fix direction:** fetch the top few by `date desc`, then re-sort client-side with the same `(date, createdAt, seq)` tiebreak already used in `customers.js`, before comparing IDs.
**Severity: Critical.**

### C3. Monthly sales totals use local browser timezone, not UTC — numbers can differ by viewer
**[src/firebase/sales.js:39-41](src/firebase/sales.js:39)**
```js
const startObj = new Date(year, monthIdx, 1, 0, 0, 0, 0);
const endObj = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
```
Compare **[src/firebase/purchases.js:22-23](src/firebase/purchases.js:22)**, which does the same job correctly:
```js
const startObj = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0));
const endObj = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));
```
Business dates are stored as UTC-midnight-of-the-IST-day (the whole point of `src/utils/dateIST.js`). `getSalesByMonth` builds its range boundary using the *browser's local timezone* instead of UTC. On any client whose local timezone offset isn't 0, the computed month boundary is shifted relative to the true UTC boundary, and the `where("date", ">=", startObj)` / `where("date", "<=", endObj)` Firestore query can silently include or exclude sales recorded right at the edge of the month (most concretely: the 1st of the month). This function backs the Sales page's month view (`Sales.jsx` calls it directly).
**Why it matters:** this is a financial-reporting correctness bug that depends on where the person viewing it happens to be, and would be very hard to notice ("the totals looked a little off that one time") rather than something that throws an obvious error.
**Fix direction:** mirror `purchases.js` — use `Date.UTC(...)` for both boundaries.
**Severity: Critical.**

### C4. Most of the test suite doesn't exercise real application code
**`src/__tests__/dataIntegrity.test.js`, `errorHandling.test.jsx`, `performance.test.js`, `responsiveness.test.jsx`, `validation.test.js`**
None of these five files import anything from `src/firebase/*`, `src/pages/*`, or `src/components/*`. Each one hand-reimplements the logic it claims to test *inside the test file itself* (its own `isDuplicate`, its own balance math, its own `TestTransactionForm`, its own `sanitizeInput`, its own mock `MockAppShellHeader`), then asserts against that reimplementation.
- `dataIntegrity.test.js` never touches the actual sale/purchase/payment Firestore transaction code in `sales.js`/`purchases.js`/`customers.js`/`suppliers.js` — a real bug in any of those (including C1–C3 above) would not be caught by this suite.
- `responsiveness.test.jsx` is demonstrably already drifted: it asserts a `min-h-[44px]` class on a hand-copied mock search input, but the real search input in `src/components/AppShell.jsx:263-273` has no such class — a real regression there would never be caught, while the test stays green.
- `validation.test.js` tests a `sanitizeInput` function that doesn't appear to exist anywhere in the real form components (`AddCustomerModal.jsx`, `AddSupplierModal.jsx`, `AddItemModal.jsx`) — this gives false confidence that input sanitization exists and is verified, when it may not be implemented at all in production code. Worth a dedicated follow-up check.
- `security.test.js`'s last test ("rollback procedure allows rapid deployment") defines a string and immediately asserts it contains a substring of itself — it cannot ever fail and verifies nothing.
By contrast, `authorization.test.js` (imports real `permissions.js` + reads real `firestore.rules` off disk) and `security.test.js`'s other checks (real `firebase.json`/`config.js` off disk) are genuine. `auth.test.jsx` partially exercises the real `AuthContext` state machine.
**Why it matters:** "tests are green" reads as a safety net for touching `sales.js`, `purchases.js`, or any form validation — but for those specific areas, it currently isn't one. This directly affects how much confidence phase-2 refactoring can place in the existing suite.
**Fix direction:** rewrite these five files to import and exercise real `src/` code (mocking Firestore, the way `auth.test.jsx` already does correctly) rather than parallel reimplementations.
**Severity: Critical** (as a false-confidence/release-gate risk), Moderate as a pure hygiene issue.

---

## 1. Cross-cutting redundancy (same thing reimplemented in 3+ places)

These aren't tied to one file — the same concept has multiple independent, drifting definitions across the codebase. Grouped here because fixing one instance without the others accomplishes little.

| # | Pattern | Where it's duplicated | Why it matters | Severity |
|---|---|---|---|---|
| R1 | Rice-category label map (raw/boiled/steam/basmathi/seeraga) | `Sales.jsx:603` (IIFE-local), `PurchasePage.jsx:8-14`, `NewPurchaseModal.jsx:10-16`, `SupplierDetails.jsx:10-16`, `SuppliersList.jsx:8-14`, `AddSupplierModal.jsx:6-12` **and again** `:91-97` (twice in the *same* file), plus `reports.js` (4-5 separate redefinitions at lines ~417-423, 574-580, 602-608, 815-821, 859-865) | Adding/renaming a category means editing 8+ files in different data shapes (array of `{key,label}` vs plain object); a missed spot silently shows a raw key string in the UI, or (worse, see R6 below) silently drops a category's data from a report. | Moderate |
| R2 | `toMillis`/date-coercion helper | `src/utils/dateIST.js` exports the canonical version; `customers.js:23-30`, `sales.js:12-19`, and `customerStatus.js:3-16` each reimplement a near-identical local copy instead of importing it. `suppliers.js`, `purchases.js`, `dashboard.js` correctly import the shared one. | Classic half-migration: `dateIST.js` was introduced specifically to centralize this, and roughly half the call sites were never switched over. The local copies aren't even fully identical (e.g. `customerStatus.js`'s version handles a raw `{seconds:N}` shape that `dateIST.js`'s doesn't), so behavior can silently diverge depending on which helper happens to run. | Moderate |
| R3 | Inline `x.date?.toDate ? x.date.toDate() : new Date(x.date || ...)` coercion | Appears ~10+ times across `reports.js`, plus in `dashboard.js:44` and `sales.js:495-496` — instead of calling the already-exported `toDateObj` from `dateIST.js` | Same root cause as R2; any edge-case fix to date coercion won't propagate to these inline copies. | Minor |
| R4 | Month-name arrays | `Sales.jsx:602` (long form, recreated every render), `PurchasePage.jsx:16-19` (long form, module-level), `Reports.jsx:39-42` (short form) | Three sources of truth for the same list, two different shapes. | Minor |
| R5 | Month-navigation logic (`curYear`/`curMonthIdx`/`prevDate`/`nextDate`/`isCurrentOrFuture` guard) | `Sales.jsx:604-611` and `PurchasePage.jsx:170-176` — near byte-for-byte identical | A future edge-case fix (e.g. a boundary bug in "is this the current month") has to be applied twice or the two pages silently diverge. | Moderate |
| R6 | Hardcoded categories instead of reading the live `categories` Firestore collection | `reports.js` functions `getCategoryPnL`, `getCategoryStockValueReport`, `getStockSummaryByVariety`, `getCurrentStockReport` all hardcode the 5 seed categories, while `getTotalInventoryReport` and `getItemWiseSalesReport` correctly fetch the live `categories` collection | If a 6th category is ever added (the schema supports arbitrary categories via a collection, not an enum), these 4 report functions will silently omit its data from P&L/stock reports while two sibling functions pick it up fine. | Moderate |
| R7 | Low-stock threshold (`15`) | Named constant in `Inventory.jsx:8`, a *separate* named constant in `firebase/dashboard.js:6`, and a bare magic number `15` in `Dashboard.jsx:129` | Three independent sources of truth for one business rule; the Dashboard.jsx one isn't even named, so it's invisible to a search for the threshold. | Moderate |
| R8 | Hardcoded year `2026` | `Reports.jsx:45` (`startYear`), bill-number prefixes in `sales.js:9,75` and `purchases.js:70` | These have to be bumped in lockstep every January across files that don't reference each other; currently latent, becomes a real bug at the 2026→2027 rollover (~5.5 months from today). | Moderate |
| R9 | Payment-recording form (RecordPaymentModal vs RecordSupplierPaymentModal) | `src/components/RecordPaymentModal.jsx` (186 lines) and `RecordSupplierPaymentModal.jsx` (148 lines) share ~85% identical validation/state/JSX, differing mainly in which Firebase function they call and whether a live customer/supplier picker exists | A UX change to one (e.g. adding a reference-number field) has to be manually mirrored in the other; already shows drift (see R10). | Moderate |
| R10 | `recordPayment` vs `recordSupplierPayment` (data layer) | `customers.js:130-171` and `suppliers.js:76-117` are near-identical function bodies differing only in field names and balance sign | Same duplication as R9 one layer down; a bug fixed in one (e.g. C1's missing `isNaN` check) has to be fixed in both and currently isn't. | Moderate |
| R11 | `sortByDateThenCreatedAt` helper | Defined identically in `sales.js:26-30` and `purchases.js:9-13` instead of one shared export | Straightforward duplication. | Minor |

---

## 2. Firebase data layer (`src/firebase/*.js`)

### customers.js
- **:70-75 `getGlobalLedger`** — awaits each customer's ledger fetch sequentially in a `for...of` loop (one Firestore round-trip per customer) instead of `Promise.all`. Scales linearly with customer count; will visibly slow down as the business grows. — *Moderate.*
- **:39-57 `getCustomerLedgerPaginated`** (and the equivalent in `suppliers.js:27-43`) — fetches the *entire* ledger subcollection with no server-side `limit`/cursor, sorts and slices client-side. "Pagination" here is cosmetic — it downloads full history on every page view regardless of which page is requested. Cost/latency grow unbounded with transaction history. — *Moderate.*
- **:100-128 `addCustomer` supports `openingBalance` (with a ledger entry write); `addSupplier` has no equivalent** — confirmed no UI path passes an opening balance to suppliers either. Real asymmetry between two otherwise-parallel entities; worth confirming whether intentional. — *Moderate.*

### suppliers.js
- **:74 `export const editSupplier = updateSupplier;`** — a same-function alias under two names, pure indirection. — *Minor.*

### ledger.js
- **:24-26** — hard-codes "only `type === 'payment'` entries are editable" as the sole ledger-mutation path, while `sales.js`'s `editSale` directly mutates `type: 'sale'` ledger docs through a completely separate hand-rolled path that doesn't share this function's safety checks (including the same-day tiebreak issue in C2). Two different code paths mutate ledger entries with two different safety guarantees. — *Moderate.*
- **Only ever called from `CustomerDetails.jsx`** — despite explicitly supporting `personType === 'supplier'` (line 10-11), `SupplierDetails.jsx` has no edit-payment UI at all, so a mis-entered supplier payment can't be corrected in-app even though the backend supports it. — *Moderate* (feature gap, backend is ready).

### items.js
- **:72-160** — `seedIfEmpty`/`initialCategories`/a ~29-row hardcoded price list live in a client-importable production module (guarded only by an in-memory flag). Not a correctness bug, but demo/seed data with real-looking prices baked into the shipped bundle is a smell, and prices will silently go stale. — *Minor.*
- **:49, 58** — `addItem`/`updateItem` `delete payload.rate` after computing `mrp` — a half-completed `rate`→`mrp` field rename. Readers (`dashboard.js`, `reports.js`, `sales.js`) still defensively fall back to `.rate` for old docs, which currently works but is unmanaged tech debt with no cleanup plan. — *Minor* (handled safely today).

### purchases.js
- **No `editPurchase` exists at all** — `sales.js` has a large dedicated `editSale` (see below); purchases have no equivalent, so correcting a wrong bags/cost/supplier entry currently requires manual Firestore editing. — *Moderate* (product gap — worth confirming intent before treating as a bug).

### sales.js
- **:205-486 `editSale`** — a 280-line function handling bill recompute, stock deltas, and ledger rewrites, with two long branches (same-customer vs cross-customer edit, ~346-404 and ~405-468) that duplicate most of their logic with only the customer identity differing. High complexity, easy to fix one branch and forget the other. — *Moderate.*
- **:137, 152, 168, 359, 423, 474 `new Date(date)`** — no fallback/validation, unlike `purchases.js:58`'s `date || getISTTodayDateString()`. An empty `date` produces an `Invalid Date` that only fails inside the Firestore transaction, rather than being caught earlier. — *Minor.*
- **:84-86, 349-351, 412-414** — running balance math is plain floating-point with no rounding step before writing to Firestore; safe today only if all rates happen to be whole rupees, with nothing enforcing that. — *Minor* (contingent risk).

### reports.js (908 lines — largest data-layer file)
- **:374-388, 430-444, 561-571, 670-676** — several purchase-report functions branch on a `p.items` array shape that `purchases.js`'s only writer (`createPurchase`) never actually produces (it only ever writes flat fields) — this branch is dead code today. If it were ever reached, it reads a `row.rate` field, but the real flat schema's field is `costPerBag` — so a future multi-item purchase using this exact shape would silently compute zero cost per row. Looks copy-pasted from the sales-report equivalent (which does have a real `items` array) and never adapted. — *Moderate* (dead code today, latent silent-zero-cost bug if purchases ever go multi-item).
- **:338/401 `getpurchasesReport`** (lowercase "p", inconsistent with every sibling `get<Noun>Report` export) has a same-file alias `getSupplierWisePurchasesReport` immediately after it with zero call sites (confirmed via grep — only `getpurchasesReport` is imported). Reads like an unfinished rename. — *Minor.*
- **All purchase-oriented report queries** (`getSupplierBalanceReport`, `getDateWisePurchaseReport`, `getpurchasesReport`, `getCategoryPnL`, `getItemPurchaseData`) fetch the entire `purchases` collection and filter by date client-side, whereas the equivalent sales-report functions in the same file correctly push the date range into the Firestore `where(...)` query. Every purchase report downloads full purchase history regardless of the requested range — inconsistent with, and slower than, the sales-side pattern two sections above. — *Moderate.*
- **:15-62 `getCustomerWiseBalanceReport`** manually recomputes date boundaries instead of reusing the module's own `getRangeQuery` helper that every other report function uses. — *Minor.*

### dashboard.js
- **:44-45** `sale.date.toDate ? sale.date.toDate() : new Date(sale.date)` with no guard for `sale.date` being absent — a single `sales` doc missing its `date` field throws inside `getWeekSales` and crashes the whole Dashboard weekly-sales chart. `dateIST.js`'s `toDateObj` already handles this null-safely and isn't used here. — *Moderate.*

### config.js
- **:17** `getAnalytics(app)` is called unconditionally at module load with no environment guard — harmless in the current pure-SPA setup, would throw in a future SSR/test context that imports this module. No secrets found in the committed config; all values come from `import.meta.env.VITE_FIREBASE_*`, which is the standard/safe pattern for Firebase web config. — *Minor.*

---

## 3. Sales / Purchase / Reports pages

### Sales.jsx (826 lines)
- **Overall structure** — one component doing data fetching, row math, stock validation, edit-lifecycle state, and full invoice rendering (lines 408-826 are JSX, including an inline IIFE at 601-786 that recomputes category/month constants on every render). Hard to test any one concern in isolation. — *Moderate.*
- **:118-174 vs :176-194** — the "how much stock is actually available considering this row might be an edit" formula (`effectiveAvailable`) is computed independently in `handleRowChange` and `handleRowBlur`. A fix to one is easy to miss in the other. — *Moderate.*
- **:106-108** (and 46, 240, 254, 272, 346, 372) — `Date.now()` used as a new row's `id` with no collision guard. Two rapid row-additions within the same millisecond produce duplicate ids; since rows are matched by `row.id === id`, an edit could silently apply to both rows, plus React would warn on duplicate keys. — *Moderate.*
- **:566 payment-mode `<select>` hardcodes `Cash / Bank Transfer / UPI / Cheque`, but `src/utils/constants.js:1` defines `PAYMENT_MODES = ['Cash','Bank Transfer','UPI','Scan']`** — the canonical list used by both payment modals. A payment recorded from this inline edit form can be saved with mode `"Cheque"`, a value that exists nowhere else in the app's vocabulary; anything filtering/reporting by `PAYMENT_MODES` will never recognize it, and this form can never produce `"Scan"`. This is a genuine data-consistency bug, not a style nit. — **Moderate-High.**
- **:262 `document.querySelector('main')?.scrollTo(...)`** — this is the already-fixed version of the earlier `window.scrollTo` bug (confirmed no `window.scroll` calls remain anywhere in `src/`), and it currently works because `AppShell.jsx:381` renders exactly one `<main>`. But the coupling is implicit/global — if `AppShell` is ever restructured or `Sales.jsx` reused outside it, this silently breaks or scrolls the wrong element. — *Minor* (working today, fragile if touched).
- **:404** `const formatDate = (dateStr) => formatDateIST(dateStr);` — a pass-through wrapper with no added behavior. — *Minor.*

### PurchasePage.jsx (285 lines)
- **No edit flow exists for purchases at all** (confirmed: no `editPurchase` in `purchases.js`, no edit-mode state here) — mirrors the C-tier finding above; there is no scroll-to-edit-form bug here specifically because there's no edit form to scroll to. Flagged as the underlying product gap. — *Moderate.*
- **:158, 162** — `eslint-disable-line react-hooks/exhaustive-deps` used twice to silence dependency warnings rather than fixing the dependency array. — *Minor.*
- Structural positive: `PurchaseCard` is a reasonably well-factored subcomponent — better factored than Sales.jsx's inline IIFE-based card rendering, and worth using as the pattern Sales.jsx converges toward.

### Reports.jsx (493 lines)
- **:28-36** reimplements UTC day-boundary helpers (`getFirstDayOfMonth`/`getLastDayOfMonth`) that duplicate the intent of `dateIST.js`'s `businessDayStartUtc`/`businessDayEndUtc` rather than living next to them. — *Minor-Moderate.*
- **No error/loading guard on `getQuickStats()` failure beyond `console.error`** (:18-23) — on a fetch failure, tiles quietly render `₹0`/`{}` fallbacks with no error banner, which reads identically to "no outstanding balance" rather than "we couldn't load this." — *Moderate.*

### ReportResultPage.jsx (905 lines — the largest single finding cluster)
- **:134-899** — ~650 lines are 14 near-identical per-report-type `<table>` JSX blocks plus a 14-branch hand-rolled CSV exporter, differing only in column set. Adding a 15th report means editing 4 separate places (this file's table block, this file's CSV branch, and `reportsList`/`purchaseReportsList` in both this file and `Reports.jsx`) with nothing enforcing they stay in sync. — *Moderate* (not broken today, highest ongoing maintenance cost in the audited scope).
- **13 of 14 report-summary footers** use the pattern `reportData.summary?.field.toLocaleString(...)` — the `?.` only guards the `summary` access, not the subsequent `.toLocaleString()` call, so if `summary` is ever absent while `rows` is non-empty, this throws and crashes the whole results table. One footer (`purchase-category-pnl`, ~:667-673) does this correctly with double-chaining + a fallback. Every current report function does return `{rows, summary}` together, so this doesn't fire today, but it's a landmine for the next report author who copies one of the 13 unguarded branches. — *Moderate* (latent, systemic, inconsistent within the same file).
- **No request-cancellation/race-guard** on the report-fetch `useEffect` (:113-115) — a user changing filters twice quickly can have a slower earlier response resolve after a faster later one and silently overwrite it with stale totals. — *Minor-Moderate.*
- Minor CSV-escaping inconsistency: `purchase-supplier-balance` branch escapes `supplierName`/`location` but not `phone`, despite quoting it the same way. — *Minor.*

### NewPurchaseModal.jsx (302 lines)
- **:61-72 `handleItemChange`** prefills the purchase's cost-per-bag from the item master's *selling* rate (`sel.rate`) — the same field Sales.jsx uses as the sale price. A clerk accepting this prefill would record purchase cost equal to sale price, which is very likely wrong (cost should be below sale price) and would silently corrupt Category P&L margins. Reads like a copy-paste from the sales-form pattern rather than intentional purchase-cost logic. — **Moderate** (financial-correctness risk).
- **:111** `categoryKey: categoryKey || selItem?.categoryKey || 'raw'` — a missing category silently defaults to "Raw Rice" instead of surfacing a validation error, mis-attributing the purchase in every category-based report with no trace. — *Minor-Moderate.*

### RecordPaymentModal.jsx / RecordSupplierPaymentModal.jsx
- See R9/R10 above for the duplication itself.
- **Supplier flow has no "pick a supplier" entry point** — `RecordSupplierPaymentModal` always requires `supplierId` to be passed in, unlike the customer modal's live searchable picker (active whenever no customer is preselected). Real UX parity gap: supplier payments can apparently only be recorded from a supplier's own detail page. — *Moderate* (confirm product intent).
- **`RecordSupplierPaymentModal.jsx`** has no client-side guard for a falsy `supplierId` (unlike the customer modal's explicit check) — a stale/undefined id surfaces only as a generic caught Firestore error rather than a clear message. — *Minor.*

### InvoiceRowsTable.jsx (206 lines)
- `sortedItems`/`filteredItems` recomputed on every render, not memoized — negligible at current item-catalog size, flagged only as a latent cost if the catalog grows. — *Minor/cosmetic.* Otherwise one of the better-scoped components in the app (no error/empty-state gaps found).

---

## 4. Customer / Supplier / Dashboard / Inventory / Ledger pages

### Customer ↔ Supplier feature parity (the biggest theme in this section)
`CustomerDetails.jsx` and `SupplierDetails.jsx` are clearly forked from one another (identical header-card layout, identical ledger-table markup, identical pagination math) and have since diverged in ways that look unintentional:

- **No "overdue" status for suppliers** — `utils/customerStatus.js` derives `overdue`/`active`/`settled` for customers from `OVERDUE_DAYS_THRESHOLD`; suppliers have the identical data shape (`balance`, `lastPayment`) but no equivalent util or badge anywhere. A supplier owed money for 200+ days looks identical to one paid yesterday. — *Moderate* (real product gap: overdue payables matter for cash flow too).
- **[CustomerDetails.jsx:118-120](src/pages/CustomerDetails.jsx:118) and [SupplierDetails.jsx:69-71](src/pages/SupplierDetails.jsx:69)** — byte-for-byte identical pagination math (`startIdx`/`endIdx`/`isLastPage`), duplicated rather than shared. — *Moderate.*
- **Customer-only "edit last payment" feature** ([CustomerDetails.jsx:79-89, 237-245, 353-422](src/pages/CustomerDetails.jsx:79), ~70 lines) has no supplier equivalent, despite `firebase/ledger.js:editLedgerEntry` explicitly supporting `personType === 'supplier'` — the backend was built for parity, the supplier UI was never wired up (same finding as the ledger.js item in section 2). — *Moderate.*
- **[CustomerDetails.jsx:166-167](src/pages/CustomerDetails.jsx:166)** `customer.balance.toLocaleString('en-IN')` — unguarded, no `|| 0` fallback; same pattern at **[Customers.jsx:112](src/pages/Customers.jsx:112)**. **[SupplierDetails.jsx:125](src/pages/SupplierDetails.jsx:125)** correctly guards with `(supplier.balance || 0)`. If a customer doc is ever missing `balance` (e.g. hit by the `NaN` bug in C1, or a partially-migrated doc), this throws and crashes the page — no error boundary catches it gracefully. — *Moderate* (real crash risk, and directly reachable via C1).
- **Fragile "most recent payment" edit-guard on the frontend**: the edit-pencil is only shown when `idx === 0` on the *current paginated page*, not globally most-recent. On ledger page 2+, this offers an edit affordance guaranteed to fail server-side (the actual safety net is `ledger.js`'s check, per C2) — no data corruption results, but it's a confusing dead-end UI action. — *Moderate.*
- **No customer edit at all**: `AddCustomerModal.jsx` has no edit-mode/`customerToEdit` prop (confirmed no such code path exists anywhere in `Customers.jsx`/`CustomerDetails.jsx`), while `AddSupplierModal.jsx` fully supports editing via `SuppliersList.jsx`. Fixing a typo'd customer name or phone number currently has no UI path. — *Moderate.*
- Cosmetic-but-notable: the status badge for customers is computed via an IIFE inline in JSX in `CustomerDetails.jsx:145-158`, while the identical logic in `Customers.jsx:87-95` is a plain variable before the JSX — same output, two different and inconsistent styles (a `<StatusBadge>` component would remove both). — *Minor.*
- `CustomerDetails.jsx:4` imports `orderBy` from Firestore but the file's only query sorts manually client-side instead — unused import, likely left behind after a query was refactored to avoid a composite-index requirement. — *Minor.*

### ItemsList.jsx (Masters → Item Masters tab) vs Inventory.jsx — largest duplication in this section
These are two separate full-page implementations of "a categorized item table," not just similarly-styled lists — same table shell (category header, chevrons, sticky header, cell classes) with different actions bolted on (`Inventory.jsx`: stock-adjust + low-stock badges; `ItemsList.jsx`: add/edit item + active toggle + deep-link highlighting). They've already diverged in a user-visible way: **only `Inventory.jsx` dedupes items by id/name before rendering** — the same underlying data could show a different item count on `/inventory` vs `Masters → Item Masters` if any duplicate item docs exist. — **Moderate-to-Critical depending on product intent** (Critical if the two screens are expected to always agree on item counts for the same data).

Related permission-gating inconsistency found while reading these two files:
- `ItemsList.jsx:12-13` computes `isOwner` via `canEditMasters(user?.role)` but never uses it anywhere in the file — the Add/Edit/active-toggle controls are fully clickable for non-owner (staff) users, and the toggle's failure handler only does `console.error`, with no `showToast` — a staff user who clicks it gets silent, invisible failure. — *Moderate.*
- `AddItemModal.jsx` gates only the MRP field behind `isOwner` — Item Name/Category/Bag Size/Opening Stock have no such check, so a staff user can fully submit an add/edit that then fails at the Firestore rules layer with a generic error toast, rather than being told up front they lack permission. — *Moderate.*
- `Inventory.jsx` has no `canEditMasters`/owner check on "Adjust Stock" at all, for any role — a comparably sensitive write (directly affects the inventory valuation shown on the Dashboard) with zero client-side gating, inconsistent with the MRP gating elsewhere. — *Moderate.*
- `Inventory.jsx:2` imports `updateItem` but never calls it (only `adjustStock` is used) — unused import. — *Minor.*
- (Server-side note: Firestore rules do correctly require `isOwner()` for `items`/`categories` writes, so none of the above is an actual security hole — but the client-side experience is inconsistent enough to produce confusing "did my change save?" moments for staff users.)

### AddCustomerModal.jsx (95 lines) vs AddSupplierModal.jsx (266 lines)
The size gap is mostly legitimate — the supplier modal genuinely does more (edit-mode, dynamic repeatable category rows, phone regex, notes field) than the customer modal, which has none of that. One real redundancy: `AddSupplierModal.jsx` defines the same category-label map twice in the same file (:6-12 and :91-97) — the second could simply be derived from the first via `.reduce()`. — *Minor.*

### SuppliersList.jsx
- `:61-63` filter logic calls `.toLowerCase()` on a possibly-`undefined` `categoryKey` without a full shape guard — low likelihood given how the data is always written, but nothing enforces the shape at the Firestore level. — *Minor.*
- No pagination on the suppliers table (unlike ledgers, which paginate at 20/page) — renders everything client-side; fine today, a scalability gap worth knowing about. — *Minor.*
- No `canEditMasters` check on Add/Edit Supplier at all — this is actually *consistent* with `firestore.rules` (which allows any authenticated user to write suppliers, unlike the owner-only `items`/`categories` rules), but nothing in the code documents that this asymmetry between item masters and supplier masters is intentional. Worth confirming with the product owner rather than assuming it's a bug. — *Minor/Moderate.*

### Dashboard.jsx
- Business-logic derivation (`topStockItems`, `lowStockItemsList`, `weekTotal`, `peakDay`) computed inline on every render, not memoized (inconsistent with `Inventory.jsx`'s `useMemo` for the same kind of grouping) — cheap at current data volume, just inconsistent. Also re-derives "low stock" client-side (:128-129) even though `firebase/dashboard.js`'s `getTodayStats()` already returns `lowStockItems` — redundant computation of the same thing the server already computed. — *Minor.*

### Masters.jsx (35 lines)
Clean, no issues found — noted only that its tab state is plain `useState` with no URL persistence, unlike `Customers.jsx`'s `?action=payment` query-param pattern, so deep-linking/refreshing to the Suppliers tab isn't possible. — *Minor/cosmetic.*

---

## 5. App infrastructure (AppShell, Auth, permissions, Login)

### AuthContext.jsx:12-20 — logout on page refresh, not just tab close
```js
const handleUnload = () => { if (auth.currentUser) { signOut(auth); } };
window.addEventListener('beforeunload', handleUnload);
window.addEventListener('pagehide', handleUnload);
```
Both `beforeunload` and `pagehide` fire on **any** full-page unload — including an F5/refresh — not only on closing the tab. `auth.js`'s `browserSessionPersistence` is already designed to survive a reload and only clear on real tab close; this handler actively works against that, forcing a full re-login on every page refresh (with attendant mid-form data loss). Caveat worth noting for triage: many browsers don't reliably let async work (`signOut` returns a promise) complete inside these unload handlers, so the real-world reproduction rate may be inconsistent rather than 100% — but the intent of the code is clearly broken either way, and it's auth-lifecycle code, so it's worth verifying directly in-browser before dismissing. Also, the identical handler is registered on both events, doubling the effect. — **Moderate** (real, but with an unload-handler-reliability caveat worth confirming empirically).

### permissions.js / ProtectedRoute.jsx — RBAC is enforced, but inconsistently at the UI layer
- Server-side enforcement is solid: `firestore.rules` requires `isOwner()` for `items`/`categories` writes and globally denies all `delete`s — a real backstop, independent of anything client-side.
- `ProtectedRoute.jsx` only checks authentication, never role — there's no route-level gating by role anywhere, so any authenticated user can navigate to `/masters`. This appears to be an intentional design choice (rules are the real backstop) rather than an oversight, but it does mean all RBAC UX is improvised per-component (see the `ItemsList`/`AddItemModal`/`Inventory.jsx` inconsistencies in section 4) rather than centralized. — *Minor/Moderate, structural note.*
- `canDeleteRecords(role)` in `permissions.js:9-12` is unused by any page/component — it exists solely so `authorization.test.js` has something to assert against; the actual "nobody can delete" rule is enforced by never rendering delete UI plus `firestore.rules`. — *Minor* (dead code, not a risk since the real enforcement point is solid).

### AppShell.jsx (387 lines) — doing more than a layout shell should
- **:55-71** — global search/notification data (customers, items, `getTodayStats()`) is fetched inside the shell on every route change (`useEffect` depends on `location.pathname`). `getTodayStats()` itself does multiple full collection reads internally. This means navigating between *any* two pages re-fetches the entire customer list, entire item list, and re-runs the full dashboard aggregation — on top of whatever the destination page fetches on its own. Real, unnecessary Firestore read cost and navigation latency for a header search/bell feature that doesn't need fresh data on every route change. — *Moderate.*
- Roughly 150 of the file's 387 lines are a self-contained global-search feature (debounced state, `useMemo` filtering, dropdown rendering, click-outside handling) that reads domain fields (`c.mobile`, `i.rate`, `i.categoryKey`) directly rather than living in its own `GlobalSearch`/`NotificationBell` component. — *Minor/Moderate* (maintainability, not correctness).
- Fetch errors here are only `console.error`'d, never surfaced via the app-wide `ToastContext` — a failed fetch just makes search/notifications silently behave as if there's no data. — *Minor.*

### Login.jsx
- **:29** — after a successful `signIn()`, both an explicit `navigate('/dashboard')` and the `useEffect` watching `user` (triggered once `AuthContext`'s `onAuthStateChanged` fires) can independently navigate to `/dashboard`. Harmless (React Router coalesces it) but redundant — `AuthContext`'s state is already the actual source of truth. — *Minor/cosmetic.*
- No other structural issues found; Firebase-error-code-to-message mapping is reasonable.

### customerStatus.js
Its private `toDateObject()` is the R2 duplication described in section 1 — not repeated here.

---

## 6. Orphaned files / dead code check

A repo-wide cross-reference of every `.js`/`.jsx` under `src/` against its importers found **no fully orphaned files** — every page, component, and firebase module is imported somewhere. The dead-code items found were narrower: the unused `isOwner` variable in `ItemsList.jsx`, the unused `canDeleteRecords` export (consumed only by its own test), the unused `orderBy` import in `CustomerDetails.jsx`, the unused `updateItem` import in `Inventory.jsx`, and the `getSupplierWisePurchasesReport` dead alias export in `reports.js` — all listed in their respective sections above.

`src/utils/dateIST.js` (shown as untracked/new in `git status`) is, positively, wired into essentially everywhere business-date handling happens — a repo-wide grep for raw `new Date()` in `src/pages/**`/`src/components/**` returned no hits. The exceptions are the handful of firebase-layer functions and `customerStatus.js` called out under R2/R3, which still hand-roll date coercion instead of importing the shared helper.

---

## 7. Summary

### Issue count by severity
| Severity | Count | Notes |
|---|---|---|
| **Critical** | 4 | C1 (unguarded `NaN` payment write), C2 (ledger edit-guard ordering bug), C3 (timezone-dependent monthly sales totals), C4 (5 of 8 test files don't exercise real code) |
| **Moderate** | ~48 | The bulk of the report — mostly duplication with real drift risk (R1–R11), customer/supplier feature-parity gaps, missing/inconsistent guards, and structural size issues in the largest files |
| **Minor / cosmetic** | ~38 | Naming inconsistencies, unused imports, redundant wrappers, style-only divergence |

(Counts are a synthesis across four independent passes and should be read as "roughly this many," not an exact audited total — several findings could reasonably be merged or split depending on how phase 2 scopes the work.)

### Riskiest files to touch in phase 2
Ranked by a combination of size, number of findings, and how much silent-failure risk lives in them:

1. **[src/firebase/sales.js](src/firebase/sales.js)** — contains C3 (timezone bug) and the 280-line `editSale` with duplicated branches; any change here touches stock, ledger, and balance simultaneously across three collections in one transaction. Highest blast radius of any single file.
2. **[src/firebase/ledger.js](src/firebase/ledger.js)** — small (63 lines) but contains C2, a subtle ordering bug in a financial-edit safety check; easy to touch without noticing the tiebreak gap.
3. **[src/firebase/reports.js](src/firebase/reports.js)** (908 lines) — largest data-layer file, heaviest duplication (R1, R6), a dead-but-latent-risk branch, and inconsistent query patterns between its sales-report and purchase-report halves.
4. **[src/pages/ReportResultPage.jsx](src/pages/ReportResultPage.jsx)** (905 lines) — ~650 lines of copy-pasted per-report blocks with an inconsistent unguarded-optional-chaining pattern; a refactor here (e.g. the suggested generic `<ReportTable>`) is high-value but touches every report type at once.
5. **[src/pages/Sales.jsx](src/pages/Sales.jsx)** (826 lines) — the largest page, doing data-fetching + validation + edit-lifecycle + rendering in one component, plus the standalone payment-mode data bug (C-adjacent, "Cheque" vs "Scan").
6. **[src/firebase/customers.js](src/firebase/customers.js)** / **[src/firebase/suppliers.js](src/firebase/suppliers.js)** — contain C1 and are near-duplicates of each other (R10); should likely be refactored together rather than independently, or a fix applied to one will predictably be missed in the other.
7. **[src/components/AppShell.jsx](src/components/AppShell.jsx)** (387 lines) — sits above every page, so its per-navigation over-fetching (section 5) affects perceived performance app-wide; any change here needs to be verified against every route.

### A note on confidence
The four Critical findings (C1–C3) were independently re-read against the source directly (not just trusted from the sub-audits) and confirmed accurate at the cited line numbers. C4's characterization of the test suite was checked by inspecting each file's import list. The Moderate/Minor findings are reported as surfaced by the audit passes; given the volume, a handful may turn out on closer inspection to be intentional design choices (e.g. the supplier vs. item-master permission asymmetry, or suppliers lacking opening balances) rather than defects — those are flagged above as "confirm intent" rather than stated as bugs.

---

*This report is read-only output. No files were modified in the course of this audit. Awaiting review before any changes are made.*
