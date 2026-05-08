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

    apiKey: "YOUR_API_KEY",

    authDomain: "YOUR_AUTH_DOMAIN",

    projectId: "YOUR_PROJECT_ID",

    storageBucket: "YOUR_STORAGE_BUCKET",

    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",

    appId: "YOUR_APP_ID"
};

// FIREBASE INITIALIZE
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

// ADMIN PASSWORD
const adminPassword = "12345";

// ADMIN CHECK
let isAdmin = false;

// ELEMENTS
const formBox = document.getElementById("formBox");

const viewAdminBox = document.getElementById("viewAdminBox");

const adminBtn = document.getElementById("adminBtn");

const adminBtn2 = document.getElementById("adminBtn2");

// LOGIN FUNCTION
function adminLogin() {

    const password = prompt("Admin Password দিন");

    if (password === adminPassword) {

        isAdmin = true;

        alert("Admin Mode চালু হয়েছে");

        formBox.style.display = "block";

        viewAdminBox.style.display = "none";

        loadData();

    } else {

        alert("ভুল Password");
    }
}

// BUTTON CLICK
adminBtn.addEventListener("click", adminLogin);

adminBtn2.addEventListener("click", adminLogin);

// ADD DATA
window.addData = async function () {

    if (!isAdmin) {

        alert("শুধু Admin ডাটা যোগ করতে পারবে");

        return;
    }

    const name = document.getElementById("name").value;

    const amount = document.getElementById("amount").value;

    const date = document.getElementById("date").value;

    if (!name || !amount || !date) {

        alert("সব তথ্য দিন");

        return;
    }

    await addDoc(collection(db, "moneyList"), {

        name: name,

        amount: Number(amount),

        date: date
    });

    document.getElementById("name").value = "";

    document.getElementById("amount").value = "";

    document.getElementById("date").value = "";
};

// DELETE DATA
window.deleteData = async function (id) {

    if (!isAdmin) {

        alert("শুধু Admin ডিলিট করতে পারবে");

        return;
    }

    const confirmDelete = confirm("ডিলিট করতে চান?");

    if (confirmDelete) {

        await deleteDoc(doc(db, "moneyList", id));
    }
};

// EDIT DATA
window.editData = async function (id, oldName, oldAmount, oldDate) {

    if (!isAdmin) {

        alert("শুধু Admin Edit করতে পারবে");

        return;
    }

    const newName = prompt("নতুন নাম লিখুন", oldName);

    const newAmount = prompt("নতুন টাকার পরিমাণ লিখুন", oldAmount);

    const newDate = prompt("নতুন তারিখ লিখুন", oldDate);

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

// REALTIME DATA
const list = document.getElementById("list");

const total = document.getElementById("total");

function loadData() {

    onSnapshot(collection(db, "moneyList"), (snapshot) => {

        list.innerHTML = "";

        let totalMoney = 0;

        snapshot.forEach((item) => {

            const data = item.data();

            const id = item.id;

            totalMoney += Number(data.amount);

            list.innerHTML += `

            <tr>

                <td>${data.name}</td>

                <td>৳ ${data.amount}</td>

                <td>${data.date}</td>

                <td>

                    ${isAdmin ? `

                        <button
                            class="edit-btn"
                            onclick="editData('${id}', '${data.name}', '${data.amount}', '${data.date}')">
                            Edit
                        </button>

                        <button
                            class="delete-btn"
                            onclick="deleteData('${id}')">
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
        });

        total.innerText = totalMoney;
    });
}

// DEFAULT VIEW MODE
loadData();