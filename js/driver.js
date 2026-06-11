import { db, auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// تم إضافة writeBatch هنا لتحديث حجوزات الطلاب دفعة واحدة مع عداد السائق
import { doc, getDoc, collection, getDocs, query, where, onSnapshot, updateDoc, increment, writeBatch, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { checkAccess } from "../js/auth-guard.js";

// حماية الصفحة: التأكد أن المستخدم سائق (Driver)
checkAccess("driver");

let currentDriverUid = null;     // متغير عالمي لحفظ معرف السائق الحالي
let unsubscribeUser = null;     // 👈 متغير عالمي لإلغاء استماع بيانات السائق عند الحاجة
let unsubscribeBookings = null; // 👈 متغير عالمي لإلغاء استماع الحجوزات ومنع تكرار الأسطر في الجدول

// تشغيل جلب البيانات بمجرد التأكد من جلسة الـ Auth
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentDriverUid = user.uid; // حفظ الـ UID عالمياً

        // إذا كان هناك استماع قديم نشط، نقوم بإلغائه منعاً لتداخل البيانات
        if (unsubscribeUser) unsubscribeUser();

        try {
            // 🔄 1. تحويل جلب البيانات من getDoc إلى الاستماع اللحظي المستمر onSnapshot
            unsubscribeUser = onSnapshot(doc(db, "users", user.uid), (userDoc) => {
                if (userDoc.exists()) {
                    const driverData = userDoc.data();
                    const driverId = user.uid;

                    // 🔔 تفريغ حاوية التنبيهات القديمة أولاً قبل الفحص الجديد حتى لا تتكرر الأشرطة في الشاشة
                    const alertContainer = document.getElementById("alertContainer");
                    if (alertContainer) alertContainer.innerHTML = "";

                    // تأمين العرض المبدئي للتواريخ لو العناصر موجودة
                    if (document.getElementById("infoDriverLicense")) document.getElementById("infoDriverLicense").textContent = driverData.driverLicenseExpiry || "---";
                    if (document.getElementById("infoCarLicense")) document.getElementById("infoCarLicense").textContent = driverData.carLicenseExpiry || "---";

                    // تشغيل دوال التوزيع حسب عناصر الصفحة الحالية (ستعمل تلقائياً فور حدوث أي تغيير)
                    renderProfileData(driverData);
                    renderScheduleData(driverData);

                    // ابحث عن هذا الجزء داخل onAuthStateChanged وقم بتعديله:
                    checkLicenseExpiry(driverData.driverLicenseExpiry, "القيادة", user.uid, "driverLicenseExpiry", driverData.name);
                    checkLicenseExpiry(driverData.carLicenseExpiry, "السيارة", user.uid, "carLicenseExpiry", driverData.name);
                } else {
                    console.error("لم يتم العثور على حساب السائق في قاعدة البيانات.");
                }
            }, (error) => {
                console.error("حدث خطأ أثناء الاستماع لبيانات السائق الحية:", error);
            });

        } catch (error) {
            console.error("Error loading driver dashboard:", error);
        }
    } else {
        // لو سجل خروج نلغي كل الاستماعات اللحظية لتوفير كوتا الفايربيس والحفاظ على الأداء
        if (unsubscribeUser) { unsubscribeUser(); unsubscribeUser = null; }
        if (unsubscribeBookings) { unsubscribeBookings(); unsubscribeBookings = null; }
    }
});

// ==========================================
// دالة عرض بيانات البروفايل (profile.html)
// ==========================================
function renderProfileData(data) {
    if (!document.getElementById("profileDriverName")) return; // تأمين لو مش في صفحة البروفايل

    document.getElementById("profileDriverName").textContent = data.name || "سائق غير معرف";
    document.getElementById("profileDriverEmail").textContent = data.email || "---";
    document.getElementById("infoNationalId").textContent = data.nationalId || "---";
    document.getElementById("infoSalary").textContent = (data.baseSalary || 0) + " ج.م";
    document.getElementById("infoPlate").textContent = data.plateNumber || "---";
    document.getElementById("infoTripsCount").textContent = (data.monthlyTripsCount || 0) + " رحلة";
    document.getElementById("infoDriverLicense").textContent = data.driverLicenseExpiry || "---";
    document.getElementById("infoCarLicense").textContent = data.carLicenseExpiry || "---";

    // تعديل الصورة الرمزية بالاسم تلقائياً
    if (data.name) {
        document.getElementById("driverAvatar").src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=198754&color=fff&size=100`;
    }
}

// ==========================================================
// 🛡️ دالة تأمين وإدارة تفعيل زر "إنهاء الرحلة الحالية"
// ==========================================================
function updateEndTripButtonStatus(activeBookingsCount) {
    const endTripBtn = document.getElementById("endTripBtn");
    if (!endTripBtn) return;

    if (activeBookingsCount === 0) {
        // تعطيل الزرار برمجياً وشكلياً لعدم وجود ركاب
        endTripBtn.disabled = true;
        endTripBtn.classList.remove("btn-danger");
        endTripBtn.classList.add("btn-secondary", "opacity-50");
        endTripBtn.style.cursor = "not-allowed";
    } else {
        // تفعيل الزرار فور حجز أي طالب للرحلة
        endTripBtn.disabled = false;
        endTripBtn.classList.remove("btn-secondary", "opacity-50");
        endTripBtn.classList.add("btn-danger");
        endTripBtn.style.cursor = "pointer";
    }
}

// ==========================================
// دالة عرض جدول المواعيد وحساب الركاب (schedule.html)
// ==========================================
async function renderScheduleData(driverData) {
    const studentsTableBody = document.getElementById("studentsTableBody");
    if (!studentsTableBody) return; // تأمين لو مش في صفحة الجدول

    const assignedDest = driverData.assignedDestination || "";

    document.getElementById("driverRoute").textContent = assignedDest || "لم يتم تعيين خط سير بعد";
    document.getElementById("carInfo").textContent = `سيارة ${driverData.carType || 'ملاكي'} - موديل ${driverData.carModel || '---'}`;
    document.getElementById("maxCapacity").textContent = `من أصل ${driverData.maxPassengers || 4} كراسي متاحين`;

    if (!assignedDest) {
        studentsTableBody.innerHTML = `<tr><td colspan="4" class="text-danger">لا يوجد خط سير معين لك حالياً لعرض الطلاب.</td></tr>`;
        updateEndTripButtonStatus(0); // تعطيل الزرار في غياب خط السير
        return;
    }

    try {
        // جلب مواعيد التحرك الثابتة للخط بالكامل من الأدمن
        const destSnapshot = await getDocs(collection(db, "destinations"));
        let routeTimes = "غير محددة";
        destSnapshot.forEach((docSnap) => {
            if (docSnap.data().name === assignedDest) {
                routeTimes = docSnap.data().times || "طوال اليوم";
            }
        });
        document.getElementById("routeTimes").textContent = routeTimes;

        // =========================================================================
        // 🔍 التحديث الذكي للحجوزات
        // =========================================================================
        const bookingsQuery = query(
            collection(db, "bookings"),
            where("driverId", "==", currentDriverUid),
            where("status", "==", "نشط")
        );

        // 🌟 خطوة احترافية: إلغاء الاستماع القديم للحجوزات قبل فتح واحد جديد لمنع تكرار البيانات والأسطر في الجدول
        if (unsubscribeBookings) unsubscribeBookings();

        unsubscribeBookings = onSnapshot(bookingsQuery, async (snapshot) => {
            studentsTableBody.innerHTML = "";
            let studentsCount = 0;

            if (snapshot.empty) {
                studentsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-3">لا يوجد حجوزات نشطة في جدولك الحالي.</td></tr>`;
                document.getElementById("bookedStudentsCount").textContent = "0";

                // 🌟 استدعاء دالة تحديث الزرار (الحالة 0 ركاب -> معطل)
                updateEndTripButtonStatus(0);
                return;
            }

            // جلب معالجة أسماء الطلاب الحقيقية
            const bookingPromises = snapshot.docs.map(async (docSnap) => {
                const booking = docSnap.data();
                const bookingId = docSnap.id;

                let studentRealName = booking.studentName || "";

                if (!studentRealName && booking.studentUid) {
                    try {
                        const studentUserDoc = await getDoc(doc(db, "users", booking.studentUid));
                        if (studentUserDoc.exists()) {
                            studentRealName = studentUserDoc.data().name || "طالب مشترك";
                        }
                    } catch (fetchErr) {
                        console.error("Error fetching student name:", fetchErr);
                    }
                }

                if (!studentRealName) studentRealName = "طالب مشترك";

                return {
                    id: bookingId,
                    data: booking,
                    resolvedName: studentRealName
                };
            });

            const resolvedBookings = await Promise.all(bookingPromises);

            resolvedBookings.forEach((item) => {
                const booking = item.data;
                const bookingId = item.id;
                const studentName = item.resolvedName;
                studentsCount++;

                let bookingTimeDisplay = "";
                const type = booking.tripType || "ذهاب";
                const go = booking.goTime || "";
                const ret = booking.returnTime || "";

                if (type === "ذهاب") {
                    bookingTimeDisplay = `الذهاب: ${go || 'غير محدد'}`;
                } else if (type === "عودة") {
                    bookingTimeDisplay = `العودة: ${ret || 'غير محدد'}`;
                } else if (type === "ذهاب وعودة") {
                    bookingTimeDisplay = `الذهاب: ${go} | العودة: ${ret}`;
                } else {
                    bookingTimeDisplay = go || ret || "غير محدد";
                }

                const currentPayment = booking.paymentStatus || "لم يدفع";
                let paymentCellHTML = "";

                if (currentPayment === "مدفوع") {
                    paymentCellHTML = `<span class="badge bg-success py-2 px-3"><i class="fa-solid fa-circle-check"></i> مدفوع كاش</span>`;
                } else {
                    paymentCellHTML = `
                        <button class="btn btn-sm btn-success py-1 px-2 approve-payment-btn" data-id="${bookingId}">
                            <i class="fa-solid fa-money-bill-wave me-1"></i> استلمت الكاش
                        </button>
                    `;
                }

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="fw-bold">${studentName}</td>
                    <td><span class="badge bg-light text-dark border"><i class="fa-regular fa-clock me-1 text-primary"></i> ${bookingTimeDisplay}</span></td>
                    <td><span class="badge bg-secondary">${type}</span></td>
                    <td class="text-center">${paymentCellHTML}</td>
                `;
                studentsTableBody.appendChild(tr);
            });

            document.getElementById("bookedStudentsCount").textContent = studentsCount;

            // 🌟 استدعاء دالة تحديث الزرار وتمرير عدد الطلاب الفعلي (إذا كان > 0 سيتم تفعيله تلقائياً)
            updateEndTripButtonStatus(studentsCount);

        }, (error) => {
            console.error("حدث خطأ أثناء الاستماع للحجوزات اللحظية:", error);
        });

    } catch (error) {
        console.error("Error loading schedule bookings:", error);
        studentsTableBody.innerHTML = `<tr><td colspan="4" class="text-danger">حدث خطأ أثناء جلب قائمة الحجوزات.</td></tr>`;
    }
}


const studentsTableBodyElement = document.getElementById("studentsTableBody");
if (studentsTableBodyElement) {
    studentsTableBodyElement.addEventListener("click", async (e) => {
        const button = e.target.closest(".approve-payment-btn");
        if (button) {
            const bookingId = button.getAttribute("data-id");

            button.disabled = true;
            button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التأكيد...`;

            try {
                const bookingRef = doc(db, "bookings", bookingId);
                await updateDoc(bookingRef, {
                    paymentStatus: "مدفوع"
                });
            } catch (err) {
                console.error("فشل تحديث حالة الدفع المالي:", err);
                alert("حدث خطأ أثناء الاتصال بالقاعدة، يرجى المحاولة مرة أخرى.");
                button.disabled = false;
                button.innerHTML = `<i class="fa-solid fa-money-bill-wave me-1"></i> استلمت الكاش`;
            }
        }
    });
}

// ==========================================
// لوجيك زر تسجيل الخروج الموحد
// ==========================================
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (confirm("هل تريد تسجيل الخروج؟")) {
            signOut(auth).then(() => {
                window.location.href = "../auth/login.html";
            }).catch((err) => console.error(err));
        }
    });
}

// =========================================================================
// 🚨 اللوجيك المحدث لزر إنهاء الرحلة: تصفير جدول السائق ونقل الطلاب للأرشيف
// =========================================================================
const endTripBtn = document.getElementById("endTripBtn");
if (endTripBtn) {
    endTripBtn.addEventListener("click", async (e) => {
        if (!currentDriverUid) return;

        // 🛡️ حماية إضافية: لو الزر معطل برمجياً نمنع تماماً استكمال الكود
        if (endTripBtn.disabled) {
            e.preventDefault();
            return;
        }

        const isConfirmed = confirm("هل وصلت بالفعل للوجهة؟ \nعند تأكيد إنهاء الرحلة سيتم: \n1. نقل جميع حجوزات الطلاب الحالية إلى الأرشيف (منتهية).\n2. تصفير كراسي سيارتك لرحلة جديدة.\n3. زيادة إجمالي عدد رحلاتك بمقدار رحلة.");
        if (!isConfirmed) return;

        try {
            endTripBtn.disabled = true;
            endTripBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> جاري أرشفة الرحلة وتصفير الجدول...`;

            const activeBookingsQuery = query(
                collection(db, "bookings"),
                where("driverId", "==", currentDriverUid),
                where("status", "==", "نشط")
            );
            const querySnapshot = await getDocs(activeBookingsQuery);

            const batch = writeBatch(db);

            querySnapshot.forEach((docSnap) => {
                const bookingDocRef = doc(db, "bookings", docSnap.id);
                batch.update(bookingDocRef, { status: "منتهية" });
            });

            const driverRef = doc(db, "users", currentDriverUid);
            batch.update(driverRef, {
                monthlyTripsCount: increment(1)
            });

            await batch.commit();

            alert("تم إنهاء الرحلة بنجاح وتفريغ مقاعد الحافلة لرحلتك القادمة! 🎉");
            window.location.href = "profile.html";

        } catch (err) {
            console.error("خطأ أثناء معالجة إنهاء الرحلة وأرشفة البيانات:", err);
            alert("فشل إنهاء الرحلة: " + err.message);
            endTripBtn.disabled = false;
            endTripBtn.innerHTML = "إنهـاء الرحلـة الحاليـة";
        }
    });
}

// دالة مساعدة لتحويل التاريخ (سواء كان String أو Firebase Timestamp) إلى Date Object
function convertToDate(dateInput) {
    if (!dateInput) return null;
    if (typeof dateInput.toDate === 'function') {
        return dateInput.toDate();
    }
    return new Date(dateInput);
}

// --- تعريف الـ Modal خارج الدوال للوصول إليه في أي وقت ---
let licenseModal;
let currentRenewalData = {}; // لحفظ بيانات العملية المؤقتة

// التأكد من تهيئة الـ Modal عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    licenseModal = new bootstrap.Modal(document.getElementById('licenseModal'));
});

// ==========================================
// دالة الفحص (تم تعديلها لاستقبال اسم السائق)
// ==========================================
function checkLicenseExpiry(expiryDateInput, licenseName, driverId, dbFieldKey, driverName) {
    const expiryDate = convertToDate(expiryDateInput);
    if (!expiryDate) return;

    const today = new Date();
    const timeDiff = expiryDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));

    const alertContainer = document.getElementById("alertContainer");
    if (!alertContainer) return;

    if (daysLeft <= 5 && daysLeft >= 0) {
        const alertDiv = document.createElement("div");
        alertDiv.className = "alert alert-danger d-flex flex-column flex-md-row justify-content-between align-items-md-center shadow-sm mb-3 text-end";
        alertDiv.style.direction = "rtl";

        // أضفنا data-driver-name لنقل الاسم للـ Modal
        alertDiv.innerHTML = `
            <div>
                <i class="fa-solid fa-triangle-exclamation me-2 fs-5 text-dark"></i>
                <strong>تحذير عاجل!</strong> رخصة <strong>${licenseName}</strong> ستنتهي خلال <strong>${daysLeft} أيام</strong>! يرجى التجديد.
            </div>
            <div class="mt-2 mt-md-0 d-flex gap-2">
                <button class="btn btn-success btn-sm px-3 fw-bold renew-btn" 
                        data-name="${licenseName}" 
                        data-key="${dbFieldKey}" 
                        data-id="${driverId}"
                        data-driver-name="${driverName}">تم التجديد</button>
                <button class="btn btn-dark btn-sm px-3" data-bs-dismiss="alert">إغلاق</button>
            </div>
        `;
        alertContainer.appendChild(alertDiv);
    }
}

// ==========================================
// التعامل مع الضغط على زر التجديد (فتح الـ Modal)
// ==========================================
document.addEventListener("click", async (e) => {
    if (e.target.classList.contains("renew-btn")) {
        // حفظ البيانات في متغير مؤقت
        currentRenewalData = {
            licenseName: e.target.getAttribute("data-name"),
            dbFieldKey: e.target.getAttribute("data-key"),
            driverId: e.target.getAttribute("data-id"),
            driverName: e.target.getAttribute("data-driver-name")
        };

        // تغيير عنوان الـ Modal
        document.getElementById("modalTitle").textContent = `تجديد رخصة ${currentRenewalData.licenseName}`;
        licenseModal.show();
    }
});

// ==========================================
// التعامل مع زر الحفظ داخل الـ Modal
// ==========================================
document.getElementById("saveDateBtn").addEventListener("click", async () => {
    const newDateStr = document.getElementById("newDateInput").value;

    if (!newDateStr) {
        alert("يرجى اختيار تاريخ صالح!");
        return;
    }

    try {
        const { licenseName, dbFieldKey, driverId, driverName } = currentRenewalData;
        const driverDocRef = doc(db, "users", driverId);

        // 1. تحديث التاريخ في قاعدة البيانات
        await updateDoc(driverDocRef, {
            [dbFieldKey]: newDateStr
        });

        // 2. إرسال الإشعار
        await addDoc(collection(db, "notifications"), {
            driverId: driverId,
            driverName: driverName,
            message: `  ${driverName} بتجديد رخصة ${licenseName} بتاريخ انتهاء: ${newDateStr}`,
            timestamp: new Date(),
            isRead: false
        });

        alert(`✅ تم تحديث تاريخ رخصة ${licenseName} بنجاح!`);
        licenseModal.hide(); // إغلاق المودال
        document.getElementById("newDateInput").value = ""; // تصفير الحقل

    } catch (error) {
        console.error("حدث خطأ:", error);
        alert("فشل التحديث، يرجى المحاولة لاحقاً.");
    }
});