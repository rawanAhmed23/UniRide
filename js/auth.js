import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { setDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// عناصر الصفحات من الـ DOM
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const errorDiv = document.getElementById("errorMessage");

// دالة مساعدة لإظهار أخطاء الفايربيز للمستخدِم بشكل واضح
function showError(message) {
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove("d-none");
    }
}

// ==========================================
// 1. لوجيك إنشاء حساب جديد (خاص بالطلاب فقط)
// ==========================================
if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorDiv.classList.add("d-none"); // إعادة إخفاء رسالة الخطأ القديمة

        const name = document.getElementById("fullName").value;
        const nationalId = document.getElementById("nationalId").value;
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        try {
            // إنشاء الحساب في قسم الـ Authentication الخاص بفايربيز
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // حفظ باقي البيانات الشخصية وتحديد الـ Role كـ student داخل الـ Firestore database
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                name: name,
                nationalId: nationalId,
                email: email,
                role: "student",
                createdAt: new Date()
            });

            // تحويل الطالب فوراً لصفحة حجز الرحلات الخاصة به
            window.location.href = "../student/book-trip.html";

        } catch (error) {
            console.error(error);
            if (error.code === "auth/email-already-in-use") {
                showError("هذا البريد الإلكتروني مسجل بالفعل.");
            } else {
                showError("حدث خطأ أثناء التسجيل: " + error.message);
            }
        }
    });
}

// ==========================================
// 2. لوجيك تسجيل الدخول الموحد (لكل الأدوار)
// ==========================================
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorDiv.classList.add("d-none");

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        try {
            // تسجيل الدخول بالبريد والباسورد في الـ Auth
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // جلب مستند المستخدم من الـ Firestore لمعرفة الـ Role المسموح له
            const userDoc = await getDoc(doc(db, "users", user.uid));

            if (userDoc.exists()) {
                const userData = userDoc.data();
                const role = userData.role;

                // التوجيه التلقائي الذكي بناءً على صلاحيات الحساب (Role-based Routing)
                if (role === "admin") {
                    window.location.href = "../admin/dashboard.html";
                } else if (role === "student") {
                    window.location.href = "../student/book-trip.html";
                } else if (role === "driver") {
                    window.location.href = "../driver/profile.html";
                } else {
                    showError("نوع الحساب غير معرف داخل المنصة.");
                }
            } else {
                showError("لم يتم العثور على بيانات إضافية لهذا الحساب.");
            }

        } catch (error) {
            console.error(error);
            showError("فشل تسجيل الدخول: تأكد من صحة البريد الإلكتروني وكلمة المرور.");
        }
    });
}