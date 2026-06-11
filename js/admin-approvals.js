import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const requestsList = document.getElementById("requestsList");

// 1. دالة لجلب الطلبات المعلقة وعرضها
async function loadPendingRequests() {
    try {
        const q = query(collection(db, "users"), where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);

        requestsList.innerHTML = ""; // تفريغ القائمة قبل التحميل

        if (querySnapshot.empty) {
            requestsList.innerHTML = `<div class="col-12 text-center text-muted">لا توجد طلبات تسجيل معلقة حالياً.</div>`;
            return;
        }

        querySnapshot.forEach((doc) => {
            const user = doc.data();
            const card = document.createElement("div");
            card.className = "col-md-4";
            card.innerHTML = `
                <div class="card shadow-sm h-100">
                    <img src="${user.cardImageUrl}" class="card-img-top" alt="كارنيه" style="height: 200px; object-fit: cover;">
                    <div class="card-body">
                        <h5 class="card-title fw-bold">${user.name}</h5>
                        <p class="card-text small text-muted">الرقم القومي: ${user.nationalId}</p>
                        <p class="card-text small text-muted">البريد: ${user.email}</p>
                        <div class="d-grid gap-2">
                            <button class="btn btn-success approve-btn" data-id="${doc.id}">قبول الطالب</button>
                            <button class="btn btn-danger reject-btn" data-id="${doc.id}">رفض الطلب</button>
                        </div>
                    </div>
                </div>
            `;
            requestsList.appendChild(card);
        });
    } catch (error) {
        console.error("خطأ أثناء جلب البيانات:", error);
        requestsList.innerHTML = `<div class="alert alert-danger">حدث خطأ أثناء تحميل البيانات.</div>`;
    }
}

// 2. دالة تحديث الحالة (قبول أو رفض)
async function updateStudentStatus(uid, newStatus) {
    try {
        await updateDoc(doc(db, "users", uid), {
            status: newStatus
        });
        alert(`تم ${newStatus === 'approved' ? 'قبول' : 'رفض'} الطالب بنجاح!`);
        loadPendingRequests(); // إعادة تحميل القائمة لتحديث الواجهة
    } catch (error) {
        console.error("خطأ أثناء التحديث:", error);
        alert("حدث خطأ، يرجى المحاولة لاحقاً.");
    }
}

// 3. مستمع للأحداث (Event Delegation) للتعامل مع الأزرار
requestsList.addEventListener("click", (e) => {
    if (e.target.classList.contains("approve-btn")) {
        const uid = e.target.getAttribute("data-id");
        updateStudentStatus(uid, "approved");
    } else if (e.target.classList.contains("reject-btn")) {
        const uid = e.target.getAttribute("data-id");
        updateStudentStatus(uid, "rejected");
    }
});

// تشغيل الدالة عند فتح الصفحة
document.addEventListener("DOMContentLoaded", loadPendingRequests);