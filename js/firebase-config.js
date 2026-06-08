// استيراد الدوال من الـ CDN لتشتغل مباشرة في المتصفح
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// بيانات مشروعك الفعلي UniRide
export const firebaseConfig = {
  apiKey: "AIzaSyCsY2MeeGeZWrYfKlVGyW0yqq9j8kHmfh8",
  authDomain: "uniride-7131e.firebaseapp.com",
  projectId: "uniride-7131e",
  storageBucket: "uniride-7131e.firebasestorage.app",
  messagingSenderId: "467989943720",
  appId: "1:467989943720:web:69eeb20aa0ea73237f799d",
  measurementId: "G-VJ0ZHZN1Z5"
};

// تهيئة الفايربيز
const app = initializeApp(firebaseConfig);

// تصدير الخدمات للاستخدام في باقي الملفات
export const auth = getAuth(app);
export const db = getFirestore(app);