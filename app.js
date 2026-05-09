import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    deleteDoc,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// FIREBASE CONFIG
const firebaseConfig = {

    apiKey: "AIzaSyDmOGNtpssOPd9752gHWRR2c4QJN28CEc8",

    authDomain: "money-callection.firebaseapp.com",

    projectId: "money-callection",

    storageBucket: "money-callection.firebasestorage.app",

    messagingSenderId: "741567569972",

    appId: "1:741567569972:web:193d6f62b3528a095daa61",

    measurementId: "G-DRF9SCD90B"
};

// FIREBASE INIT
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

// ADMIN PASSWORD
const adminPassword = "181058";

let isAdmin = false;

// ELEMENTS
const formBox = document.getElementById("formBox");

const viewMode = document.getElementById("viewMode");

const adminBtn = document.getElementById("adminBtn");

const adminBtn2 = document.getElementById("adminBtn2");

const incomeList = document.getElementById("incomeList");

const expenseList = document.getElementById("expenseList");

// ADMIN LOGIN
function adminLogin() {

    const password = prompt("Admin Password দিন");

    if (password === adminPassword) {

        isAdmin = true;

        formBox.style.display = "block";

        viewMode.style.display = "none";

        alert("Admin Mode চালু হয়েছে");

        loadData();

    } else {

        alert("ভুল Password");
    }
}

adminBtn.addEventListener("click", adminLogin);

adminBtn2.addEventListener("click", adminLogin);

// ADD DATA
window.addData = async function () {

    if (!isAdmin) {

        alert("শুধু Admin Add করতে পারবে");

        return;
    }

    const name = document.getElementById("name").value;

    const amount = document.getElementById("amount").value;

    const date = document.getElementById("date").value;

    const type = document.getElementById("type").value;

    if (!name || !amount || !date) {

        alert("সব তথ্য দিন");

        return;
    }

    await addDoc(collection(db, "moneyList"), {

        name,

        amount: Number(amount),

        date,

        type
    });

    document.getElementById("name").value = "";

    document.getElementById("amount").value = "";

    document.getElementById("date").value = "";
};

// DELETE
window.deleteData = async function (id) {

    if (!isAdmin) {

        alert("শুধু Admin Delete করতে পারবে");

        return;
    }

    const confirmDelete = confirm("ডিলিট করতে চান?");

    if (confirmDelete) {

        await deleteDoc(doc(db, "moneyList", id));
    }
};

// EDIT
window.editData = async function (
    id,
    oldName,
    oldAmount,
    oldDate
) {

    if (!isAdmin) {

        alert("শুধু Admin Edit করতে পারবে");

        return;
    }

    const newName = prompt("নাম", oldName);

    const newAmount = prompt("টাকা", oldAmount);

    const newDate = prompt("তারিখ", oldDate);

    if (!newName || !newAmount || !newDate) {

        alert("সব তথ্য দিন");

        return;
    }

    await updateDoc(doc(db, "moneyList", id), {

        name: newName,

        amount: Number(newAmount),

        date: newDate
    });
};

// LOAD DATA
function loadData() {

    onSnapshot(collection(db, "moneyList"), (snapshot) => {

        incomeList.innerHTML = "";

        expenseList.innerHTML = "";

        let incomeTotal = 0;

        let expenseTotal = 0;

        // ARRAY
        let allData = [];

        snapshot.forEach((item) => {

            allData.push({
                id: item.id,
                ...item.data()
            });
        });

        // SORT LATEST FIRST
        allData.sort((a, b) => {

            return new Date(b.date) - new Date(a.date);
        });

        // SHOW DATA
        allData.forEach((data) => {

            const row = `

            <tr>

                <td>${data.name}</td>

                <td>৳ ${data.amount}</td>

                <td>${data.date}</td>

                <td>

                    ${isAdmin ? `

                        <button
                        class="edit-btn"
                        onclick="editData(
                        '${data.id}',
                        '${data.name}',
                        '${data.amount}',
                        '${data.date}'
                        )">

                        Edit

                        </button>

                        <button
                        class="delete-btn"
                        onclick="deleteData('${data.id}')">

                        Delete

                        </button>

                    ` : `

                        <span class="view-text">
                            Only View
                        </span>

                    `}

                </td>

            </tr>
            `;

            // INCOME
            if (data.type === "income") {

                incomeTotal += Number(data.amount);

                incomeList.innerHTML += row;

            }

            // EXPENSE
            else {

                expenseTotal += Number(data.amount);

                expenseList.innerHTML += row;
            }
        });

        // TOTAL
        document.getElementById("incomeTotal").innerText =
            incomeTotal;

        document.getElementById("expenseTotal").innerText =
            expenseTotal;

        document.getElementById("balance").innerText =
            incomeTotal - expenseTotal;
    });
}

// DEFAULT LOAD
loadData();