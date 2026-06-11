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

// دالة رفع الصور لـ Cloudinary
async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "UniRide"); // هذا هو اسم الـ preset الذي أنشأتِه

    // التعديل هنا: استخدمنا اسم الكلاود الحقيقي من الصورة
    const cloudName = "dxdab2cdj"; 

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData
    });

    const data = await response.json();
    
    // فحص النتيجة
    if (!data.secure_url) {
        console.error("خطأ من Cloudinary:", data);
        return null;
    }
    
    return data.secure_url; 
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
        const idCardFile = document.getElementById("idCard").files[0];

        // داخل الـ try الخاصة بـ signupForm
try {
    // 2. إنشاء الحساب
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // --- التعديل هنا ---
    // 3. رفع صورة الكارنيه إلى Cloudinary بدلاً من Firebase Storage
    const imageUrl = await uploadToCloudinary(idCardFile);

    // 4. حفظ البيانات (كما هي، لن نغير فيها شيء!)
    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name,
        nationalId: nationalId,
        email: email,
        role: "student",
        cardImageUrl: imageUrl, // الرابط الجديد وصل هنا
        status: "pending",
        createdAt: new Date()
    });
    // ------------------
    
    alert("تم إنشاء الحساب بنجاح! سيتم مراجعة طلبك من قبل الإدارة، وسيتم إعلامك عبر البريد الإلكتروني بمجرد الموافقة.");
    window.location.href = "../auth/login.html";
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