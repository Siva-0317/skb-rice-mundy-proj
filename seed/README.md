# SKB Rice Mundy Master Data Seed Script

An idempotent seed script to populate master categories and items in Firestore.

## Instructions

1. Get `serviceAccountKey.json` from Firebase Console → Project Settings → Service Accounts → Generate new private key, save it in this folder.
2. Put your `items.csv` in this folder (must contain headers: `name, categoryKey, bagKg, rate, mrp, stock`).
3. Run `node seed.js`.
