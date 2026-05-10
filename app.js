import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const PASS = "181058";
let isAdmin = false;
let globalData = [];
let currentEditId = null;

const el = {
    income: document.getElementById("incomeList"),
    expense: document.getElementById("expenseList"),
    incomeTotal: document.getElementById("incomeTotal"),
    expenseTotal: document.getElementById("expenseTotal"),
    balance: document.getElementById("balance"),
    form: document.getElementById("formBox"),
    modal: document.getElementById("loginModal"),
    editModal: document.getElementById("editModal"),
    adminBtn: document.getElementById("adminBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    toast: document.getElementById("toast")
};

// Admin Login Logic
el.adminBtn.onclick = () => el.modal.style.display = "flex";
el.logoutBtn.onclick = () => location.reload();

document.getElementById("loginBtn").onclick = () => {
    if (document.getElementById("pass").value === PASS) {
        isAdmin = true;
        el.form.style.display = "block";
        el.logoutBtn.style.display = "inline-block";
        el.adminBtn.style.display = "none";
        el.modal.style.display = "none";
        render(globalData); // লগইন করার পর সব রি-রেন্ডার হবে
    } else {
        alert("ভুল পাসওয়ার্ড!");
    }
};

document.getElementById("closeModal").onclick = () => el.modal.style.display = "none";
document.getElementById("closeEditModal").onclick = () => el.editModal.style.display = "none";

// Add Data (Validation সহ)
document.getElementById("saveBtn").onclick = async () => {
    const name = document.getElementById("name").value;
    const amount = document.getElementById("amount").value;
    const date = document.getElementById("date").value;
    const type = document.getElementById("type").value;

    if (!name || !amount || !date) {
        alert("সবগুলো ঘর পূরণ করুন!");
        return;
    }

    await addDoc(collection(db, "moneyList"), {
        name,
        amount: Number(amount),
        date,
        type,
        time: serverTimestamp()
    });

    document.getElementById("name").value = "";
    document.getElementById("amount").value = "";
};

// Real-time Listener
onSnapshot(collection(db, "moneyList"), snap => {
    globalData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // সর্টিং: তারিখ (নতুন আগে), একই তারিখ হলে এন্ট্রি টাইম (নতুন আগে)
    globalData.sort((a, b) => {
        if (b.date !== a.date) return new Date(b.date) - new Date(a.date);
        return (b.time?.seconds || 0) - (a.time?.seconds || 0);
    });

    render(globalData);
});

// Render Function
function render(data) {
    el.income.innerHTML = "";
    el.expense.innerHTML = "";
    let inTotal = 0, exTotal = 0;

    data.forEach(d => {
        const dObj = new Date(d.date);
        const fDate = `${String(dObj.getDate()).padStart(2, '0')}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${dObj.getFullYear()}`;

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
    el.balance.innerHTML = `<h3>💵 বর্তমান ব্যালেন্স: ৳ ${inTotal - exTotal}</h3>`;

    // লগইন অবস্থায় থাকলে হেডার এবং বডির Action কলাম দেখানো হবে
    document.querySelectorAll(".admin-col").forEach(col => {
        col.style.display = isAdmin ? "table-cell" : "none";
    });

    // Delete Logic (Permission সহ)
    document.querySelectorAll(".del-btn").forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm("আপনি কি নিশ্চিত এটি মুছে ফেলতে চান?")) {
                await deleteDoc(doc(db, "moneyList", id));
            }
        };
    });

    // Edit Logic
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

// Update Data (পজিশন চেঞ্জ হবে না)
document.getElementById("updateBtn").onclick = async () => {
    const name = document.getElementById("editName").value;
    const amount = document.getElementById("editAmount").value;
    const date = document.getElementById("editDate").value;
    const type = document.getElementById("editType").value;

    if (!name || !amount || !date) return alert("তথ্য পূরণ করুন!");

    await updateDoc(doc(db, "moneyList", currentEditId), {
        name, amount: Number(amount), date, type
    });

    el.editModal.style.display = "none";
};

// Copy & Footer System
// document.getElementById("phoneNumber").onclick = () => {
//     navigator.clipboard.writeText("01893454283");
//     el.toast.classList.add("show");
//     setTimeout(() => el.toast.classList.remove("show"), 2000);
// };


// কপি ফাংশন
const copyNumber = () => {
    const number = "01893454283";
    navigator.clipboard.writeText(number).then(() => {
        // তোমার তৈরি করা সেই প্রফেশনাল টোস্ট পপআপ দেখাবে
        const toast = document.getElementById("toast");
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2000);
    }).catch(err => {
        console.error("Copy failed", err);
    });
};

// আইকন এরিয়া এবং নম্বর—উভয় জায়গাতেই ক্লিক করলে কপি হবে
document.getElementById("paymentCopyArea").onclick = copyNumber;


// document.getElementById("whatsappBtn").href = `https://wa.me/8801893454283`;
// document.getElementById("callBtn").href = `tel:01893454283`;