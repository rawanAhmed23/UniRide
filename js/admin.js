import { db, firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    collection, doc, setDoc, updateDoc, deleteDoc, addDoc,
    onSnapshot, query, orderBy, getDocs, where // 🌟 أضفنا where هنا للفلترة
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { checkAccess } from "../js/auth-guard.js";

checkAccess("admin"); // لن يفتح الصفحة إلا لو كان أدمن فعلاً

// إنشاء تطبيق فايربيز ثانوي مخصص لتكريت حسابات السائقين بدون تسجيل خروج الأدمن
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

// عناصر واجهة المستخدم (DOM Elements)
const driverForm = document.getElementById("driverForm");
const driversTableBody = document.getElementById("driversTableBody");
const submitBtn = document.getElementById("submitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const formTitle = document.getElementById("formTitle");
const destTableBody = document.getElementById("destinationsTableBody");
const destinationForm = document.getElementById("destinationForm");
const assignedDestinationSelect = document.getElementById("assignedDestination");

// 🌟 متغيرات نظام الـ Pagination الخاص بالسائقين
let allDrivers = [];           // لتخزين كائنات السائقين بعد جلب عدد رحلاتهم
let currentDriversPage = 1;    // الصفحة الحالية
const driversRowsPerPage = 5;  // عدد السائقين المعروضين في الصفحة الواحدة

const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        const auth = getAuth();
        signOut(auth).then(() => {
            console.log("تم تسجيل الخروج بنجاح");
            window.location.href = "../auth/login.html";
        }).catch((error) => {
            console.error("حدث خطأ أثناء تسجيل الخروج:", error);
            alert("فشل تسجيل الخروج، حاول مرة أخرى.");
        });
    });
}

function formatDateForInput(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return "";
    if (dateStr.includes("-") && dateStr.split("-")[0].length === 4) return dateStr;

    const parts = dateStr.split("-");
    if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

// ==========================================
// دالة لجلب خطوط السير ووضعها في الـ Dropdown ديناميكياً
// ==========================================
async function populateDestinationsDropdown() {
    const selectElement = document.getElementById("assignedDestination");
    if (!selectElement) return;

    try {
        const querySnapshot = await getDocs(collection(db, "destinations"));
        selectElement.innerHTML = '<option value="" selected disabled>اختر الوجهة الثابتة...</option>';

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.name) {
                const option = document.createElement("option");
                option.value = data.name;
                option.textContent = data.name;
                selectElement.appendChild(option);
            }
        });
    } catch (error) {
        console.error("خطأ أثناء جلب الوجهات: ", error);
    }
}

// ==========================================
// 1. الجزء الخاص بإدارة السائقين (Drivers CRUD) المطور
// ==========================================

// الاستماع للسائقين بشكل لحظي وحساب رحلاتهم
function listenToDrivers() {
    if (!driversTableBody) return;

    // رندرة مؤشر تحميل مبدئي
    driversTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-3 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>جاري تحميل السائقين وحساب الرحلات...</td></tr>`;

    onSnapshot(collection(db, "users"), async (snapshot) => {
        const driverDocs = snapshot.docs.filter(docSnap => docSnap.data().role === "driver");

        // جلب عدد الرحلات المنتهية لكل سائق بالتوازي وبكفاءة
        allDrivers = await Promise.all(driverDocs.map(async (docSnap) => {
            const data = docSnap.data();
            const driverId = docSnap.id;

            try {
                // عمل كويري لعد الرحلات المسندة للسائق وحالتها "منتهية"
                const bookingsQuery = query(
                    collection(db, "bookings"),
                    where("driverId", "==", driverId),
                    where("status", "==", "منتهية")
                );
                const bookingsSnap = await getDocs(bookingsQuery);

                return {
                    id: driverId,
                    ...data,
                    completedTrips: bookingsSnap.size // حفظ العدد داخل حقل ديناميكي
                };
            } catch (err) {
                console.error(`خطأ في جلب رحلات السائق ${driverId}:`, err);
                return { id: driverId, ...data, completedTrips: 0 };
            }
        }));

        // للتأكد من ألا تخرج الصفحة الحالية عن النطاق بعد عمليات الحذف
        const totalPages = Math.ceil(allDrivers.length / driversRowsPerPage);
        if (currentDriversPage > totalPages && totalPages > 0) {
            currentDriversPage = totalPages;
        }

        displayDriversTable(); // رندرة الجدول بناءً على الصفحة الحالية
    });
}

// دالة رندرة صفحة الجدول الحالية والتحكم في الـ Pagination
function displayDriversTable() {
    if (!driversTableBody) return;
    driversTableBody.innerHTML = "";

    if (allDrivers.length === 0) {
        //  السطر الصحيح بعد التعديل
        driversTableBody.innerHTML = "<tr><td colspan='8' class='text-center py-3 text-muted'>لا يوجد سائقين مسجلين حالياً.</td></tr>";
        updatePaginationControls(0);
        return;
    }

    // حساب بداية ونهاية مصفوفة السائقين للصفحة الحالية
    const startIndex = (currentDriversPage - 1) * driversRowsPerPage;
    const endIndex = Math.min(startIndex + driversRowsPerPage, allDrivers.length);
    const paginatedDrivers = allDrivers.slice(startIndex, endIndex);

    // تحديث نص العداد أسفل الجدول
    const paginationInfo = document.getElementById("paginationInfo");
    if (paginationInfo) {
        paginationInfo.textContent = `عرض السائقين من ${startIndex + 1} إلى ${endIndex} (إجمالي ${allDrivers.length} سائق)`;
    }

    // رندرة السطور المحددة
    paginatedDrivers.forEach((driver) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="fw-bold text-dark">${driver.name || 'غير مسجل'}</td>
            <td>${driver.carType || 'ملاكي'} (${driver.carModel || '2024'})</td>
            <td><span class="badge bg-secondary">${driver.plateNumber || '---'}</span></td>
            <td><span class="badge bg-info text-dark">${driver.assignedDestination || 'لم يتم التعيين'}</span></td> 
            
            <td>
                <span class="badge bg-success-subtle text-success border border-success-subtle px-3 py-2 rounded-pill fw-bold">
                    <i class="fa-solid fa-route me-1"></i> ${driver.completedTrips || 0} رحلة
                </span>
            </td>
            
            <td class="fw-bold text-primary">${driver.baseSalary || 0} ج.م</td>
            <td>${driver.driverLicenseExpiry || '---'}</td>
            <td>
                <button class="btn btn-sm btn-warning me-1 edit-btn">تعديل</button>
                <button class="btn btn-sm btn-danger delete-btn">حذف</button>
            </td>
        `;
        driversTableBody.appendChild(tr);

        // ربط الأحداث بالكائنات الحالية مباشرة ونظيفة
        tr.querySelector(".edit-btn").addEventListener("click", () => startEdit(driver.id, driver));
        tr.querySelector(".delete-btn").addEventListener("click", () => deleteDriver(driver.id));
    });

    const totalPages = Math.ceil(allDrivers.length / driversRowsPerPage);
    updatePaginationControls(totalPages);
}

// دالة رندرة أزرار الـ Pagination أسفل الجدول ديناميكياً
function updatePaginationControls(totalPages) {
    const container = document.getElementById("paginationContainer");
    if (!container) return;
    container.innerHTML = "";

    if (totalPages <= 1) {
        if (container.parentElement) container.parentElement.classList.add('d-none');
        return;
    }
    if (container.parentElement) container.parentElement.classList.remove('d-none');

    // 1️⃣ زر السابق
    const prevLi = document.createElement("li");
    prevLi.className = `page-item ${currentDriversPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#">السابق</a>`;
    prevLi.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentDriversPage > 1) {
            currentDriversPage--;
            displayDriversTable();
        }
    });
    container.appendChild(prevLi);

    // 2️⃣ أرقام الصفحات المعروضة
    for (let i = 1; i <= totalPages; i++) {
        const pageLi = document.createElement("li");
        pageLi.className = `page-item ${currentDriversPage === i ? 'active' : ''}`;
        pageLi.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        pageLi.addEventListener("click", (e) => {
            e.preventDefault();
            currentDriversPage = i;
            displayDriversTable();
        });
        container.appendChild(pageLi);
    }

    // 3️⃣ زر التالي
    const nextLi = document.createElement("li");
    nextLi.className = `page-item ${currentDriversPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#">التالي</a>`;
    nextLi.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentDriversPage < totalPages) {
            currentDriversPage++;
            displayDriversTable();
        }
    });
    container.appendChild(nextLi);
}

// نظام استقبال التنبيهات لايف
function listenToNotifications() {
    const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"));
    const startTime = Date.now();

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (data.timestamp && data.timestamp.toMillis() > startTime - 5000) {
                    alert(`🔔 تنبيه جديد: ${data.driverName} قام بـ ${data.message}`);
                }
            }
        });
    });
}

function startEdit(id, data) {
    if (!formTitle || !submitBtn || !cancelEditBtn) return;
    formTitle.textContent = "تعديل بيانات السائق: " + data.name;
    submitBtn.textContent = "تحديث البيانات";
    cancelEditBtn.classList.remove("d-none");

    document.getElementById("driverId").value = id;
    document.getElementById("driverName").value = data.name || '';
    document.getElementById("driverNationalId").value = data.nationalId || '';
    document.getElementById("driverEmail").value = data.email || '';
    document.getElementById("driverEmail").disabled = true;
    document.getElementById("carType").value = data.carType || 'ملاكي';
    document.getElementById("carModel").value = data.carModel || '';
    document.getElementById("plateNumber").value = data.plateNumber || '';
    document.getElementById("maxPassengers").value = data.maxPassengers || '';

    document.getElementById("driverLicenseExpiry").value = data.driverLicenseExpiry ? formatDateForInput(data.driverLicenseExpiry) : "";
    document.getElementById("carLicenseExpiry").value = data.carLicenseExpiry ? formatDateForInput(data.carLicenseExpiry) : "";
    document.getElementById("baseSalary").value = data.baseSalary || '';

    if (assignedDestinationSelect) {
        assignedDestinationSelect.value = data.assignedDestination || '';
    }
}

if (cancelEditBtn && driverForm && formTitle && submitBtn) {
    cancelEditBtn.addEventListener("click", () => {
        driverForm.reset();
        document.getElementById("driverId").value = "";
        document.getElementById("driverEmail").disabled = false;
        formTitle.textContent = "إضافة سائق جديد";
        submitBtn.textContent = "حفظ البيانات وإنشاء الحساب";
        cancelEditBtn.classList.add("d-none");
    });
}

if (driverForm) {
    driverForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("driverId").value;
        const name = document.getElementById("driverName").value;
        const nationalId = document.getElementById("driverNationalId").value;
        const email = document.getElementById("driverEmail").value;
        const carType = document.getElementById("carType").value;
        const carModel = document.getElementById("carModel").value;
        const plateNumber = document.getElementById("plateNumber").value;
        const maxPassengers = document.getElementById("maxPassengers").value;
        const driverLicenseExpiry = document.getElementById("driverLicenseExpiry").value;
        const carLicenseExpiry = document.getElementById("carLicenseExpiry").value;
        const baseSalary = document.getElementById("baseSalary").value;
        const assignedDestination = assignedDestinationSelect ? assignedDestinationSelect.value : "";

        if (id) {
            try {
                await updateDoc(doc(db, "users", id), {
                    name, nationalId, carType, carModel, plateNumber, assignedDestination,
                    maxPassengers: parseInt(maxPassengers), driverLicenseExpiry, carLicenseExpiry, baseSalary: parseFloat(baseSalary)
                });
                alert("تم تحديث بيانات السائق والخط بنجاح!");
                cancelEditBtn.click();
                // 🌟 تمت إزالة استدعاء listenToDrivers التكراري لأن الـ onSnapshot يراقب live
            } catch (err) { alert("خطأ في التحديث: " + err.message); }
        } else {
            try {
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, nationalId);
                const user = userCredential.user;

                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid, name, nationalId, email, carType, carModel, plateNumber,
                    maxPassengers: parseInt(maxPassengers), driverLicenseExpiry, carLicenseExpiry, baseSalary: parseFloat(baseSalary),
                    monthlyTripsCount: 0, assignedDestination: assignedDestination, role: "driver", createdAt: new Date()
                });

                alert("تم إنشاء حساب السائق وتعيين الخط! الباسورد هو الرقم القومي.");
                driverForm.reset();
                // 🌟 تمت إزالة استدعاء listenToDrivers التكراري
            } catch (err) { alert("خطأ أثناء إضافة السائق: " + err.message); }
        }
    });
}

async function deleteDriver(id) {
    if (confirm("هل أنت متأكد من حذف هذا السائق؟")) {
        try {
            await deleteDoc(doc(db, "users", id));
            alert("تم الحذف بنجاح.");
            // 🌟 تمت إزالة استدعاء listenToDrivers التكراري
        } catch (err) { alert("خطأ في الحذف: " + err.message); }
    }
}

// ==========================================
// 2. الجزء الخاص بالوجهات والأسعار (Destinations)
// ==========================================
async function fetchDestinations() {
    if (!destTableBody) return;
    destTableBody.innerHTML = "<tr><td colspan='5'>جاري تحميل الوجهات...</td></tr>";
    try {
        const querySnapshot = await getDocs(collection(db, "destinations"));
        destTableBody.innerHTML = "";

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="fw-bold">${data.name}</td>
                <td><span class="badge bg-secondary">الموقف الثابت</span></td>
                <td class="text-success fw-bold">${data.price} ج.م</td>
                <td><span class="text-muted small">${data.times || '---'}</span></td>
                <td><button class="btn btn-sm btn-outline-danger delete-dest-btn">حذف</button></td>
            `;
            destTableBody.appendChild(tr);
            tr.querySelector(".delete-dest-btn").addEventListener("click", () => deleteDestination(docSnap.id));
        });
    } catch (error) { console.error(error); }
}

if (destinationForm) {
    destinationForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("destName").value;
        const price = parseFloat(document.getElementById("destPrice").value);
        const times = document.getElementById("destTimes").value;

        try {
            await addDoc(collection(db, "destinations"), { name, price, times, createdAt: new Date() });
            alert("تم حفظ الوجهة بنجاح!");
            destinationForm.reset();
            fetchDestinations();
        } catch (err) { alert("خطأ: " + err.message); }
    });
}

async function deleteDestination(id) {
    if (confirm("هل تريد حذف هذه الوجهة؟")) {
        try {
            await deleteDoc(doc(db, "destinations", id));
            alert("تم الحذف.");
            fetchDestinations();
        } catch (err) { alert(err.message); }
    }
}

// ==========================================
// 3. الإحصائيات والرسوم البيانية والماليات (Dashboard)
// ==========================================
async function initDashboard() {
    if (!document.getElementById("studentsChart")) return;

    try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const bookingsSnapshot = await getDocs(collection(db, "bookings"));
        const destinationsSnapshot = await getDocs(collection(db, "destinations"));

        let totalTripsCount = bookingsSnapshot.size;
        let totalRevenueSum = 0;
        let totalDriversSalarySum = 0;
        let destinationStats = {};

        destinationsSnapshot.forEach(docSnap => {
            destinationStats[docSnap.data().name] = { students: 0, drivers: 0 };
        });

        usersSnapshot.forEach(docSnap => {
            const user = docSnap.data();
            if (user.role === "driver") {
                const trips = user.monthlyTripsCount || 0;
                let finalSalary = user.baseSalary || 0;
                if (trips < 40) finalSalary = finalSalary * 0.95;
                totalDriversSalarySum += finalSalary;

                if (user.assignedDestination && destinationStats[user.assignedDestination]) {
                    destinationStats[user.assignedDestination].drivers += 1;
                }
            }
        });

        bookingsSnapshot.forEach(docSnap => {
            const booking = docSnap.data();
            totalRevenueSum += booking.totalCost || 0;
            if (booking.destination && destinationStats[booking.destination]) {
                destinationStats[booking.destination].students += 1;
            }
        });

        document.getElementById("totalTrips").textContent = totalTripsCount;
        document.getElementById("totalRevenue").textContent = totalRevenueSum + " ج.م";
        document.getElementById("totalDriversSalary").textContent = Math.round(totalDriversSalarySum) + " ج.م";

        const labels = Object.keys(destinationStats);
        const studentsData = labels.map(k => destinationStats[k].students);
        const driversData = labels.map(k => destinationStats[k].drivers);

        new Chart(document.getElementById('studentsChart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'عدد الطلاب المحجوزين للوجهة', data: studentsData, backgroundColor: '#0d6efd' }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        new Chart(document.getElementById('driversChart').getContext('2d'), {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{ data: driversData, backgroundColor: ['#198754', '#ffc107', '#dc3545', '#0dcaf0'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

    } catch (error) { console.error("Dashboard error: ", error); }
}

// تشغيل الدوال بذكاء حسب عناصر الصفحة الحالية لتجنب أخطاء المتصفح والتكرار
document.addEventListener("DOMContentLoaded", async () => {
    if (assignedDestinationSelect) {
        await populateDestinationsDropdown();
    }
    if (driversTableBody) {
        listenToDrivers(); // 🌟 يتم تشغيله مرة واحدة نظيفة هنا فقط ويراقب لايف
    }
    listenToNotifications();
    if (destTableBody) {
        fetchDestinations();
    }
    if (document.getElementById("studentsChart")) {
        initDashboard();
    }
});