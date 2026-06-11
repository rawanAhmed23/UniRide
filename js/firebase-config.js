// استيراد الدوال من الـ CDN لتشتغل مباشرة في المتصفح
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// إضافة استيراد الـ storage
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// بيانات مشروعك الفعلي UniRide
export const firebaseConfig = {
  apiKey: "AIzaSyCK2GBc16jtaJWhvoCoR9kiu-Bn-XhqITs",
  authDomain: "uniride-4549d.firebaseapp.com",
  projectId: "uniride-4549d",
  storageBucket: "uniride-4549d.firebasestorage.app",
  messagingSenderId: "1054843810514",
  appId: "1:1054843810514:web:4223a69c6d123dadb4b30b",
  measurementId: "G-DRN937EWB3"
};

// تهيئة الفايربيز
const app = initializeApp(firebaseConfig);

// تصدير الخدمات للاستخدام في باقي الملفات
export const auth = getAuth(app);
export const db = getFirestore(app);
// تصدير الـ storage ليصبح متاحاً للاستخدام
export const storage = getStorage(app);