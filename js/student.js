import { db, auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// تم إضافة doc و getDoc هنا لجلب بيانات اسم الطالب من كوليكشن users
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

let destinationsData = {}; 
let driversData = {}; // لتخزين بيانات السائقين الذين تم جلبهم للخط المختار
let currentStudentUid = null;
let currentStudentName = "طالب مشترك"; // 👈 متغير عالمي لتخزين اسم الطالب الفعلي
let selectedBasePrice = 0;

// 1. التأكد من هوية الطالب وجلسة تسجيل الدخول وجلب اسمه
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../auth/login.html"; 
    } else {
        currentStudentUid = user.uid;
        
        try {
            // 🔍 جلب مستند الطالب لقراءة اسمه الحقيقي ونقله للحجوزات
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                currentStudentName = userDoc.data().name || "طالب مشترك";
            }
        } catch (err) {
            console.error("Error fetching student profile name:", err);
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

// 3. دالة جلب السائقين المتاحين بناءً على الوجهة المختارة (الفلترة الذكية)
async function loadDriversForDestination(destinationName) {
    try {
        bookingDriver.disabled = true;
        bookingDriver.innerHTML = '<option value="" selected disabled>جاري تحميل الكباتن المتاحين لهذا الخط...</option>';
        
        // تفريغ البيانات السابقة
        driversData = {};

        // عمل كويري في كوليكشن users للبحث عن الحسابات التي دورها سائق وتعمل على نفس الوجهة
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
            driversData[docSnap.id] = data; // تخزين البيانات محلياً لاستخدامها عند الحفظ

            const option = document.createElement("option");
            option.value = docSnap.id;
            // عرض اسم السائق وموديل السيارة إن وجد
            option.textContent = `كابتن / ${data.name} ${data.carModel ? `(${data.carModel})` : ''}`;
            bookingDriver.appendChild(option);
        });
        
        bookingDriver.disabled = false; // تفعيل القائمة بعد اكتمال التحميل بنجاح
    } catch (err) {
        console.error("Error loading filtered drivers:", err);
        bookingDriver.innerHTML = '<option value="" selected disabled>خطأ في تحميل السائقين</option>';
    }
}

// 4. معالجة تحديثات النموذج (Form Views) وحساب التكلفة والمواعيد
if (bookingDest) {
    bookingDest.addEventListener("change", (e) => {
        const destId = e.target.value;
        const dest = destinationsData[destId];
        if (!dest) return;

        // استدعاء دالة جلب السائقين المخصصة لهذا الخط تلقائياً بمجرد اختيار الطالب للوجهة
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

// 5. رفع مستند الحجز النهائي لـ Firestore (بعد التحقق من عدم التكرار وعدم اكتمال العدد)
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
            // منع الضغط المتكرر على الزرار أثناء المعالجة
            confirmBookingBtn.disabled = true;
            confirmBookingBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-1"></i> جاري التحقق من الحجوزات والسعة...`;

            // 🔍 خطوة اللوجيك الأولى: التحقق من عدم وجود حجز مسبق لنفس الطالب في نفس الميعاد والوجهة
            const checkQuery = query(
                collection(db, "bookings"),
                where("studentUid", "==", currentStudentUid),
                where("destination", "==", destinationName),
                where("tripType", "==", tripType),
                where("status", "==", "نشط")
            );
            
            const querySnapshot = await getDocs(checkQuery);
            let isDuplicate = false;

            // نلف على الحجوزات النشطة ونشوف لو المواعيد متطابقة لنفس الطالب
            querySnapshot.forEach((docSnap) => {
                const existingBooking = docSnap.data();
                if (tripType === "ذهاب" && existingBooking.goTime === goTime) {
                    isDuplicate = true;
                } else if (tripType === "عودة" && existingBooking.returnTime === returnTime) {
                    isDuplicate = true;
                } else if (tripType === "ذهاب وعودة" && existingBooking.goTime === goTime && existingBooking.returnTime === returnTime) {
                    isDuplicate = true;
                }
            });

            // لو لقينا حجز مطابق، نوقف العملية وننبه الطالب
            if (isDuplicate) {
                alert(`⚠️ عذراً! أنت مسجل بالفعل في رحلة ${tripType} إلى (${destinationName}) في هذا الميعاد.`);
                confirmBookingBtn.disabled = false;
                confirmBookingBtn.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> تأكيد الحجز والرفع للقاعدة`;
                return; 
            }

            // ============================================================
            // 🚨 خطوة اللوجيك الجديدة: فحص سعة كراسي السيارة (منع التكدس)
            // ============================================================
            const capacityQuery = query(
                collection(db, "bookings"),
                where("driverId", "==", driverId),
                where("status", "==", "نشط")
            );
            const capacitySnapshot = await getDocs(capacityQuery);
            
            let goCount = 0;
            let returnCount = 0;

            // حساب عدد الكراسي المحجوزة فعلياً لكل ميعاد عند هذا السائق
            capacitySnapshot.forEach((docSnap) => {
                const bookingData = docSnap.data();
                if (bookingData.goTime === goTime && goTime !== "---") goCount++;
                if (bookingData.returnTime === returnTime && returnTime !== "---") returnCount++;
            });

            // جلب الحد الأقصى لكراسي السائق (القيمة الافتراضية 4 في حال عدم تحديدها بالبروفايل)
            const maxCapacity = driversData[driverId]?.maxPassengers || 4;

            // 1. تحقق رحلات الذهاب
            if (tripType === "ذهاب" && goCount >= maxCapacity) {
                alert(`⚠️ عذراً! ميعاد الذهاب المختار مكتمل العدد تماماً مع هذا الكابتن (${goCount}/${maxCapacity} كراسي محجوزة). يرجى اختيار ميعاد آخر أو كابتن آخر.`);
                confirmBookingBtn.disabled = false;
                confirmBookingBtn.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> تأكيد الحجز والرفع للقاعدة`;
                return;
            }

            // 2. تحقق رحلات العودة
            if (tripType === "عودة" && returnCount >= maxCapacity) {
                alert(`⚠️ عذراً! ميعاد العودة المختار مكتمل العدد تماماً مع هذا الكابتن (${returnCount}/${maxCapacity} كراسي محجوزة). يرجى اختيار ميعاد آخر أو كابتن آخر.`);
                confirmBookingBtn.disabled = false;
                confirmBookingBtn.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> تأكيد الحجز والرفع للقاعدة`;
                return;
            }

            // 3. تحقق رحلات ذهاب وعودة معاً
            if (tripType === "ذهاب وعودة" && (goCount >= maxCapacity || returnCount >= maxCapacity)) {
                alert(`⚠️ عذراً! ميعاد الذهاب أو ميعاد العودة مكتمل العدد مع هذا الكابتن. \n(حجوزات الذهاب الحالية: ${goCount}/${maxCapacity} | حجوزات العودة الحالية: ${returnCount}/${maxCapacity}). يرجى تعديل مواعيدك.`);
                confirmBookingBtn.disabled = false;
                confirmBookingBtn.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> تأكيد الحجز والرفع للقاعدة`;
                return;
            }
            // ============================================================

            // لو مفيش تكرار ومفيش تخطي للسعة، يتم الحجز بشكل طبيعي تماماً
            await addDoc(collection(db, "bookings"), {
                studentUid: currentStudentUid,
                studentName: currentStudentName, // 👈 الحقل السحري الجديد عشان يظهر عند الكابتن في الجدول!
                destination: destinationName,
                driverId: driverId,       
                driverName: driverName,   
                tripType: tripType, 
                goTime: goTime,
                returnTime: returnTime,
                totalCost: finalPrice,
                status: "نشط", 
                paymentStatus: "لم يدفع", // تبدأ بـ "لم يدفع" لحين ركوب الأتوبيس ودفع الكاش للسائق
                createdAt: serverTimestamp()
            });

            alert(`تم حجز الرحلة بنجاح مع كابتن ${driverName}!`);
            bookingForm.reset();
            livePrice.textContent = "0 ج.م";
            goTimeContainer.classList.add("d-none");
            returnTimeContainer.classList.add("d-none");
            bookingDriver.innerHTML = '<option value="" selected disabled>يجب اختيار الوجهة أولاً لعرض السائقين...</option>';
            bookingDriver.disabled = true;
            confirmBookingBtn.disabled = true;
            
            loadStudentBookings(); 

        } catch (err) {
            alert("فشل الحجز: " + err.message);
        } finally {
            confirmBookingBtn.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> تأكيد الحجز والرفع للقاعدة`;
        }
    });
}

// 6. جلب وعرض الرحلات المحجوزة مسبقاً في الجدول للطالب
async function loadStudentBookings() {
    if (!bookingsTable) return;
    try {
        const q = query(collection(db, "bookings"), where("studentUid", "==", currentStudentUid));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            bookingsTable.innerHTML = `<tr><td colspan="7" class="text-muted">لم تقم بحجز أي رحلات بعد.</td></tr>`;
            return;
        }

        bookingsTable.innerHTML = "";
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement("tr");
            
            let timeDisplay = "";
            if (data.tripType === "ذهاب") {
                timeDisplay = `الذهاب: ${data.goTime}`;
            } else if (data.tripType === "عودة") {
                timeDisplay = `العودة: ${data.returnTime}`;
            } else {
                timeDisplay = `الذهاب: ${data.goTime} | العودة: ${data.returnTime}`;
            }

            // 🎨 تحديد لون وحالة الـ Badge الخاص بالدفع ديناميكياً لتتحول للأخضر عند الدفع لكابتن الأتوبيس
            const currentPayment = data.paymentStatus || "لم يدفع";
            const paymentBadgeClass = currentPayment === "مدفوع" ? "bg-success" : "bg-info";

            tr.innerHTML = `
                <td class="fw-bold">${data.destination}</td>
                <td class="text-primary"><i class="fa-solid fa-user-steering me-1"></i> ${data.driverName || 'غير محدد'}</td>
                <td><span class="badge bg-light text-dark">${data.tripType}</span></td>
                <td class="small text-muted">${timeDisplay}</td>
                <td class="text-success fw-bold">${data.totalCost} ج.م</td>
                <td><span class="badge ${paymentBadgeClass}">${currentPayment}</span></td>
                <td><span class="badge bg-success">${data.status || 'نشط'}</span></td>
            `;
            bookingsTable.appendChild(tr);
        });
    } catch (err) {
        console.error("Error loading bookings:", err);
    }
}

// تسجيل الخروج التلقائي
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        signOut(auth).then(() => window.location.href = "../auth/login.html");
    });
}