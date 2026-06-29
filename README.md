# SKB Rice Mundy

SKB Rice Mundy is a robust, custom-built internal management ledger for the SKB Rice business. Designed with a clean, modern interface, it streamlines daily operations by tracking item masters (inventory items), recording customer sales, managing supplier purchases, and maintaining real-time, transaction-based ledgers. With built-in low-stock alerts, a comprehensive business dashboard, and role-based access control, the system ensures complete visibility and accurate bookkeeping for all rice inventory and financial balances.

## Setup Instructions

### 1. Environment Configuration
To run this project locally, you must first connect it to your Firebase instance. 
Create a new file named `.env` in the root directory (alongside this README) and add your Firebase configuration variables as follows:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 2. Running Locally
Ensure you have Node.js installed, then install dependencies and start the development server:

```bash
npm install
npm run dev
```

### 3. Deployment
This application is designed to be hosted on Firebase Hosting. To deploy the latest production build:

```bash
# 1. Login to Firebase CLI (if not already logged in)
firebase login

# 2. Build the production bundle
npm run build

# 3. Deploy to Firebase Hosting
firebase deploy
```

> **Note**: For security, Firestore Rules are strictly configured. Master data editing is locked to accounts where the corresponding `/users/{uid}` document has `role: "owner"`. Furthermore, delete operations are completely disabled at the database level to preserve strict audit trails. All ledger corrections should be made via compensating entries (e.g. adding a payment or reverse transaction).
