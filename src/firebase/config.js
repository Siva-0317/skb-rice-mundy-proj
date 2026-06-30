// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCXhrlKR3j3jjzFtoQXFBzsmAcux7-NFMA",
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