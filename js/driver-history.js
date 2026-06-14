// 1. جميع الاستيرادات في أعلى الملف دائماً
import { db, auth } from "./firebase-config.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. الاستماع لحالة تسجيل دخول السائق الحالي
onAuthStateChanged(auth, async (user) => {
    const historyTableBody = document.getElementById("historyTableBody");
    if (user) {
        loadDriverHistory(user.uid);
    } else {
        if (historyTableBody) {
            historyTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">يرجى تسجيل الدخول أولاً للوصول إلى السجل.</td></tr>`;
        }
    }
});

// 3. دالة جلب وعرض سجل الرحلات
async function loadDriverHistory(driverUid) {
    const historyTableBody = document.getElementById("historyTableBody");
    const totalArchivedCount = document.getElementById("totalArchivedCount");
    
    if (!historyTableBody) return;

    try {
        // 1️⃣ أولاً: جلب أسعار الوجهات الحقيقية من كوليكشن destinations لتحديث الأسعار تلقائياً
        const destinationsPrices = {};
        try {
            const destSnapshot = await getDocs(collection(db, "destinations"));
            destSnapshot.forEach((doc) => {
                const destData = doc.data();
                if (destData.name) {
                    destinationsPrices[destData.name.trim()] = Number(destData.price) || 0;
                }
            });
        } catch (destError) {
            console.error("Error fetching destinations prices:", destError);
        }

        // 2️⃣ ثانياً: جلب الحجوزات المنتهية للسائق الحالي
        const historyQuery = query(
            collection(db, "bookings"),
            where("driverId", "==", driverUid),
            where("status", "==", "منتهية")
        );

        const querySnapshot = await getDocs(historyQuery);
        historyTableBody.innerHTML = ""; 
        
        if (querySnapshot.empty) {
            historyTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-folder-open fs-3 mb-2 text-secondary"></i><br>لا يوجد أي رحلات منتهية في سجلك حتى الآن.</td></tr>`;
            if (totalArchivedCount) totalArchivedCount.textContent = "0 رحلة مؤرشفة";
            return;
        }

        // تجميع الطلاب الذين كانوا في نفس الرحلة
        const groupedTrips = {};

        querySnapshot.forEach((docSnap) => {
            const booking = docSnap.data();
            
            let dateKey = "---";
            if (booking.createdAt) {
                const dateObj = booking.createdAt.toDate();
                dateKey = dateObj.toLocaleDateString("en-US"); 
            }
            
            const type = booking.tripType || "ذهاب";
            
            // 🛠️ تحسين عرض الوقت: لو ذهاب وعودة يظهر الوقتين مع بعض بشكل شيك
            let timeDisplay = "";
            if (type === "ذهاب") {
                timeDisplay = booking.goTime || "---";
            } else if (type === "عودة") {
                timeDisplay = booking.returnTime || "---";
            } else if (type === "ذهاب وعودة") {
                timeDisplay = `ذهاب: ${booking.goTime || '---'} | عودة: ${booking.returnTime || '---'}`;
            }
            
            const destination = booking.destination || "غير محدد";
            const cleanDest = destination.trim();
            
            // 💵 جلب السعر الأساسي للاتجاه الواحد أولاً
            const basePrice = (cleanDest in destinationsPrices) ? destinationsPrices[cleanDest] : (Number(booking.price) || 25);
            
            // 🌟 التعديل الجوهري هنا: لو الرحلة ذهاب وعودة بنضاعف عائد التذكرة للطالب ده
            if (type === "ذهاب وعودة") {
                booking.realPrice = basePrice * 2;
            } else {
                booking.realPrice = basePrice;
            }
            
            const uniqueTripKey = `${dateKey}_${type}_${timeDisplay}_${destination}`;
            
            if (!groupedTrips[uniqueTripKey]) {
                groupedTrips[uniqueTripKey] = {
                    dateObject: booking.createdAt ? booking.createdAt.toDate() : null,
                    destination: destination,
                    tripType: type,
                    time: timeDisplay,
                    bookingsList: [] 
                };
            }
            
            groupedTrips[uniqueTripKey].bookingsList.push(booking);
        });

        // تحويل الكائن لمصفوفة وترتيبها
        const finalTripsArray = Object.values(groupedTrips);
        finalTripsArray.sort((a, b) => b.dateObject - a.dateObject);

        if (totalArchivedCount) totalArchivedCount.textContent = `${finalTripsArray.length} رحلة مؤرشفة`;

        // رندر الرحلات ديناميكياً داخل الجدول
        finalTripsArray.forEach((trip, index) => {
            const tripNumber = finalTripsArray.length - index;
            
            let formattedDate = "---";
            if (trip.dateObject) {
                formattedDate = trip.dateObject.toLocaleDateString("ar-EG", {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="fw-bold text-primary">رحلة رقم (${tripNumber})</td>
                <td><i class="fa-solid fa-location-dot text-danger me-1"></i> ${trip.destination}</td>
                <td><span class="badge bg-secondary px-2 py-1">${trip.tripType}</span></td>
                <td><span class="text-muted small"><i class="fa-regular fa-clock me-1 text-primary"></i> ${trip.time}</span></td>
                <td><span class="badge bg-success text-white px-2 py-1"><i class="fa-solid fa-check me-1"></i> مدفوع (كاش)</span></td>
                <td class="text-muted">${formattedDate}</td>
                <td>
                    <button class="btn btn-dark btn-sm rounded-pill px-3 show-details-btn">
                        <i class="fa-solid fa-users me-1 text-warning"></i> عرض الركاب (${trip.bookingsList.length})
                    </button>
                </td>
            `;

            tr.querySelector(".show-details-btn").addEventListener("click", () => {
                showTripDetails(tripNumber, trip.bookingsList, trip);
            });

            historyTableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error inside loadDriverHistory:", error);
        historyTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">حدث خطأ أثناء معالجة البيانات: ${error.message}</td></tr>`;
    }
}

// 4. دالة فتح وعرض تفاصيل الرحلة المؤرشفة داخل الـ Modal
function showTripDetails(tripNumber, tripBookings, tripSummary) {
    const destElem = document.getElementById("modalTripDestination");
    const timeElem = document.getElementById("modalTripTime");
    const countElem = document.getElementById("modalTripStudentsCount");
    const idElem = document.getElementById("modalTripId");
    const amountElem = document.getElementById("modalTripTotalAmount");
    const listContainer = document.getElementById("modalPassengersList");
    const modalElement = document.getElementById('tripDetailsModal');

    if (!modalElement) {
        console.error("خطأ: لم يتم العثور على عنصر الـ Modal في صفحة HTML!");
        return;
    }

    if (idElem) idElem.textContent = tripNumber;
    if (destElem) destElem.textContent = tripSummary.destination || "غير محدد";
    if (timeElem) timeElem.textContent = `${tripSummary.time || '---'} (${tripSummary.tripType || 'ذهاب'})`;
    if (countElem) countElem.textContent = tripBookings.length;

    // حساب إجمالي مبلغ الرحلة بناءً على السعر الحقيقي المسترجع والمعدل فوق 🧮
    let totalTripAmount = 0;
    
    if (listContainer) {
        listContainer.innerHTML = ""; 

        tripBookings.forEach((booking, index) => {
            const ticketPrice = Number(booking.realPrice) || 25; 
            totalTripAmount += ticketPrice;

            const li = document.createElement("li");
            li.className = "list-group-item d-flex justify-content-between align-items-center text-end py-3";
            li.innerHTML = `
                <div class="d-flex align-items-center">
                    <span class="badge bg-secondary me-3 rounded-circle" style="width: 25px; height: 25px; display: flex; align-items: center; justify-content: center;">${index + 1}</span>
                    <strong class="text-dark">${booking.studentName || "طالب مشترك"}</strong>
                </div>
                <span class="badge bg-success-subtle text-success border border-success-subtle py-2 px-3 rounded-pill fw-bold">
                    <i class="fa-solid fa-money-bill-wave me-1"></i> تم الدفع كاش (${ticketPrice} ج.م)
                </span>
            `;
            listContainer.appendChild(li);
        });
    }

    if (amountElem) {
        amountElem.textContent = totalTripAmount;
    }

    let myModal = bootstrap.Modal.getInstance(modalElement);
    if (!myModal) {
        myModal = new bootstrap.Modal(modalElement);
    }
    myModal.show();
}

// 5. حدث الضغط على زر تسجيل الخروج
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        if (confirm("هل متأكد من تسجيل الخروج؟")) {
            signOut(auth).then(() => {
                window.location.href = "../auth/login.html"; 
            }).catch((error) => {
                console.error("حدث خطأ أثناء تسجيل الخروج:", error);
            });
        }
    });
}