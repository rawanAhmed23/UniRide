import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// دالة لحماية الصفحات بناءً على الـ Role المطلوب
export function checkAccess(allowedRole) {
    onAuthStateChanged(auth, async (user) => {
        // 1. لو مش مسجل دخول اصلاً.. ارجع لصفحة اللوجين
        if (!user) {
            window.location.href = "../auth/login.html";
            return;
        }

        try {
            // 2. جلب بيانات الـ Role من الفايرستور
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // 3. لو الـ Role مش متطابق مع المسموح بيه للصفحة دي.. اطرده
                if (userData.role !== allowedRole) {
                    alert("غير مسموح لك بالدخول لهذه الصفحة!");
                    
                    // توجيهه لمكانه الصحيح بدل ما يفتح صفحة مش بتاعته
                    if (userData.role === "admin") window.location.href = "../admin/dashboard.html";
                    else if (userData.role === "driver") window.location.href = "../driver/profile.html";
                    else window.location.href = "../student/book-trip.html";
                }
            } else {
                window.location.href = "../auth/login.html";
            }
        } catch (error) {
            console.error("Auth Guard Error:", error);
        }
    });
}