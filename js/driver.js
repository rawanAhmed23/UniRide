import { db, auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, where, onSnapshot, updateDoc, increment, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { checkAccess } from "../js/auth-guard.js";

// حماية الصفحة
checkAccess("driver");

// متغيرات عامة
let currentDriverUid = null;
let unsubscribeUser = null;
let unsubscribeBookings = null;
let currentUpdateData = { licenseName: "", dbFieldKey: "", driverId: "" };

// ==========================================
// 1. تشغيل البيانات الأساسية (Real-time Listener)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentDriverUid = user.uid;
        if (unsubscribeUser) unsubscribeUser();

        unsubscribeUser = onSnapshot(doc(db, "users", user.uid), (userDoc) => {
            if (userDoc.exists()) {
                const driverData = userDoc.data();
                
                // تنظيف التنبيهات
                const alertContainer = document.getElementById("alertContainer");
                if (alertContainer) alertContainer.innerHTML = "";

                // تحديث بيانات التواريخ في الصفحة
                if(document.getElementById("infoDriverLicense")) document.getElementById("infoDriverLicense").textContent = driverData.driverLicenseExpiry || "---";
                if(document.getElementById("infoCarLicense")) document.getElementById("infoCarLicense").textContent = driverData.carLicenseExpiry || "---";
                
                renderProfileData(driverData);
                renderScheduleData(driverData);
                
                checkLicenseExpiry(driverData.driverLicenseExpiry, "القيادة", user.uid, "driverLicenseExpiry");
                checkLicenseExpiry(driverData.carLicenseExpiry, "السيارة", user.uid, "carLicenseExpiry");
            }
        });
    } else {
        if (unsubscribeUser) { unsubscribeUser(); unsubscribeUser = null; }
        if (unsubscribeBookings) { unsubscribeBookings(); unsubscribeBookings = null; }
    }
});

// ==========================================
// 2. الدوال الأساسية (Profile & Schedule)
// ==========================================
function renderProfileData(data) {
    if (!document.getElementById("profileDriverName")) return;
    
    document.getElementById("profileDriverName").textContent = data.name || "سائق غير معرف";
    if(document.getElementById("profileDriverEmail")) document.getElementById("profileDriverEmail").textContent = data.email || "---";
    if(document.getElementById("infoNationalId")) document.getElementById("infoNationalId").textContent = data.nationalId || "---";
    if(document.getElementById("infoSalary")) document.getElementById("infoSalary").textContent = (data.baseSalary || 0) + " ج.م";
    if(document.getElementById("infoPlate")) document.getElementById("infoPlate").textContent = data.plateNumber || "---";
    if(document.getElementById("infoTripsCount")) document.getElementById("infoTripsCount").textContent = (data.monthlyTripsCount || 0) + " رحلة";
    
    const avatar = document.getElementById("driverAvatar");
    if (avatar && data.name) {
        avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=198754&color=fff&size=100`;
    }
}

function updateEndTripButtonStatus(activeBookingsCount) {
    const endTripBtn = document.getElementById("endTripBtn");
    if (!endTripBtn) return;
    if (activeBookingsCount === 0) {
        endTripBtn.disabled = true;
        endTripBtn.classList.remove("btn-danger");
        endTripBtn.classList.add("btn-secondary", "opacity-50");
    } else {
        endTripBtn.disabled = false;
        endTripBtn.classList.remove("btn-secondary", "opacity-50");
        endTripBtn.classList.add("btn-danger");
    }
}

async function renderScheduleData(driverData) {
    const studentsTableBody = document.getElementById("studentsTableBody");
    if (!studentsTableBody) return; 

    const assignedDest = driverData.assignedDestination || "";
    if(document.getElementById("driverRoute")) document.getElementById("driverRoute").textContent = assignedDest || "لم يتم تعيين خط سير";
    if(document.getElementById("carInfo")) document.getElementById("carInfo").textContent = `سيارة ${driverData.carType || 'ملاكي'} - موديل ${driverData.carModel || '---'}`;
    if(document.getElementById("maxCapacity")) document.getElementById("maxCapacity").textContent = `من أصل ${driverData.maxPassengers || 4} كراسي متاحين`;

    if (!assignedDest) {
        studentsTableBody.innerHTML = `<tr><td colspan="4" class="text-danger">لا يوجد خط سير معين.</td></tr>`;
        updateEndTripButtonStatus(0);
        return;
    }

    try {
        const destSnapshot = await getDocs(collection(db, "destinations"));
        let routeTimes = "غير محددة";
        destSnapshot.forEach((docSnap) => {
            if (docSnap.data().name === assignedDest) routeTimes = docSnap.data().times || "طوال اليوم";
        });
        if(document.getElementById("routeTimes")) document.getElementById("routeTimes").textContent = routeTimes;

        const bookingsQuery = query(collection(db, "bookings"), where("driverId", "==", currentDriverUid), where("status", "==", "نشط"));

        if (unsubscribeBookings) unsubscribeBookings();

        unsubscribeBookings = onSnapshot(bookingsQuery, async (snapshot) => {
            studentsTableBody.innerHTML = "";
            let studentsCount = 0;

            if (snapshot.empty) {
                studentsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted text-center">لا يوجد حجوزات نشطة.</td></tr>`;
                updateEndTripButtonStatus(0);
                return;
            }

            // [منطق الجدول الخاص بك - تأكد من إدراج الكود الخاص بـ map هنا]
            updateEndTripButtonStatus(snapshot.size);
        });
    } catch (error) { console.error("Error loading schedule:", error); }
}

// ==========================================
// 3. التنبيهات و Modal التجديد
// ==========================================
function convertToDate(dateInput) {
    if (!dateInput) return null;
    if (typeof dateInput.toDate === 'function') return dateInput.toDate(); 
    return new Date(dateInput); 
}

function checkLicenseExpiry(expiryDateInput, licenseName, driverId, dbFieldKey) {
    const expiryDate = convertToDate(expiryDateInput);
    if (!expiryDate) return;
    const daysLeft = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    const alertContainer = document.getElementById("alertContainer");
    if (!alertContainer) return;

    if (daysLeft <= 5 && daysLeft >= 0) {
        const alertDiv = document.createElement("div");
        alertDiv.className = "alert alert-danger d-flex justify-content-between align-items-center shadow-sm mb-3";
        alertDiv.innerHTML = `<div><strong>تحذير!</strong> رخصة ${licenseName} تنتهي خلال ${daysLeft} يوم.</div>
            <button class="btn btn-success btn-sm renew-btn" data-name="${licenseName}" data-key="${dbFieldKey}" data-id="${driverId}">تم التجديد</button>`;
        alertContainer.appendChild(alertDiv);
    }
}

// ==========================================
// 4. المستمعات العالمية (Global Listeners)
// ==========================================
document.addEventListener("click", async (e) => {
    // زر الدفع
    const payBtn = e.target.closest(".approve-payment-btn");
    if (payBtn) {
        const id = payBtn.getAttribute("data-id");
        payBtn.disabled = true;
        await updateDoc(doc(db, "bookings", id), { paymentStatus: "مدفوع" });
    }

    // فتح الـ Modal لتجديد الرخصة
    if (e.target.classList.contains("renew-btn")) {
        currentUpdateData.licenseName = e.target.getAttribute("data-name");
        currentUpdateData.dbFieldKey = e.target.getAttribute("data-key");
        currentUpdateData.driverId = e.target.getAttribute("data-id");
        document.getElementById("modalTitle").textContent = `تجديد رخصة ${currentUpdateData.licenseName}`;
        new bootstrap.Modal(document.getElementById('licenseModal')).show();
    }
});

// زر حفظ الـ Modal
const saveDateBtn = document.getElementById("saveDateBtn");
if (saveDateBtn) {
    saveDateBtn.addEventListener("click", async () => {
        const val = document.getElementById("newDateInput").value;
        if (!val) return alert("اختر تاريخاً!");
        await updateDoc(doc(db, "users", currentUpdateData.driverId), { [currentUpdateData.dbFieldKey]: val });
        bootstrap.Modal.getInstance(document.getElementById('licenseModal')).hide();
        alert("تم التحديث!");
    });
}

// زر تسجيل الخروج
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (confirm("هل تريد تسجيل الخروج؟")) signOut(auth).then(() => window.location.href = "../auth/login.html");
    });
}

// زر إنهاء الرحلة
const endTripBtn = document.getElementById("endTripBtn");
if (endTripBtn) {
    endTripBtn.addEventListener("click", async () => {
        if (!currentDriverUid || endTripBtn.disabled) return;
        if (confirm("هل تريد إنهاء الرحلة وأرشفة البيانات؟")) {
            endTripBtn.disabled = true;
            try {
                const snapshot = await getDocs(query(collection(db, "bookings"), where("driverId", "==", currentDriverUid), where("status", "==", "نشط")));
                const batch = writeBatch(db);
                snapshot.forEach(d => batch.update(doc(db, "bookings", d.id), { status: "منتهية" }));
                batch.update(doc(db, "users", currentDriverUid), { monthlyTripsCount: increment(1) });
                await batch.commit();
                window.location.href = "profile.html";
            } catch (err) { alert("فشل: " + err.message); endTripBtn.disabled = false; }
        }
    });
}