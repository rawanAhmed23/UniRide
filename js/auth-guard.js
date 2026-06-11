import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// دالة لحماية الصفحات بناءً على الـ Role المطلوب والحالة (للطلاب)
export function checkAccess(allowedRole) {
    onAuthStateChanged(auth, async (user) => {
        // 1. لو مش مسجل دخول اصلاً.. ارجع لصفحة اللوجين
        if (!user) {
            window.location.href = "../auth/login.html";
            return;
        }

        try {
            // 2. جلب بيانات المستخدم من الفايرستور
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (!userDoc.exists()) {
                window.location.href = "../auth/login.html";
                return;
            }

            const userData = userDoc.data();
            const currentPath = window.location.pathname;

            // 3. التحقق من تطابق الـ Role (نفس اللوجيك القديم)
            if (userData.role !== allowedRole) {
                alert("عذراً، غير مسموح لك بالدخول لهذه الصفحة!");
                
                if (userData.role === "admin") window.location.href = "../admin/dashboard.html";
                else if (userData.role === "driver") window.location.href = "../driver/profile.html";
                else window.location.href = "../student/book-trip.html";
                return; // إنهاء التنفيذ هنا
            }

            // 4. الجديد: التحقق من الحالة (Status) للطلاب فقط
            // إذا كان الطالب دوره "student" وحالته ليست "approved"
            if (userData.role === "student" && userData.status !== "approved") {
                // التأكد أنه ليس موجوداً بالفعل في صفحة الانتظار لتجنب إعادة التوجيه اللانهائي
                if (!currentPath.includes("pending.html")) {
                    window.location.href = "../auth/pending.html";
                }
                return; // التوقف هنا وعدم السماح بالوصول للصفحة
            }

        } catch (error) {
            console.error("Auth Guard Error:", error);
            // في حال حدوث خطأ، يفضل تسجيل خروج المستخدم أو توجيهه لل login
            window.location.href = "../auth/login.html";
        }
    });
}