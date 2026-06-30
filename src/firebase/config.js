

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// (Replace with env variables for security in production)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCXhrlKR3j3jjzFtoQXFBzsmAcux7-NFMA",
    authDomain: "skb-rice-mundy.firebaseapp.com",
    projectId: "skb-rice-mundy",
    storageBucket: "skb-rice-mundy.firebasestorage.app",
    messagingSenderId: "323619879773",
    appId: "1:323619879773:web:7a2e0b34d180dcb23b06b4",
    measurementId: "G-0DGS97W7KC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export auth and db so other files can import them
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
