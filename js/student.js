import { db, auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ربط عناصر واجهة المستخدم بالـ DOM
const bookingDest = document.getElementById("bookingDest");
const bookingDriver = document.getElementById("bookingDriver");
const goTimeContainer = document.getElementById("goTimeContainer");
const returnTimeContainer = document.getElementById("returnTimeContainer");
const bookingGoTime = document.getElementById("bookingGoTime");
const bookingReturnTime = document.getElementById("bookingReturnTime");
const livePrice = document.getElementById("livePrice");
const bookingForm = document.getElementById("bookingForm");
const confirmBookingBtn = document.getElementById("confirmBookingBtn");
const bookingsTable = document.getElementById("studentBookingsTable");
const logoutBtn = document.getElementById("logoutBtn");
const welcomeStudentName = document.getElementById("welcomeStudentName");

// عناصر المودال الجديد (بوابة الدفع)
const paymentAmountDisplay = document.getElementById("paymentAmountDisplay");
const confirmPaymentBtn = document.getElementById("confirmPaymentBtn");
const payCard = document.getElementById("payCard");
const payWallet = document.getElementById("payWallet");
const cardFields = document.getElementById("cardFields");

let destinationsData = {}; 
let driversData = {}; 
let currentStudentUid = null;
let currentStudentName = "طالب مشترك"; 
let selectedBasePrice = 0;
let pendingBooking = null; // 🌟 متغير عالمي مؤقت لحفظ بيانات الحجز الحالية أثناء عملية الدفع


// 1. التأكد من هوية الطالب وجلسة تسجيل الدخول وجلب اسمه
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../auth/login.html"; 
    } else {
        currentStudentUid = user.uid;
        welcomeStudentName.textContent = "جاري التحميل..."; 

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                currentStudentName = userDoc.data().name || "طالب مشترك";
                welcomeStudentName.textContent = currentStudentName;
            } else {
                welcomeStudentName.textContent = "طالب مشترك";
            }
        } catch (err) {
            console.error("Error fetching student profile name:", err);
            welcomeStudentName.textContent = "طالب مشترك"; 
        }

        loadDestinations();
        loadStudentBookings();
    }
});

// 2. جلب جميع الوجهات المتاحة من Firestore وتعبئتها في الـ Select
async function loadDestinations() {
    try {
        const querySnapshot = await getDocs(collection(db, "destinations"));
        bookingDest.innerHTML = '<option value="" selected disabled>اختر وجهتك التدريسية...</option>';
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            destinationsData[docSnap.id] = data; 

            const option = document.createElement("option");
            option.value = docSnap.id;
            option.textContent = `${data.name} (${data.price} ج.م)`;
            bookingDest.appendChild(option);
        });
    } catch (err) {
        console.error("Error loading destinations:", err);
    }
}

// 3. دالة جلب السائقين المتاحين بناءً على الوجهة المختارة
async function loadDriversForDestination(destinationName) {
    try {
        bookingDriver.disabled = true;
        bookingDriver.innerHTML = '<option value="" selected disabled>جاري تحميل الكباتن المتاحين لهذا الخط...</option>';
        driversData = {};

        const driversQuery = query(
            collection(db, "users"), 
            where("role", "==", "driver"),
            where("assignedDestination", "==", destinationName)
        );
        
        const querySnapshot = await getDocs(driversQuery);
        bookingDriver.innerHTML = '<option value="" selected disabled>اختر الكابتن المفضل...</option>';
        
        if (querySnapshot.empty) {
            bookingDriver.innerHTML = '<option value="" selected disabled>لا يوجد سائقين متاحين لهذا الخط حالياً</option>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            driversData[docSnap.id] = data; 

            const option = document.createElement("option");
            option.value = docSnap.id;
            option.textContent = `كابتن / ${data.name} ${data.carModel ? `(${data.carModel})` : ''}`;
            bookingDriver.appendChild(option);
        });
        
        bookingDriver.disabled = false; 
    } catch (err) {
        console.error("Error loading filtered drivers:", err);
        bookingDriver.innerHTML = '<option value="" selected disabled>خطأ في تحميل السائقين</option>';
    }
}

// 4. معالجة تحديثات النموذج وحساب التكلفة والمواعيد
if (bookingDest) {
    bookingDest.addEventListener("change", (e) => {
        const destId = e.target.value;
        const dest = destinationsData[destId];
        if (!dest) return;

        loadDriversForDestination(dest.name);
        handleFormView();
    });
}

document.querySelectorAll('input[name="tripType"]').forEach(radio => {
    radio.addEventListener("change", handleFormView);
});

function handleFormView() {
    const destId = bookingDest.value;
    const dest = destinationsData[destId];
    if (!dest) return;

    selectedBasePrice = dest.price;
    calculatePrice();

    const tripType = document.querySelector('input[name="tripType"]:checked').value;

    bookingGoTime.innerHTML = '<option value="" selected disabled>اختر ميعاد الذهاب</option>';
    bookingReturnTime.innerHTML = '<option value="" selected disabled>اختر ميعاد العودة</option>';

    if (tripType === "ذهاب") {
        goTimeContainer.classList.remove("d-none");
        bookingGoTime.required = true;
        returnTimeContainer.classList.add("d-none");
        bookingReturnTime.required = false;
        bookingReturnTime.value = "";

        if (dest.goTimes) {
            dest.goTimes.split("،").forEach(time => {
                const opt = document.createElement("option");
                opt.value = time.trim();
                opt.textContent = time.trim();
                bookingGoTime.appendChild(opt);
            });
        }
    } 
    else if (tripType === "عودة") {
        goTimeContainer.classList.add("d-none");
        bookingGoTime.required = false;
        bookingGoTime.value = "";
        returnTimeContainer.classList.remove("d-none");
        bookingReturnTime.required = true;

        if (dest.returnTimes) {
            dest.returnTimes.split("،").forEach(time => {
                const opt = document.createElement("option");
                opt.value = time.trim();
                opt.textContent = time.trim();
                bookingReturnTime.appendChild(opt);
            });
        }
    } 
    else if (tripType === "ذهاب وعودة") {
        goTimeContainer.classList.remove("d-none");
        bookingGoTime.required = true;
        returnTimeContainer.classList.remove("d-none");
        bookingReturnTime.required = true;

        if (dest.goTimes) {
            dest.goTimes.split("،").forEach(time => {
                const opt = document.createElement("option");
                opt.value = time.trim();
                opt.textContent = time.trim();
                bookingGoTime.appendChild(opt);
            });
        }
        if (dest.returnTimes) {
            dest.returnTimes.split("،").forEach(time => {
                const opt = document.createElement("option");
                opt.value = time.trim();
                opt.textContent = time.trim();
                bookingReturnTime.appendChild(opt);
            });
        }
    }

    confirmBookingBtn.disabled = false;
}

function calculatePrice() {
    const tripType = document.querySelector('input[name="tripType"]:checked').value;
    const finalPrice = (tripType === "ذهاب وعودة") ? selectedBasePrice * 2 : selectedBasePrice;
    livePrice.textContent = finalPrice + " ج.م";
}

// 5. التحقق من الحجز ثم فتح مودال الدفع (بدلاً من الرفع المباشر)
if (bookingForm) {
    bookingForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const destId = bookingDest.value;
        const destinationName = destinationsData[destId].name;
        
        const driverId = bookingDriver.value;
        const driverName = driversData[driverId]?.name || "غير محدد";

        const tripType = document.querySelector('input[name="tripType"]:checked').value;
        const goTime = bookingGoTime.value || "---";
        const returnTime = bookingReturnTime.value || "---";
        const finalPrice = (tripType === "ذهاب وعودة") ? selectedBasePrice * 2 : selectedBasePrice;

        try {
            confirmBookingBtn.disabled = true;
            confirmBookingBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> جاري التحقق من السعة...`;

            // 🔍 الفحص الأول: منع التكرار
            const checkQuery = query(
                collection(db, "bookings"),
                where("studentUid", "==", currentStudentUid),
                where("destination", "==", destinationName),
                where("tripType", "==", tripType),
                where("status", "==", "نشط")
            );
            
            const querySnapshot = await getDocs(checkQuery);
            let isDuplicate = false;

            querySnapshot.forEach((docSnap) => {
                const existingBooking = docSnap.data();
                if (tripType === "ذهاب" && existingBooking.goTime === goTime) isDuplicate = true;
                else if (tripType === "عودة" && existingBooking.returnTime === returnTime) isDuplicate = true;
                else if (tripType === "ذهاب وعودة" && existingBooking.goTime === goTime && existingBooking.returnTime === returnTime) isDuplicate = true;
            });

            if (isDuplicate) {
                alert(`⚠️ عذراً! أنت مسجل بالفعل في رحلة ${tripType} إلى (${destinationName}) في هذا الميعاد.`);
                return; 
            }

            // 🚨 الفحص الثاني: فحص سعة الكراسي
            const capacityQuery = query(
                collection(db, "bookings"),
                where("driverId", "==", driverId),
                where("status", "==", "نشط")
            );
            const capacitySnapshot = await getDocs(capacityQuery);
            
            let goCount = 0;
            let returnCount = 0;

            capacitySnapshot.forEach((docSnap) => {
                const bookingData = docSnap.data();
                if (bookingData.goTime === goTime && goTime !== "---") goCount++;
                if (bookingData.returnTime === returnTime && returnTime !== "---") returnCount++;
            });

            const maxCapacity = driversData[driverId]?.maxPassengers || 4;

            if (tripType === "ذهاب" && goCount >= maxCapacity) {
                alert(`⚠️ عذراً! ميعاد الذهاب مكتمل العدد (${goCount}/${maxCapacity} كراسي).`);
                return;
            }
            if (tripType === "عودة" && returnCount >= maxCapacity) {
                alert(`⚠️ عذراً! ميعاد العودة مكتمل العدد (${returnCount}/${maxCapacity} كراسي).`);
                return;
            }
            if (tripType === "ذهاب وعودة" && (goCount >= maxCapacity || returnCount >= maxCapacity)) {
                alert(`⚠️ عذراً! ميعاد الذهاب أو العودة مكتمل العدد مع الكابتن.`);
                return;
            }

            // ============================================================
            // 🌟 تحويل المسار للمودال: لو الفحوصات سليمة، نجهز البيانات ونفتح بوابة الدفع
            // ============================================================
            pendingBooking = {
                studentUid: currentStudentUid,
                studentName: currentStudentName, 
                destination: destinationName,
                driverId: driverId,       
                driverName: driverName,   
                tripType: tripType, 
                goTime: goTime,
                returnTime: returnTime,
                totalCost: finalPrice,
                status: "نشط",
                createdAt: serverTimestamp()
            };

            // تحديث المبلغ المطلوب في واجهة المودال
            paymentAmountDisplay.textContent = finalPrice + " ج.م";

            // إظهار المودال عن طريق الـ Bootstrap API
            const paymentModal = new bootstrap.Modal(document.getElementById('paymentSimulationModal'));
            paymentModal.show();

        } catch (err) {
            alert("حدث خطأ أثناء فحص البيانات: " + err.message);
        } finally {
            // إعادة الزرار لحالته الطبيعية لو الطالب قفل المودال وحب يحجز تاني
            confirmBookingBtn.disabled = false;
            confirmBookingBtn.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> تأكيد الحجز والرفع للقاعدة`;
        }
    });
}

// 6. جلب وعرض الرحلات المحجوزة مسبقاً في الجدول
async function loadStudentBookings() {
    if (!bookingsTable) return;
    try {
        const q = query(collection(db, "bookings"), where("studentUid", "==", currentStudentUid));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            bookingsTable.innerHTML = `<tr><td colspan="6" class="text-muted">لم تقم بحجز أي رحلات بعد.</td></tr>`;
            return;
        }

        bookingsTable.innerHTML = "";
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement("tr");
            
            let timeDisplay = "";
            if (data.tripType === "ذهاب") timeDisplay = `الذهاب: ${data.goTime}`;
            else if (data.tripType === "عودة") timeDisplay = `العودة: ${data.returnTime}`;
            else timeDisplay = `الذهاب: ${data.goTime} | العودة: ${data.returnTime}`;

            const currentPayment = data.paymentStatus || "لم يدفع";
            const paymentBadgeClass = currentPayment === "مدفوع" ? "bg-success" : "bg-danger";

            tr.innerHTML = `
                <td class="fw-bold">${data.destination}</td>
                <td class="text-primary"><i class="fa-solid fa-user-steering me-1"></i> ${data.driverName}</td>
                <td><span class="badge bg-light text-dark">${data.tripType}</span></td>
                <td class="small text-muted">${timeDisplay}</td>
                <td class="text-success fw-bold">${data.totalCost} ج.م</td>
                <td><span class="badge ${paymentBadgeClass}">${currentPayment}</span></td>
            `;
            bookingsTable.appendChild(tr);
        });
    } catch (err) {
        console.error("Error loading bookings:", err);
    }
}

// ============================================================
// 7. 🌟 الـ لوجيك الجديد بالكامل الخاص بالمودال (بوابة الدفع والرفع النهائي)
// ============================================================

// أ. تحويل الفيلدز ديناميكياً عند اختيار (بطاقة بنكية) أو (محفظة كاش)
if (payCard && payWallet && cardFields) {
    payCard.addEventListener("change", () => cardFields.classList.remove("d-none"));
    payWallet.addEventListener("change", () => cardFields.classList.add("d-none"));
}

// ب. تأكيد الدفع الفعلي والرفع لقاعدة البيانات Firestore
if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener("click", async () => {
        if (!pendingBooking) return;

        try {
            // تحويل الزرار لحالة التحميل
            confirmPaymentBtn.disabled = true;
            confirmPaymentBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> جاري معالجة الدفع الآمن...`;

            // 💡 هنا بنحدث حقل الدفع ليصبح "مدفوع" لأن الطالب دفع في المودال بنجاح
            pendingBooking.paymentStatus = "مدفوع";

            // الرفع النهائي لـ Firestore
            await addDoc(collection(db, "bookings"), pendingBooking);

            alert(`🎉 رائعة! تم الدفع بنجاح وحجز رحلتك مع كابتن ${pendingBooking.driverName}.`);

            // إغلاق المودال برمجياً
            const modalElement = document.getElementById('paymentSimulationModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) modalInstance.hide();

            // ريست للفورم والواجهات بالكامل
            bookingForm.reset();
            livePrice.textContent = "0 ج.م";
            goTimeContainer.classList.add("d-none");
            returnTimeContainer.classList.add("d-none");
            bookingDriver.innerHTML = '<option value="" selected disabled>يجب اختيار الوجهة أولاً لعرض السائقين...</option>';
            bookingDriver.disabled = true;
            
            // تفريغ البيانات المؤقتة وتحديث الجدول
            pendingBooking = null;
            loadStudentBookings();

        } catch (err) {
            alert("فشل إتمام عملية الدفع والحجز: " + err.message);
        } finally {
            confirmPaymentBtn.disabled = false;
            confirmPaymentBtn.innerHTML = `<i class="fa-solid fa-lock me-2"></i> إدفع الآن بأمان`;
        }
    });
}

// تسجيل الخروج
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        signOut(auth).then(() => window.location.href = "../auth/login.html");
    });
}