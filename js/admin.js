import { db, firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, setDoc, getDocs, updateDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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


const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        const auth = getAuth();
        
        signOut(auth).then(() => {
            // تسجيل خروج ناجح
            console.log("تم تسجيل الخروج بنجاح");
            // تحويل المستخدم إلى صفحة تسجيل الدخول
            window.location.href = "../auth/login.html"; 
        }).catch((error) => {
            // حدث خطأ
            console.error("حدث خطأ أثناء تسجيل الخروج:", error);
            alert("فشل تسجيل الخروج، حاول مرة أخرى.");
        });
    });
}

// ==========================================
// دالة لجلب خطوط السير ووضعها في الـ Dropdown ديناميكياً
// ==========================================
async function populateDestinationsDropdown() {
    if (!assignedDestinationSelect) return;
    try {
        const querySnapshot = await getDocs(collection(db, "destinations"));
        assignedDestinationSelect.innerHTML = '<option value="" selected disabled>اختر الوجهة الثابتة...</option>';
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const option = document.createElement("option");
            option.value = data.name; 
            option.textContent = data.name;
            assignedDestinationSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading destinations for dropdown: ", error);
    }
}

// ==========================================
// 1. الجزء الخاص بإدارة السائقين (Drivers CRUD)
// ==========================================
async function fetchDrivers() {
    if (!driversTableBody) return; 
    driversTableBody.innerHTML = "<tr><td colspan='7'>جاري تحميل البيانات...</td></tr>"; 
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        driversTableBody.innerHTML = "";
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.role === "driver") {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${data.name || 'غير مسجل'}</td>
                    <td>${data.carType || 'ملاكي'} (${data.carModel || '2024'})</td>
                    <td><span class="badge bg-secondary">${data.plateNumber || '---'}</span></td>
                    <td><span class="badge bg-info text-dark">${data.assignedDestination || 'لم يتم التعيين'}</span></td> 
                    <td>${data.baseSalary || 0} ج.م</td>
                    <td>${data.driverLicenseExpiry || '---'}</td>
                    <td>
                        <button class="btn btn-sm btn-warning me-1 edit-btn" data-id="${docSnap.id}">تعديل</button>
                        <button class="btn btn-sm btn-danger delete-btn" data-id="${docSnap.id}">حذف</button>
                    </td>
                `;
                driversTableBody.appendChild(tr);
                
                tr.querySelector(".edit-btn").addEventListener("click", () => startEdit(docSnap.id, data));
                tr.querySelector(".delete-btn").addEventListener("click", () => deleteDriver(docSnap.id));
            }
        });
    } catch (error) { console.error("Error fetching drivers: ", error); }
}

function startEdit(id, data) {
    if(!formTitle || !submitBtn || !cancelEditBtn) return;
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
    document.getElementById("driverLicenseExpiry").value = data.driverLicenseExpiry || '';
    document.getElementById("carLicenseExpiry").value = data.carLicenseExpiry || '';
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
                fetchDrivers();
            } catch (err) { alert("خطأ في التحديث: " + err.message); }
        } else {
            try {
                // استخدام الـ secondaryAuth لمنع خروج الأدمن الحالي
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, nationalId);
                const user = userCredential.user;

                // التخزين في كوليكشن users الموحد الذي يعتمد عليه كود الـ Login
                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid, name, nationalId, email, carType, carModel, plateNumber,
                    maxPassengers: parseInt(maxPassengers), driverLicenseExpiry, carLicenseExpiry, baseSalary: parseFloat(baseSalary),
                    monthlyTripsCount: 0, assignedDestination: assignedDestination, role: "driver", createdAt: new Date() 
                });

                alert("تم إنشاء حساب السائق وتعيين الخط! الباسورد هو الرقم القومي.");
                driverForm.reset();
                fetchDrivers();
            } catch (err) { alert("خطأ أثناء إضافة السائق: " + err.message); }
        }
    });
}

async function deleteDriver(id) {
    if (confirm("هل أنت متأكد من حذف هذا السائق؟")) {
        try {
            await deleteDoc(doc(db, "users", id));
            alert("تم الحذف بنجاح.");
            fetchDrivers();
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
            await deleteDoc(doc(doc(db, "destinations", id)));
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
            // تعديل السطر ده هنا منِعاً للـ Crash الاستباقي للوحة الإحصائيات:
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

// تشغيل الدوال بذكاء حسب عناصر الصفحة الحالية لتجنب أخطاء المتصفح
document.addEventListener("DOMContentLoaded", async () => {
    if (assignedDestinationSelect) {
        await populateDestinationsDropdown();
    }
    if (driversTableBody) {
        fetchDrivers();
    }
    if (destTableBody) {
        fetchDestinations();
    }
    if (document.getElementById("studentsChart")) {
        initDashboard();
    }
});