import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDmOGNtpssOPd9752gHWRR2c4QJN28CEc8",
    authDomain: "money-callection.firebaseapp.com",
    projectId: "money-callection",
    storageBucket: "money-callection.firebasestorage.app",
    messagingSenderId: "741567569972",
    appId: "1:741567569972:web:193d6f62b3528a095daa61"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let isAdmin = false;
let globalData = [];
let currentEditId = null;

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

// --- ১. মেসেজ ফাংশন ---
function showMsg(text, type) {
    if (!el.toast) return;
    el.toast.innerText = text;
    el.toast.className = `toast show ${type}`;
    setTimeout(() => {
        el.toast.classList.remove("show");
        el.toast.classList.remove(type);
    }, 3000);
}

// --- ২. অথেনটিকেশন চেক ---
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
    render(globalData);
});

// --- ৩. লগইন লজিক ---
document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("adminEmail").value;
    const password = document.getElementById("adminPass").value;

    if (!email || !password) {
        showMsg("⚠️ ইমেল এবং পাসওয়ার্ড দিন!", "error");
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        showMsg("✅ লগইন সফল হয়েছে!", "success");
        el.loginModal.style.display = "none";
    } catch (error) {
        showMsg("❌ ভুল ইমেল বা পাসওয়ার্ড!", "error");
    }
};

// --- ৪. লগআউট লজিক ---
el.logoutBtn.onclick = () => {
    signOut(auth).then(() => {
        location.reload();
    });
};

// --- ৫. রিয়েল-টাইম ডেটা রিড ---
onSnapshot(collection(db, "moneyList"), snap => {
    globalData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    globalData.sort((a, b) => {
        if (b.date !== a.date) return new Date(b.date) - new Date(a.date);
        return (b.time?.seconds || 0) - (a.time?.seconds || 0);
    });
    render(globalData);
});

// --- ৬. রেন্ডার ফাংশন ---
function render(data) {
    el.income.innerHTML = "";
    el.expense.innerHTML = "";
    let inTotal = 0, exTotal = 0;

    data.forEach(d => {
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

    document.querySelectorAll(".admin-col").forEach(col => {
        col.style.display = isAdmin ? "table-cell" : "none";
    });

    attachAdminEvents();
}

// --- ৭. ইভেন্ট লিসেনার (Edit & Delete) ---
function attachAdminEvents() {
    // ডিলিট লজিক
    document.querySelectorAll(".del-btn").forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm("🗑️ আপনি কি নিশ্চিতভাবে এটি ডিলিট করতে চান?")) {
                try {
                    await deleteDoc(doc(db, "moneyList", id));
                    showMsg("🗑️ ডিলিট করা হয়েছে!", "success");
                } catch (err) {
                    showMsg("⛔ ডিলিট করার অনুমতি নেই!", "error");
                }
            }
        };
    });

    // এডিট লজিক
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
}

// --- ৮. ডেটা যোগ ও আপডেট ---
document.getElementById("saveBtn").onclick = async () => {
    const name = document.getElementById("name").value;
    const amount = document.getElementById("amount").value;
    const date = document.getElementById("date").value;
    const type = document.getElementById("type").value;

    if (!name || !amount || !date) {
        alert("সবগুলো ঘর পূরণ করুন!");
        return;
    }

    try {
        await addDoc(collection(db, "moneyList"), {
            name, amount: Number(amount), date, type, time: serverTimestamp()
        });
        document.getElementById("name").value = "";
        document.getElementById("amount").value = "";
        showMsg("✅ সফলভাবে যোগ হয়েছে!", "success");
    } catch (e) {
        showMsg("❌ যোগ করা সম্ভব হয়নি!", "error");
    }
};

document.getElementById("updateBtn").onclick = async () => {
    const name = document.getElementById("editName").value;
    const amount = document.getElementById("editAmount").value;
    const date = document.getElementById("editDate").value;
    const type = document.getElementById("editType").value;

    try {
        await updateDoc(doc(db, "moneyList", currentEditId), {
            name, amount: Number(amount), date, type
        });
        el.editModal.style.display = "none";
        showMsg("✅ আপডেট সফল হয়েছে!", "success");
    } catch (err) {
        showMsg("❌ আপডেট হয়নি!", "error");
    }
};

// --- ৯. UI কন্ট্রোল ---
el.adminBtn.onclick = () => el.loginModal.style.display = "flex";
document.getElementById("closeModal").onclick = () => el.loginModal.style.display = "none";
document.getElementById("closeEditModal").onclick = () => el.editModal.style.display = "none";

document.getElementById("paymentCopyArea").onclick = () => {
    navigator.clipboard.writeText("01893454283").then(() => {
        showMsg("📋 নাম্বার কপি হয়েছে!", "success");
    });
};