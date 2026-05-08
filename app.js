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

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDmOGNtpssOPd9752gHWRR2c4QJN28CEc8",
    authDomain: "money-callection.firebaseapp.com",
    projectId: "money-callection",
    storageBucket: "money-callection.firebasestorage.app",
    messagingSenderId: "741567569972",
    appId: "1:741567569972:web:193d6f62b3528a095daa61",
    measurementId: "G-DRF9SCD90B"
};

// Firebase Initialize
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ======================
// ADMIN PASSWORD SYSTEM
// ======================

const adminPassword = "181058";

let isAdmin = false;

const password = prompt("Admin password দিন");

if (password === adminPassword) {

    isAdmin = true;
    alert("Admin Mode চালু হয়েছে");

} else {

    alert("View Mode চালু হয়েছে");
}

// ======================
// HIDE FORM FOR USER
// ======================

if (!isAdmin) {

    document.getElementById("formBox").style.display = "none";
}

// ======================
// ADD DATA
// ======================

window.addData = async function () {

    // Admin Check
    if (!isAdmin) {

        alert("শুধু Admin ডাটা যোগ করতে পারবে");
        return;
    }

    const name = document.getElementById("name").value;
    const amount = document.getElementById("amount").value;
    const date = document.getElementById("date").value;

    // Validation
    if (!name || !amount || !date) {

        alert("সব তথ্য দিন");
        return;
    }

    try {

        await addDoc(collection(db, "moneyList"), {

            name: name,
            amount: Number(amount),
            date: date
        });

        // Clear Inputs
        document.getElementById("name").value = "";
        document.getElementById("amount").value = "";
        document.getElementById("date").value = "";

        alert("ডাটা যোগ হয়েছে");

    } catch (error) {

        console.log(error);
        alert("ডাটা যোগ হয়নি");
    }
};

// ======================
// DELETE DATA
// ======================

window.deleteData = async function (id) {

    // Admin Check
    if (!isAdmin) {

        alert("শুধু Admin ডিলিট করতে পারবে");
        return;
    }

    const confirmDelete = confirm("ডিলিট করতে চান?");

    if (confirmDelete) {

        try {

            await deleteDoc(doc(db, "moneyList", id));

            alert("ডাটা ডিলিট হয়েছে");

        } catch (error) {

            console.log(error);
            alert("ডিলিট হয়নি");
        }
    }
};

// ======================
// EDIT DATA
// ======================

window.editData = async function (id, oldName, oldAmount, oldDate) {

    // Admin Check
    if (!isAdmin) {

        alert("শুধু Admin Edit করতে পারবে");
        return;
    }

    const newName = prompt("নতুন নাম লিখুন", oldName);
    const newAmount = prompt("নতুন টাকার পরিমাণ লিখুন", oldAmount);
    const newDate = prompt("নতুন তারিখ লিখুন", oldDate);

    // Validation
    if (!newName || !newAmount || !newDate) {

        alert("সব তথ্য দিতে হবে");
        return;
    }

    try {

        await updateDoc(doc(db, "moneyList", id), {

            name: newName,
            amount: Number(newAmount),
            date: newDate
        });

        alert("ডাটা আপডেট হয়েছে");

    } catch (error) {

        console.log(error);
        alert("আপডেট হয়নি");
    }
};

// ======================
// SHOW DATA REALTIME
// ======================

const list = document.getElementById("list");
const total = document.getElementById("total");

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
                    style="
                        background:orange;
                        color:white;
                        padding:7px 12px;
                        border:none;
                        border-radius:5px;
                        cursor:pointer;
                    "
                    onclick="editData('${id}', '${data.name}', '${data.amount}', '${data.date}')">
                    Edit
                </button>

                <button
                    style="
                        background:red;
                        color:white;
                        padding:7px 12px;
                        border:none;
                        border-radius:5px;
                        cursor:pointer;
                        margin-left:5px;
                    "
                    onclick="deleteData('${id}')">
                    Delete
                </button>

            ` : `

                <span style="color:gray;">
                    Only View
                </span>

            `}

            </td>

        </tr>
        `;
    });

    // Total Money
    total.innerText = totalMoney;
});