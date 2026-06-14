// import { db, auth } from "./firebase-config.js";
// import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// import { doc, getDoc, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// // الـ Cloudinary Config من السكرينات بتاعتك 
// const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dxdab2cdj/image/upload";
// const CLOUDINARY_PRESET = "UniRide";

// // ربط عناصر الـ DOM (تأكدي من مطابقة الـ IDs في الـ HTML)
// const chatArea = document.querySelector(".chat-container") || document.getElementById("chatArea"); 
// const messageInput = document.querySelector("input[placeholder*='اكتب شكوتك']");
// const sendBtn = document.querySelector("button:has(.fa-paper-plane)") || document.getElementById("sendBtn");
// const fileInput = document.getElementById("chatFileInput"); // اختياري لو ضيفتي زرار للصور
// const logoutBtn = document.getElementById("logoutBtn");

// let currentStudentUid = null;
// let currentStudentName = "طالب مشترك";

// // 1. التحقق من هوية الطالب وجلب اسمه
// onAuthStateChanged(auth, async (user) => {
//     if (!user) {
//         window.location.href = "../auth/login.html";
//     } else {
//         currentStudentUid = user.uid;
//         try {
//             const userDoc = await getDoc(doc(db, "users", user.uid));
//             if (userDoc.exists()) {
//                 currentStudentName = userDoc.data().name || "طالب مشترك";
//             }
//         } catch (err) {
//             console.error("Error fetching name:", err);
//         }
        
//         // تشغيل الشات المباشر بمجرد معرفة الـ UID
//         listenToMessages();
//     }
// });

// // 2. الاستماع للمحادثة بشكل حي ومباشر (Real-time)
// function listenToMessages() {
//     // كويري لجلب الرسائل الخاصة بهذا الطالب فقط مرتبة تصاعدياً حسب وقت الإرسال
//     const q = query(
//         collection(db, "complaints"),
//         where("studentUid", "==", currentStudentUid),
//         orderBy("createdAt", "asc")
//     );

//     onSnapshot(q, (snapshot) => {
//         // إخفاء سبرينر التحميل بمجرد استجابة الفايربيز
//         chatArea.innerHTML = ""; 

//         if (snapshot.empty) {
//             chatArea.innerHTML = `<div class="text-center text-muted p-5">أهلاً ${currentStudentName}، اكتب رسالتك هنا لبدء محادثة مباشرة مع الدعم الفني.</div>`;
//             return;
//         }

//         snapshot.forEach((docSnap) => {
//             const data = docSnap.data();
//             const isMe = data.sender === "student"; // هل المرسل هو الطالب أم الأدمن؟
            
//             const messageRow = document.createElement("div");
//             messageRow.className = `d-flex ${isMe ? 'justify-content-end' : 'justify-content-start'} mb-3`;
            
//             // تصميم سوفت للرسالة (يمين للطالب، شمال للأدمن)
//             messageRow.innerHTML = `
//                 <div class="p-3 rounded-3 shadow-sm" style="max-width: 75%; background-color: ${isMe ? '#0d6efd' : '#f1f3f5'}; color: ${isMe ? '#fff' : '#212529'};">
//                     <div class="small fw-bold mb-1" style="font-size: 0.75rem; opacity: 0.8;">
//                         ${isMe ? 'أنت' : 'الدعم الفني (الأدمن)'}
//                     </div>
//                     <div>${data.message || ''}</div>
//                     ${data.imageUrl ? `<img src="${data.imageUrl}" class="img-fluid rounded mt-2" style="max-height: 200px;" alt="مرفق">` : ''}
//                 </div>
//             `;
//             chatArea.appendChild(messageRow);
//         });

//         // سكرول تلقائي لآخر رسالة تحت
//         chatArea.scrollTop = chatArea.scrollHeight;
//     }, (error) => {
//         console.error("Chat error:", error);
//         chatArea.innerHTML = `<div class="text-center text-danger p-3">حدث خطأ في الاتصال بالشات المباشر.</div>`;
//     });
// }

// // 3. دالة رفع الصورة إلى Cloudinary (إذا تم اختيار ملف)
// async function uploadImageToCloudinary(file) {
//     const formData = new FormData();
//     formData.append("file", file);
//     formData.append("upload_preset", CLOUDINARY_PRESET);

//     const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
//     if (!res.ok) throw new Error("فشل رفع الصورة");
//     const data = await res.json();
//     return data.secure_url; // رابط الصورة المباشر
// }

// // 4. إرسال الرسالة لقاعدة البيانات
// async function sendMessage() {
//     const text = messageInput.value.trim();
//     const hasFile = fileInput && fileInput.files.length > 0;

//     if (!text && !hasFile) return; // منع الإرسال الفاضي

//     try {
//         sendBtn.disabled = true; // تعطيل الزر مؤقتاً لمنع السبام
//         let uploadedImageUrl = null;

//         if (hasFile) {
//             const file = fileInput.files[0];
//             uploadedImageUrl = await uploadImageToCloudinary(file);
//         }

//         // إضافة مستند جديد في كوليكشن complaints
//         await addDoc(collection(db, "complaints"), {
//             studentUid: currentStudentUid,
//             studentName: currentStudentName,
//             message: text,
//             imageUrl: uploadedImageUrl,
//             sender: "student", // 👈 تحديد الهوية عشان الأدمن يفرق
//             createdAt: serverTimestamp()
//         });

//         // تنظيف الحقول بعد النجاح
//         messageInput.value = "";
//         if (fileInput) fileInput.value = ""; 

//     } catch (err) {
//         alert("فشل إرسال الرسالة: " + err.message);
//     } finally {
//         sendBtn.disabled = false;
//     }
// }

// // ربط أحداث الضغط على الإرسال
// if (sendBtn) sendBtn.addEventListener("click", sendMessage);
// if (messageInput) {
//     messageInput.addEventListener("keypress", (e) => {
//         if (e.key === "Enter") sendMessage();
//     });
// }

// // تسجيل الخروج الـ standard بتاعنا
// if (logoutBtn) {
//     logoutBtn.addEventListener("click", () => {
//         auth.signOut().then(() => window.location.href = "../auth/login.html");
//     });
// }