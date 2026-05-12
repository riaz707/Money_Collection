import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDmOGNtpssOPd9752gHWRR2c4QJN28CEc8",
    authDomain: "money-callection.firebaseapp.com",
    projectId: "money-callection",
    storageBucket: "money-callection.firebasestorage.app",
    messagingSenderId: "741567569972",
    appId: "1:741567569972:web:193d6f62b3528a095daa61"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Global Variables
let isAdmin = false;
let globalData = [];
let currentEditId = null;

// DOM Elements
const el = {
    income: document.getElementById("incomeList"),
    expense: document.getElementById("expenseList"),
    incomeTotal: document.getElementById("incomeTotal"),
    expenseTotal: document.getElementById("expenseTotal"),
    balance: document.getElementById("balance"),
    formBox: document.getElementById("formBox"),
    loginModal: document.getElementById("loginModal"),
    editModal: document.getElementById("editModal"),
    adminBtn: document.getElementById("adminBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    toast: document.getElementById("toast")
};

// --- ১. অথেনটিকেশন চেক (অটো-লগইন এবং UI কন্ট্রোল) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        isAdmin = true;
        el.adminBtn.style.display = "none";
        el.logoutBtn.style.display = "inline-block";
        el.formBox.style.display = "block";
    } else {
        isAdmin = false;
        el.adminBtn.style.display = "inline-block";
        el.logoutBtn.style.display = "none";
        el.formBox.style.display = "none";
    }
    render(globalData); // ডাটা রি-রেন্ডার হবে (অ্যাকশন বাটনসহ বা ছাড়া)
});

// --- ২. লগইন লজিক ---
// document.getElementById("loginBtn").onclick = async () => {
//     const email = document.getElementById("adminEmail").value;
//     const password = document.getElementById("adminPass").value;

//     if (!email || !password) return alert("ইমেল এবং পাসওয়ার্ড দিন!");

//     try {
//         await signInWithEmailAndPassword(auth, email, password);
//         alert("সফলভাবে লগইন হয়েছে!");
//         el.loginModal.style.display = "none";
//     } catch (error) {
//         alert("ভুল ইমেল বা পাসওয়ার্ড!");
//         console.error(error.message);
//     }
// };





document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("adminEmail").value;
    const password = document.getElementById("adminPass").value;

    if (!email || !password) {
        showMsg("⚠️ ইমেল এবং পাসওয়ার্ড দিন!", "error");
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        showMsg("✅ সফলভাবে লগইন হয়েছে!", "success"); // ডায়নামিক সাকসেস মেসেজ
        el.loginModal.style.display = "none";
    } catch (error) {
        // ভুল পাসওয়ার্ড বা ইমেলের জন্য স্পেসিফিক মেসেজ
        if (error.code === "auth/invalid-credential") {
            showMsg("❌ ভুল ইমেল বা পাসওয়ার্ড!", "error");
        } else {
            showMsg("🚨 সমস্যা হয়েছে: " + error.message, "error");
        }
    }
};





// --- ৩. লগআউট লজিক ---
el.logoutBtn.onclick = () => {
    signOut(auth).then(() => {
        // এখানে আগে alert("লগআউট সফল!") ছিল, সেটা ফেলে দেওয়া হয়েছে
        location.reload();
    }).catch((error) => {
        console.error("Logout error:", error);
    });
};

// --- ৪. রিয়েল-টাইম ডেটা লিসেনার ---
onSnapshot(collection(db, "moneyList"), snap => {
    globalData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // সর্টিং (তারিখ অনুযায়ী নতুন আগে)
    globalData.sort((a, b) => {
        if (b.date !== a.date) return new Date(b.date) - new Date(a.date);
        return (b.time?.seconds || 0) - (a.time?.seconds || 0);
    });

    render(globalData);
});

// --- ৫. রেন্ডার ফাংশন ---
function render(data) {
    el.income.innerHTML = "";
    el.expense.innerHTML = "";
    let inTotal = 0, exTotal = 0;

    data.forEach(d => {
        // তারিখ ফরম্যাট করা (DD-MM-YYYY)
        const dObj = new Date(d.date);
        const fDate = d.date ? `${String(dObj.getDate()).padStart(2, '0')}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${dObj.getFullYear()}` : "";

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${d.name}</td>
            <td>${d.amount}</td>
            <td>${fDate}</td>
            <td class="admin-col" style="display: ${isAdmin ? 'table-cell' : 'none'}">
                <button class="edit-btn" data-id="${d.id}">Edit</button>
                <button class="del-btn" data-id="${d.id}">Delete</button>
            </td>
        `;

        if (d.type === "income") {
            inTotal += d.amount;
            el.income.appendChild(row);
        } else {
            exTotal += d.amount;
            el.expense.appendChild(row);
        }
    });

    el.incomeTotal.innerText = inTotal;
    el.expenseTotal.innerText = exTotal;
    el.balance.innerText = `৳ ${inTotal - exTotal}`;

    // টেবিল হেডারের "অ্যাকশন" কলাম কন্ট্রোল
    document.querySelectorAll(".admin-col").forEach(col => {
        col.style.display = isAdmin ? "table-cell" : "none";
    });

    attachAdminEvents();
}

// --- ৬. এডিট এবং ডিলিট ইভেন্ট লিসেনার ---
function attachAdminEvents() {
    document.querySelectorAll(".del-btn").forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm("আপনি কি নিশ্চিত এটি মুছে ফেলতে চান?")) {
                await deleteDoc(doc(db, "moneyList", id));
            }
        };
    });




    async function deleteItem(id) {
        // ব্রাউজারের ডিফল্ট কনফার্মেশন বক্স (এটি সবচেয়ে সহজ ও নিরাপদ)
        const proceed = confirm("🗑️ আপনি কি নিশ্চিতভাবে এটি ডিলিট করতে চান?");

        if (proceed) {
            try {
                await deleteDoc(doc(db, "moneyList", id));
                showMsg("🗑️ ডিলিট করা হয়েছে!", "success");
            } catch (e) {
                showMsg("⛔ ডিলিট করার অনুমতি নেই!", "error");
            }
        }
    }





    document.querySelectorAll(".edit-btn").forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.dataset.id;
            const item = globalData.find(x => x.id === id);
            currentEditId = id;
            document.getElementById("editName").value = item.name;
            document.getElementById("editAmount").value = item.amount;
            document.getElementById("editDate").value = item.date;
            document.getElementById("editType").value = item.type;
            el.editModal.style.display = "flex";
        };
    });
};
// --- ৭. ডেটা যোগ এবং আপডেট ---
document.getElementById("saveBtn").onclick = async () => {
    const name = document.getElementById("name").value;
    const amount = document.getElementById("amount").value;
    const date = document.getElementById("date").value;
    const type = document.getElementById("type").value;

    if (!name || !amount || !date) return alert("সবগুলো ঘর পূরণ করুন!");

    try {
        await addDoc(collection(db, "moneyList"), {
            name, amount: Number(amount), date, type, time: serverTimestamp()
        });
        document.getElementById("name").value = "";
        document.getElementById("amount").value = "";
    } catch (e) {
        alert("ডেটা যোগ করার অনুমতি নেই!");
    }
};

document.getElementById("updateBtn").onclick = async () => {
    const name = document.getElementById("editName").value;
    const amount = document.getElementById("editAmount").value;
    const date = document.getElementById("editDate").value;
    const type = document.getElementById("editType").value;

    await updateDoc(doc(db, "moneyList", currentEditId), {
        name, amount: Number(amount), date, type
    });
    el.editModal.style.display = "none";
};

// --- ৮. UI কন্ট্রোল (মডাল এবং কপি) ---
el.adminBtn.onclick = () => el.loginModal.style.display = "flex";
document.getElementById("closeModal").onclick = () => el.loginModal.style.display = "none";
document.getElementById("closeEditModal").onclick = () => el.editModal.style.display = "none";

const copyNumber = () => {
    navigator.clipboard.writeText("01893454283").then(() => {
        el.toast.classList.add("show");
        setTimeout(() => el.toast.classList.remove("show"), 2000);
    });
};
document.getElementById("paymentCopyArea").onclick = copyNumber;








// সব ধরনের মেসেজ দেখানোর কমন ফাংশন
function showMsg(text, type) {
    const msgBox = document.getElementById("toast"); // তোমার আগে থেকেই toast আছে
    msgBox.innerText = text;
    msgBox.className = `toast show ${type}`; // success বা error ক্লাস যোগ হবে

    setTimeout(() => {
        msgBox.classList.remove("show");
    }, 3000);
}