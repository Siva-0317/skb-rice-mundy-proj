# SKB Rice Mundy — post-fix runbook

Three manual steps remain. They are ordered: **step 1 unblocks the app, step 2
unblocks you, step 3 cleans the data.** Nothing in the app works properly until
step 1 is done.

Firebase project: `skb-rice-mundy-3ca47` (both the `default` and `prod` aliases
in `.firebaserc` point at it — there is only one project, so you cannot deploy
to the wrong place).

---

## Step 1 — Deploy the Firestore security rules

> **Deploy the current `firestore.rules` file, not any version quoted in chat.**
> Deletion stays enabled, per the client's written requirements — the brief
> no-delete experiment has been reverted.

### Why

`firestore.rules` is the file that decides who may write what. The version
currently live on Firebase has two holes that between them block almost every
write in the app:

- `/items/{itemId}` allows `update` **only** for owners. But every sale, every
  purchase, every stock adjustment and the customer-delete cascade all write to
  `items.stock`. So a staff account cannot record a sale at all — the write is
  rejected by the server, not by the UI.
- `/inventory_adjustments/{id}` has **no rule at all**, and Firestore denies by
  default. Every stock adjustment fails.

I rewrote the file to separate *stock movement* from *master-data editing*:
any signed-in user may change `stock` (and only `stock` + `updatedAt`), while
name / price / category / active still require the owner role. I checked every
item write in the codebase (`sales.js` ×3, `purchases.js` ×2, `items.js`
`adjustStock`, `customers.js` delete cascade) — all of them write only those two
fields, so the new rule covers them all without opening anything else.

The old file is preserved as `firestore.rules.bak` if you want to diff it.

### How

`firebase-tools` is not installed on this machine. Either install it globally:

```bash
npm install -g firebase-tools
```

or run it through `npx` without installing (prepend `npx firebase-tools@latest`
in place of `firebase` in every command below).

Then, from the project root:

```bash
cd "~/Downloads/skb-rice-mundy-proj-main 2"

# 1. Sign in. This opens a browser window — sign in as the Google account that
#    owns the Firebase project. You must do this yourself; I can't enter
#    credentials.
firebase login

# 2. Point the CLI at the right project.
firebase use skb-rice-mundy-3ca47

# 3. Deploy ONLY the rules. Nothing else is touched — not hosting, not data.
firebase deploy --only firestore:rules
```

### What you should see

```
=== Deploying to 'skb-rice-mundy-3ca47'...
i  deploying firestore
i  firestore: reading indexes from firestore.indexes.json...
i  cloud.firestore: checking firestore.rules for compilation errors...
+  cloud.firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
+  firestore: released rules firestore.rules to cloud.firestore

+  Deploy complete!
```

The rules are compiled and validated **server-side** and applied atomically — if
there is a syntax error the deploy is rejected whole and the old rules stay
live. There is no half-deployed state to worry about.

### If it fails

- `Error: Failed to get Firebase project ... check permissions` — the Google
  account you logged in with isn't a member of the project. Add it in Firebase
  Console → Project settings → Users and permissions, or log in as the account
  that created it.
- `Compilation error in firestore.rules` — send me the line number, I'll fix it.
- Deploying from a CI box with no browser: `firebase login:ci` gives you a token
  you pass as `--token`.

### Verify

Go to Firebase Console → Firestore Database → **Rules** tab. The editor should
show the new file, and the history dropdown should show a version stamped with
today's date. Then sign in to the app and record a small test sale — it should
save instead of failing silently.

---

## Step 2 — Promote your account to `owner`

### Why

Access control reads `/users/{authUid}.role`. `AuthContext` defaults to
`'staff'` when that document is missing — which is the state your account is in
right now. That's why the sidebar shows **Staff** and why item/category master
edits are refused even after step 1.

I wrote `scripts/set_owner.js` to create or update that document. It is a
merge-write, so it is safe to re-run and won't clobber anything else on the
user doc.

### 2a. Get your Auth UID

Firebase Console → **Authentication** → **Users** tab → find
`santhoshbalamani@gmail.com` → the **User UID** column. It's a 28-character
string like `kJ3nQ8x...`. Copy it.

### 2b. Get a service account key

The script uses the Firebase Admin SDK, which needs a service account key —
this is a privileged credential, so treat it like a password.

Firebase Console → ⚙ **Project settings** → **Service accounts** tab →
**Generate new private key** → confirm. A `.json` file downloads.

Save it as `seed/serviceAccountKey.json` inside the project. `.gitignore`
already excludes that exact path, so it will not be committed — but do not
email it, paste it into a chat, or copy it onto a shared drive.

### 2c. Run the script

```bash
cd "~/Downloads/skb-rice-mundy-proj-main 2"

GOOGLE_APPLICATION_CREDENTIALS=./seed/serviceAccountKey.json \
  node scripts/set_owner.js <paste-your-uid> santhoshbalamani@gmail.com "Santhosh"
```

Expected output:

```
Created /users/kJ3nQ8x... → role: owner
Sign out and back in for the app to pick up the new role.
```

(It says `Updated` instead of `Created` if the document already existed.)

### 2d. Sign out and back in

The role is read once when the auth session is established. **Sign out of the
app and sign back in**, otherwise you'll still be a staff user in the browser
even though Firestore now says otherwise. The sidebar should then read
**Owner**, and Add Item / Edit / Delete become available in Item Masters.

### If it fails

- `Could not initialise firebase-admin` — `GOOGLE_APPLICATION_CREDENTIALS`
  isn't pointing at a readable file. Check the path is relative to where you
  ran the command.
- `7 PERMISSION_DENIED` — the key is from a different project. Re-download it
  from the `skb-rice-mundy-3ca47` console.
- `Cannot find package 'firebase-admin'` — run `npm install` first. I moved
  `firebase-admin` from `dependencies` into `devDependencies` (a privileged
  server SDK had no business being in a browser app's runtime deps), so it is
  still installed locally but no longer ships to users.

---

## Step 3 — Merge the duplicate item records

### Why this is now urgent

Previously `getActiveItems()` silently deduplicated items by name, so the
second and third `Hmt Boiled` records were **dropped from Inventory** — which
is why the dashboard said 8,315 bags and Inventory said 6,031. Dropping stock
to make two screens agree is the wrong fix, so I removed that dedupe. Both
screens now count every active item.

Consequence: the 2,284 bags that used to be invisible are now visible
everywhere. That is correct behaviour, but it means the duplicates are now
showing up as real stock in two places at once until you merge them.

### What's duplicated

| Product | Records | Stock | Category |
|---|---|---|---|
| HMT Boiled | `HMT Boiled` | 4,932 | Boiled Rice |
| | `Hmt Boiled` | 774 | Carshed |
| | `Hmt Boiled` | 1,038 | Godown |
| Broken Boiled | `Broken Boiled` | 472 | Boiled Rice |
| | `Broken Boiled` | 0 | Godown |
| Sona Raw | `Sona Raw` | 260 | — |
| | `Sona Raw` | 0 | *(my test record)* |
| | `sona raw` | 0 | *(my test record)* |

### Decide this first

"Carshed" and "Godown" look like **storage locations**, not product categories.
If those three `Hmt Boiled` records represent the same rice sitting in three
different places, you have two genuinely different options and only you know
which is right:

- **Merge** — one record, 6,744 bags, if you don't need to track stock by
  location. Simple, and it's what the app is designed for.
- **Rename, don't merge** — `HMT Boiled — Mundy` / `HMT Boiled — Carshed` /
  `HMT Boiled — Godown`, if location matters when you're filling an order.
  The records stay separate, the names stop colliding, and everything sums
  correctly. Nothing in the app breaks.

Do **not** leave three records all named `Hmt Boiled`. That is the state that
caused the original problem — in the sale form's item picker they're
indistinguishable, so a bill can be raised against the wrong one. (I added the
category and bag count next to each name in the picker as a stopgap, so they
read `Hmt Boiled · Carshed · 774 bags`, but that's a mitigation, not a fix.)

### If you merge — the procedure

Do this **after** steps 1 and 2, in the app, in this order. Doing it in the
other order leaves you double-counted in between.

1. Inventory → **Adjust Stock** on `HMT Boiled` (Boiled Rice) → set to
   **6,744** (4,932 + 774 + 1,038).
2. Inventory → **Adjust Stock** on `Hmt Boiled` (Carshed) → set to **0**.
3. Inventory → **Adjust Stock** on `Hmt Boiled` (Godown) → set to **0**.
4. Item Masters → toggle both zeroed records **inactive**.

Then `Broken Boiled` (Godown) is already at 0 — just toggle it inactive.

**Deactivate, don't delete, for anything with history.** `deleteItem()` refuses
any item that appears in a sale or purchase and tells you to use the Active
toggle instead, so historic invoices keep resolving to a real item. Inactive
items disappear from the picker and from stock totals but stay intact in
history.

The two zero-stock `Sona Raw` / `sona raw` records are mine, created during
testing. They have no transactions, so plain **Delete** works on them once
you're an owner. Remove both.

### Verify

Dashboard total bags and Inventory total bags should match exactly, and the
combined figure should drop by 2,284 relative to what you see now (the
double-count going away), landing on the true physical stock.

---

## Also worth doing, lower priority

- `node scripts/clean_categories.js` — removes the `test`, `test1`,
  `Sample Rice` and `Credit` categories and de-duplicates the two categories
  both named `Boiled Rice`. Needs a service account key. Read it before running;
  it deletes category documents.
- Delete the supplier `Sample supplier 1` (test data in production) from
  Masters → Suppliers.
- `.env.test` contains a test password in the repo. Rotate it and move it out.
- The production bundle is a single 1.45 MB chunk. Route-level code splitting
  would cut first paint significantly. Not urgent.

## Still untested

Five test cases were blocked by the rules problem and have never been executed
against a working app: recording a sale, recording a purchase, adjusting stock,
creating an item as an owner, and the customer-delete cascade. All five should
pass once step 1 is deployed; none has been proven.

**BUG-23 is still open.** It asks whether deleting a customer really restores
the stock from their sales. `deleteCustomer()` was reordered so the sales and
stock restoration run before the ledger wipe — previously a failure at the
permission-guarded stock step destroyed the statement and left the sales intact.
That path reads correctly and has never been executed. Test it on a throwaway
customer with one small bill before trusting it on a real one.
