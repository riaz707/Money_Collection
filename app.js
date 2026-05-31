import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, setDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ===== FIREBASE CONFIG =====
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

// ===== STATE =====
let isAdmin = false;
let globalData = [];
let membersData = [];
let budgetData = [];
let currentEditId = null;
let pendingDeleteId = null;
let barChartInstance = null;
let pieChartInstance = null;
let activityLog = JSON.parse(localStorage.getItem("activityLog") || "[]");
let currentPage = "dashboard";
let pendingEntryForWA = null;

// ===== PAYMENT METHOD LABELS =====
const methodLabels = {
    bkash: "📱 বিকাশ",
    nagad: "📱 নগদ",
    rocket: "📱 রকেট",
    cash: "💵 ক্যাশ",
    bank: "🏦 ব্যাংক",
    other: "📦 অন্যান্য"
};

const methodColors = {
    bkash: "#e2136e",
    nagad: "#f05a28",
    rocket: "#8B008B",
    cash: "#38a169",
    bank: "#3182ce",
    other: "#718096"
};

function getMethodLabel(val) {
    return methodLabels[val] || val || "—";
}

function getMethodBadge(val) {
    const color = methodColors[val] || "#718096";
    const label = methodLabels[val] || val || "—";
    return `<span class="badge" style="background:${color}20;color:${color};border:1px solid ${color}40;">${label}</span>`;
}

// ===== TOAST =====
function showMsg(text, type = "success") {
    const t = document.getElementById("toast");
    t.textContent = text;
    t.className = `toast show ${type}`;
    setTimeout(() => { t.className = "toast"; }, 3200);
}

// ===== ACTIVITY LOG =====
function addLog(icon, text) {
    const entry = { icon, text, time: new Date().toLocaleString("bn-BD") };
    activityLog.unshift(entry);
    if (activityLog.length > 60) activityLog.pop();
    localStorage.setItem("activityLog", JSON.stringify(activityLog));
    renderLog();
}

function renderLog() {
    const el = document.getElementById("activityLog");
    if (!el) return;
    if (!activityLog.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">কোনো অ্যাক্টিভিটি নেই।</div></div>`;
        return;
    }
    el.innerHTML = activityLog.map(l => `
        <div class="log-item">
            <span class="log-icon">${l.icon}</span>
            <span class="log-text">${l.text}</span>
            <span class="log-time">${l.time}</span>
        </div>`).join("");
}

// ===== AUTH =====
// ===== AUTO LOGOUT TIMER =====
let autoLogoutTimer = null;
let countdownInterval = null;
const AUTO_LOGOUT_MINUTES = 15; // ১০ মিনিট (৫ বা ১০ যেকোনো সেট করুন)

function clearAutoLogout() {
    if (autoLogoutTimer) { clearTimeout(autoLogoutTimer); autoLogoutTimer = null; }
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    const badge = document.getElementById("autoLogoutBadge");
    if (badge) badge.remove();
    sessionStorage.removeItem("adminLoginTime");
}

function startAutoLogout() {
    clearAutoLogout();
    // sessionStorage এ login সময় save করুন (refresh-safe)
    sessionStorage.setItem("adminLoginTime", Date.now().toString());
    const totalSec = AUTO_LOGOUT_MINUTES * 60;
    const elapsed = 0;
    let remaining = totalSec - elapsed;

    // Countdown badge তৈরি করো
    let badge = document.getElementById("autoLogoutBadge");
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "autoLogoutBadge";
        badge.style.cssText = `
            position:fixed; bottom:20px; right:20px; z-index:9999;
            background:#1a202c; color:#fff; border-radius:12px;
            padding:8px 14px; font-size:13px; font-family:var(--font);
            box-shadow:0 4px 16px rgba(0,0,0,0.3);
            border:1.5px solid #e53e3e44;
            display:flex; align-items:center; gap:8px;
            transition: border-color 0.3s;
            cursor:default; user-select:none;
        `;
        document.body.appendChild(badge);
    }

    function updateBadge() {
        const m = Math.floor(remaining / 60);
        const s = String(remaining % 60).padStart(2, "0");
        const isWarning = remaining <= 60;
        badge.style.borderColor = isWarning ? "#e53e3ecc" : "#e53e3e44";
        badge.innerHTML = `<span style="font-size:15px;">${isWarning ? "⚠️" : "⏱️"}</span>
            <span>অটো লগআউট: <strong style="color:${isWarning ? "#fc8181" : "#a3f7bf"};">${m}:${s}</strong></span>`;
    }

    updateBadge();
    countdownInterval = setInterval(() => {
        remaining--;
        updateBadge();
        if (remaining <= 0) clearInterval(countdownInterval);
    }, 1000);

    autoLogoutTimer = setTimeout(() => {
        clearAutoLogout();
        addLog("⏱️", `অ্যাডমিন ${AUTO_LOGOUT_MINUTES} মিনিট পর অটো লগআউট হয়েছেন।`);
        showMsg("⏱️ নিষ্ক্রিয়তার কারণে অটো লগআউট হয়েছে!", "error");
        signOut(auth).then(() => location.reload());
    }, remaining * 1000);
}

onAuthStateChanged(auth, (user) => {
    isAdmin = !!user;
    if (!isAdmin) {
        clearAutoLogout();
        sessionStorage.removeItem("adminLoginTime");
    } else {
        // Refresh হলে sessionStorage থেকে বাকি সময় হিসাব করুন
        const loginTime = sessionStorage.getItem("adminLoginTime");
        if (loginTime) {
            const elapsed = Math.floor((Date.now() - parseInt(loginTime)) / 1000);
            const totalSec = AUTO_LOGOUT_MINUTES * 60;
            const remaining = totalSec - elapsed;
            if (remaining <= 0) {
                // সময় শেষ — লগআউট
                clearAutoLogout();
                addLog("⏱️", `অ্যাডমিন ${AUTO_LOGOUT_MINUTES} মিনিট পর অটো লগআউট হয়েছেন।`);
                showMsg("⏱️ নিষ্ক্রিয়তার কারণে অটো লগআউট হয়েছে!", "error");
                signOut(auth).then(() => location.reload());
                return;
            } else {
                // বাকি সময় দিয়ে টাইমার চালু করুন
                startAutoLogoutWithRemaining(remaining);
            }
        } else {
            // Fresh login — নতুন টাইমার
            startAutoLogout();
        }
    }

    document.getElementById("adminBtn").style.display = isAdmin ? "none" : "block";
    document.getElementById("logoutBtn").style.display = isAdmin ? "block" : "none";
    document.getElementById("formBox").style.display = isAdmin ? "block" : "none";
    document.getElementById("adminBadge").style.display = isAdmin ? "inline-block" : "none";
    document.getElementById("logNavItem").style.display = isAdmin ? "flex" : "none";
    const adminMF = document.getElementById("adminMembersForm");
    if (adminMF) adminMF.style.display = isAdmin ? "block" : "none";
    const adminBF = document.getElementById("adminBudgetForm");
    if (adminBF) adminBF.style.display = isAdmin ? "block" : "none";
    document.querySelectorAll(".admin-col").forEach(c => c.style.display = isAdmin ? "table-cell" : "none");
    document.querySelectorAll(".note-col").forEach(c => c.style.display = isAdmin ? "table-cell" : "none");
    document.querySelectorAll(".receipt-col").forEach(c => c.style.display = isAdmin ? "table-cell" : "none");
    render(globalData);
});

// Refresh-safe auto logout — বাকি সময় নিয়ে শুরু করুন
function startAutoLogoutWithRemaining(remaining) {
    if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    let badge = document.getElementById("autoLogoutBadge");
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "autoLogoutBadge";
        badge.style.cssText = `
            position:fixed; bottom:20px; right:20px; z-index:9999;
            background:#1a202c; color:#fff; border-radius:12px;
            padding:8px 14px; font-size:13px; font-family:var(--font);
            box-shadow:0 4px 16px rgba(0,0,0,0.3);
            border:1.5px solid #e53e3e44;
            display:flex; align-items:center; gap:8px;
            transition: border-color 0.3s;
            cursor:default; user-select:none;
        `;
        document.body.appendChild(badge);
    }

    function updateBadge() {
        const m = Math.floor(remaining / 60);
        const s = String(remaining % 60).padStart(2, "0");
        const isWarning = remaining <= 60;
        badge.style.borderColor = isWarning ? "#e53e3ecc" : "#e53e3e44";
        badge.innerHTML = `<span style="font-size:15px;">${isWarning ? "⚠️" : "⏱️"}</span>
            <span>অটো লগআউট: <strong style="color:${isWarning ? "#fc8181" : "#a3f7bf"};">${m}:${s}</strong></span>`;
    }
    updateBadge();
    countdownInterval = setInterval(() => {
        remaining--;
        updateBadge();
        if (remaining <= 0) clearInterval(countdownInterval);
    }, 1000);

    autoLogoutTimer = setTimeout(() => {
        clearAutoLogout();
        addLog("⏱️", `অ্যাডমিন ${AUTO_LOGOUT_MINUTES} মিনিট পর অটো লগআউট হয়েছেন।`);
        showMsg("⏱️ নিষ্ক্রিয়তার কারণে অটো লগআউট হয়েছে!", "error");
        signOut(auth).then(() => location.reload());
    }, remaining * 1000);
}

document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("adminEmail").value;
    const pass = document.getElementById("adminPass").value;
    if (!email || !pass) { showMsg("⚠️ ইমেল ও পাসওয়ার্ড দিন!", "error"); return; }
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        showMsg("✅ লগইন সফল!", "success");
        document.getElementById("loginModal").style.display = "none";
        addLog("🔐", "Admin লগইন করেছেন।");
        sessionStorage.setItem("adminLoginTime", Date.now().toString());
        // startAutoLogout onAuthStateChanged থেকেই call হবে না কারণ loginTime ইতিমধ্যে set
        // তাই explicitly call করুন
        startAutoLogout();
    } catch {
        showMsg("❌ ভুল ইমেল বা পাসওয়ার্ড!", "error");
    }
};

document.getElementById("logoutBtn").onclick = () => {
    clearAutoLogout();
    signOut(auth).then(() => {
        addLog("🚪", "Admin লগআউট করেছেন।");
        location.reload();
    });
};

// ===== FIRESTORE REALTIME =====
onSnapshot(collection(db, "moneyList"), snap => {
    globalData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    globalData.sort((a, b) => {
        if (b.date !== a.date) return new Date(b.date) - new Date(a.date);
        return (b.time?.seconds || 0) - (a.time?.seconds || 0);
    });
    populateMonthFilter();
    render(globalData);
});

onSnapshot(collection(db, "members"), snap => {
    membersData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // order ফিল্ড দিয়ে সাজাও, না থাকলে নামের ক্রমানুসারে
    membersData.sort((a, b) => {
        const oa = a.order ?? 9999;
        const ob = b.order ?? 9999;
        if (oa !== ob) return oa - ob;
        return (a.name || "").localeCompare(b.name || "", "bn");
    });
    updateMemberDatalist();
    renderMembers();
});

// ===== SETTINGS SYNC (phoneVisible) =====
// Firestore থেকে real-time settings load — admin যা set করবে view mode-এও দেখাবে
onSnapshot(doc(db, "settings", "appConfig"), (snap) => {
    if (snap.exists()) {
        const data = snap.data();
        if (typeof data.phoneVisible === "boolean" && data.phoneVisible !== phoneVisible) {
            phoneVisible = data.phoneVisible;
            renderMembers();
        }
    }
});

// datalist আপডেট করো সদস্য নাম দিয়ে
function updateMemberDatalist() {
    const dl = document.getElementById("memberSuggestions");
    if (!dl) return;
    dl.innerHTML = membersData.map(m => `<option value="${m.name}">`).join("");
}

// নাম input এ member select হলে WA/Messenger quick links দেখাও
document.getElementById("name")?.addEventListener("input", function () {
    const val = this.value.trim();
    const member = membersData.find(m => m.name.toLowerCase() === val.toLowerCase());
    let infoEl = document.getElementById("nameQuickLinks");
    if (!infoEl) {
        infoEl = document.createElement("div");
        infoEl.id = "nameQuickLinks";
        infoEl.style.cssText = "margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
        this.parentElement.appendChild(infoEl);
    }
    if (member && (member.phone || member.messenger)) {
        const phone = member.phone || "";
        const messenger = member.messenger || "";
        const previewMsg = encodeURIComponent(`আপনার পেমেন্ট এন্ট্রি করা হয়েছে।\nধন্যবাদ!`);
        const waLink = phone ? `https://wa.me/88${phone}?text=${previewMsg}` : "";
        const msgrLink = messenger ? `https://m.me/${messenger}?text=${previewMsg}` : (phone ? `https://m.me/88${phone}?text=${previewMsg}` : "");
        infoEl.innerHTML = `
            <span style="font-size:12px;color:var(--text-secondary);">📋 সদস্য পাওয়া গেছে:</span>
            ${phone ? `<span style="font-size:12px;color:var(--text-secondary);">📞 ${phone}</span>` : ""}
            ${waLink ? `<a href="${waLink}" target="_blank" class="wa-mini-btn" style="font-size:12px;">💬 WhatsApp</a>` : ""}
            ${msgrLink ? `<a href="${msgrLink}" target="_blank" class="msgr-mini-btn" style="font-size:12px;">📨 Messenger</a>` : ""}`;
    } else {
        infoEl.innerHTML = "";
    }
});

onSnapshot(collection(db, "budgets"), snap => {
    budgetData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBudgets();
});

// ===== FILTER & SEARCH =====
function getFilteredData() {
    const month = document.getElementById("monthFilter").value;
    const cat = document.getElementById("categoryFilter").value;
    const search = document.getElementById("searchInput").value.toLowerCase().trim();
    return globalData.filter(d => {
        if (month && !d.date?.startsWith(month)) return false;
        if (cat && d.category !== cat) return false;
        if (search && !d.name?.toLowerCase().includes(search)) return false;
        return true;
    });
}

document.getElementById("monthFilter").onchange =
    document.getElementById("categoryFilter").onchange =
    document.getElementById("searchInput").oninput = () => render(getFilteredData());

document.getElementById("clearFilter").onclick = () => {
    document.getElementById("monthFilter").value = "";
    document.getElementById("categoryFilter").value = "";
    document.getElementById("searchInput").value = "";
    render(globalData);
};

function populateMonthFilter() {
    const sel = document.getElementById("monthFilter");
    const current = sel.value;
    const months = [...new Set(globalData.map(d => d.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
    sel.innerHTML = `<option value="">সব মাস</option>` + months.map(m => {
        const [y, mo] = m.split("-");
        const label = new Date(y, mo - 1).toLocaleString("bn-BD", { year: "numeric", month: "long" });
        return `<option value="${m}" ${current === m ? "selected" : ""}>${label}</option>`;
    }).join("");
}

// ===== FORMAT =====
function fmtDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

function fmtAmount(n) {
    return `৳ ${Number(n).toLocaleString("bn-BD")}`;
}

// ===== METHOD BALANCE =====
function renderMethodBalance(data) {
    const el = document.getElementById("methodBalanceGrid");
    if (!el) return;
    const map = {};
    data.forEach(d => {
        const m = d.category || "other";
        if (!map[m]) map[m] = { income: 0, expense: 0 };
        if (d.type === "income") map[m].income += d.amount || 0;
        else map[m].expense += d.amount || 0;
    });
    if (!Object.keys(map).length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-state-text">কোনো তথ্য নেই।</div></div>`;
        return;
    }
    el.innerHTML = Object.entries(map).map(([key, val]) => {
        const color = methodColors[key] || "#718096";
        const label = methodLabels[key] || key;
        const balance = val.income - val.expense;
        return `<div class="method-bal-card" style="border-left:4px solid ${color};">
            <div class="method-bal-name">${label}</div>
            <div class="method-bal-amount" style="color:${balance >= 0 ? '#38a169' : '#e53e3e'};">৳ ${Math.abs(balance).toLocaleString("bn-BD")}</div>
            <div style="font-size:11px;margin-top:4px;">
                <span style="color:#38a169;">↑ ৳${val.income.toLocaleString("bn-BD")}</span>
                &nbsp;&nbsp;
                <span style="color:#e53e3e;">↓ ৳${val.expense.toLocaleString("bn-BD")}</span>
            </div>
        </div>`;
    }).join("");
}

// ===== RENDER =====
function render(data) {
    const income = data.filter(d => d.type === "income");
    const expense = data.filter(d => d.type === "expense");

    const inTotal = income.reduce((s, d) => s + (d.amount || 0), 0);
    const exTotal = expense.reduce((s, d) => s + (d.amount || 0), 0);
    const balance = inTotal - exTotal;

    animateCount("dashIncome", inTotal);
    animateCount("dashExpense", exTotal);
    animateCount("dashBalance", balance);
    document.getElementById("dashEntries").textContent = data.length;

    document.getElementById("incomeTotal").textContent = fmtAmount(inTotal);
    document.getElementById("expenseTotal").textContent = fmtAmount(exTotal);
    document.getElementById("balance").textContent = fmtAmount(balance);
    document.getElementById("balance").style.color = balance >= 0 ? "#a3f7bf" : "#fc8181";

    renderTable("incomeList", income);
    renderTable("expenseList", expense);
    renderTable("incomeListFull", income, true);
    renderTable("expenseListFull", expense, true);

    const inTotalFull = globalData.filter(d => d.type === "income").reduce((s, d) => s + (d.amount || 0), 0);
    const exTotalFull = globalData.filter(d => d.type === "expense").reduce((s, d) => s + (d.amount || 0), 0);
    const elIF = document.getElementById("incomeTotalFull");
    const elEF = document.getElementById("expenseTotalFull");
    if (elIF) elIF.textContent = fmtAmount(inTotalFull);
    if (elEF) elEF.textContent = fmtAmount(exTotalFull);

    renderPaymentHistory(data);
    renderCategorySummary(data);
    renderCharts(data);
    renderReportCards(data);
    renderMethodBalance(data);
    renderLog();
    updateAdminCols();
}

function renderTable(tbodyId, rows, isFull = false) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const colspan = isAdmin ? 7 : 5;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">কোনো তথ্য নেই।</div></div></td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(d => {
        const hasNote = d.note?.trim();
        const noteCell = hasNote
            ? `<td class="note-col"><button class="note-view-btn" data-id="${d.id}">📄 ভিউ</button></td>`
            : `<td class="note-col"><span class="no-note">—</span></td>`;
        const receiptCell = isAdmin
            ? `<td class="receipt-col"><button class="receipt-btn" data-id="${d.id}">🧾</button></td>`
            : `<td class="receipt-col" style="display:none;"></td>`;
        return `<tr>
            <td>${d.name || "—"}</td>
            <td><strong>${fmtAmount(d.amount)}</strong></td>
            <td>${fmtDate(d.date)}</td>
            <td>${getMethodBadge(d.category)}</td>
            ${noteCell}
            ${receiptCell}
            <td class="admin-col">
                <button class="edit-btn" data-id="${d.id}">✏️</button>
                <button class="del-btn" data-id="${d.id}">🗑️</button>
            </td>
        </tr>`;
    }).join("");

    attachTableEvents(tbody);
}

function renderPaymentHistory(data) {
    const tbody = document.getElementById("paymentHistory");
    if (!tbody) return;
    const paid = data.filter(d => d.type === "income");
    if (!paid.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">কোনো পেমেন্ট নেই।</div></div></td></tr>`;
        return;
    }
    tbody.innerHTML = paid.map(d => `<tr>
        <td>${d.name || "—"}</td>
        <td><strong>${fmtAmount(d.amount)}</strong></td>
        <td>${fmtDate(d.date)}</td>
        <td>${getMethodBadge(d.category)}</td>
        ${isAdmin ? `<td class="receipt-col"><button class="receipt-btn" data-id="${d.id}">🧾</button></td>` : `<td class="receipt-col" style="display:none;"></td>`}
        <td class="admin-col">
            <button class="del-btn" data-id="${d.id}">🗑️</button>
        </td>
    </tr>`).join("");
    attachTableEvents(tbody);
}

function renderCategorySummary(data) {
    const el = document.getElementById("categorySummary");
    if (!el) return;
    const methodMap = {};
    data.forEach(d => {
        const m = d.category || "other";
        if (!methodMap[m]) methodMap[m] = { income: 0, expense: 0 };
        if (d.type === "income") methodMap[m].income += d.amount || 0;
        else methodMap[m].expense += d.amount || 0;
    });

    if (!Object.keys(methodMap).length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-state-text">কোনো তথ্য নেই।</div></div>`;
        return;
    }

    el.innerHTML = Object.entries(methodMap).map(([key, val]) => {
        const color = methodColors[key] || "#718096";
        const label = methodLabels[key] || key;
        return `<div class="cat-card" style="border-top: 3px solid ${color};">
            <div class="cat-card-name">${label}</div>
            <div style="font-size:11px;color:#38a169;margin-top:4px;">↑ ${fmtAmount(val.income)}</div>
            <div style="font-size:11px;color:#e53e3e;">↓ ${fmtAmount(val.expense)}</div>
        </div>`;
    }).join("");
}

function renderReportCards(data) {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthData = data.filter(d => d.date?.startsWith(thisMonth));
    const mIn = monthData.filter(d => d.type === "income").reduce((s, d) => s + d.amount, 0);
    const mEx = monthData.filter(d => d.type === "expense").reduce((s, d) => s + d.amount, 0);
    const el1 = document.getElementById("rptMonthIncome");
    const el2 = document.getElementById("rptMonthExpense");
    const el3 = document.getElementById("rptMonthBalance");
    if (el1) el1.textContent = fmtAmount(mIn);
    if (el2) el2.textContent = fmtAmount(mEx);
    if (el3) el3.textContent = fmtAmount(mIn - mEx);
}

// ===== MEMBER ORDER CONTROL =====
async function reorderMember(idx, direction) {
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= membersData.length) return;
    const a = membersData[idx];
    const b = membersData[swapIdx];
    const orderA = a.order ?? idx;
    const orderB = b.order ?? swapIdx;
    await Promise.all([
        updateDoc(doc(db, "members", a.id), { order: orderB }),
        updateDoc(doc(db, "members", b.id), { order: orderA }),
    ]);
    addLog("🔀", `সদস্য ক্রম পরিবর্তন: ${a.name} ↔ ${b.name}`);
}

async function fixAllMemberOrders() {
    // সব সদস্যের order ফিল্ড 0,1,2... রিসেট করে
    const batch = membersData.map((m, i) => updateDoc(doc(db, "members", m.id), { order: i }));
    await Promise.all(batch);
    showMsg("✅ সিরিয়াল রিসেট হয়েছে!", "success");
    addLog("🔄", "সকল সদস্যের সিরিয়াল রিসেট করা হয়েছে।");
}


// ===== PHONE VISIBILITY STATE =====
let phoneVisible = false; // Admin toggle করে দেখাবে/লুকাবে

function renderMembers() {
    const el = document.getElementById("membersList");
    if (!el) return;
    if (!membersData.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">কোনো সদস্য নেই। Admin প্যানেল থেকে যোগ করুন।</div></div>`;
        return;
    }
    const filterMonth = document.getElementById("memberMonthFilter")?.value || "";

    // Admin control bar
    let resetBtn = "";
    if (isAdmin) {
        resetBtn = `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:10px;">
            <button id="togglePhoneBtn" style="background:${phoneVisible ? '#3182ce' : '#718096'};color:#fff;border:none;padding:6px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-family:var(--font);font-weight:600;">${phoneVisible ? '🙈 নম্বর লুকান' : '👁️ নম্বর দেখান'}</button>
            <button id="fixOrderBtn" style="background:#38a169;color:#fff;border:none;padding:6px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-family:var(--font);font-weight:600;">✅ SAVE</button>
        </div>`;
    }

    // phone column দেখাবে কিনা — শুধু admin এবং phoneVisible=true হলে
    const showPhoneCol = phoneVisible;

    const isMobile = window.innerWidth <= 700;

    // Grid columns — phone column conditionally include
    const gridCols = showPhoneCol
        ? (isAdmin ? "44px 1fr 140px 100px 90px 1fr 80px" : "44px 1fr 140px 100px 90px 1fr")
        : (isAdmin ? "44px 1fr 100px 90px 1fr 80px" : "44px 1fr 100px 90px 1fr");

    const headerStyle = `display:grid;grid-template-columns:${gridCols};background:#1e293b;color:#f1f5f9;font-size:12px;font-weight:700;padding:10px 10px;gap:8px;align-items:center;border-radius:10px 10px 0 0;`;
    const rowStyle = `display:grid;grid-template-columns:${gridCols};padding:10px 10px;gap:8px;align-items:center;border-bottom:1px solid var(--border);font-size:13px;transition:background 0.15s;`;

    let html = resetBtn + `<div class="ml-table-wrap">
        ${!isMobile ? `<div style="${headerStyle}">
            <div>#</div>
            <div>নাম</div>
            ${showPhoneCol ? `<div>ফোন</div>` : ""}
            <div>পরিশোধ</div>
            <div>লক্ষ্য</div>
            <div>অবস্থা</div>
            ${isAdmin ? `<div>কার্যক্রম</div>` : ""}
        </div>` : ""}`;

    membersData.forEach((m, idx) => {
        const payments = globalData.filter(d => d.type === "income" && d.name === m.name);
        const filteredPayments = filterMonth
            ? payments.filter(d => d.date?.startsWith(filterMonth))
            : payments;
        const paid = filteredPayments.reduce((s, d) => s + (d.amount || 0), 0);
        const due = m.due || 0;
        const isPaid = due > 0 ? paid >= due : paid > 0;
        const phone = m.phone || "";
        const messenger = m.messenger || "";

        // const reminderMsg = encodeURIComponent(`আসসালামুয়ালাইকুম ${m.name} ,\nআপনার ${filterMonth || "এই মাসের"} পেমেন্ট বাকি আছে।\nঅনুগ্রহ করে ৳${due.toLocaleString()} পাঠিয়ে দিন।\nধন্যবাদ।`);

        const reminderMsg = encodeURIComponent(`আসসালামুয়ালাইকুম ${m.name},\nআপনার ${filterMonth || "এই মাসের"} মাসের পেমেন্ট বাকি আছে।\nঅনুগ্রহ করে টাকা পাঠিয়ে দিন।\nধন্যবাদ।`);
        const paidMsg = encodeURIComponent(`আসসালামুয়ালাইকুম ${m.name},\nআপনার ${filterMonth || "এই মাসের"}  মাসের ৳${paid.toLocaleString()} পেমেন্ট পাওয়া গেছে। ধন্যবাদ! 🎉`);
        const waLink = phone ? `https://wa.me/88${phone}?text=${reminderMsg}` : "#";
        const waPaidLink = phone ? `https://wa.me/88${phone}?text=${paidMsg}` : "#";
        const msgrLink = messenger ? `https://m.me/${messenger}?text=${reminderMsg}` : (phone ? `https://m.me/88${phone}?text=${reminderMsg}` : "#");
        const msgrPaidLink = messenger ? `https://m.me/${messenger}?text=${paidMsg}` : (phone ? `https://m.me/88${phone}?text=${paidMsg}` : "#");

        const upBtn = idx > 0
            ? `<button class="order-btn order-up" data-idx="${idx}" title="উপরে নিন">▲</button>`
            : `<button class="order-btn order-disabled" disabled>▲</button>`;
        const downBtn = idx < membersData.length - 1
            ? `<button class="order-btn order-down" data-idx="${idx}" title="নিচে নিন">▼</button>`
            : `<button class="order-btn order-disabled" disabled>▼</button>`;

        const rowBg = isPaid ? "border-left:4px solid #38a169;" : "border-left:4px solid #e53e3e;";
        const rowEven = idx % 2 === 1 ? "background:var(--bg3);" : "";

        // Status + reminder buttons
        const statusButtons = `
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                <span class="member-status ${isPaid ? 'status-paid' : 'status-unpaid'}">${isPaid ? "✅ পরিশোধ" : "⏳ বাকি"}</span>
                ${!isPaid && phone ? `<a href="${waLink}" target="_blank" class="wa-mini-btn" title="WhatsApp রিমাইন্ডার">💬 WA</a>` : ""}
                ${!isPaid && phone ? `<a href="${msgrLink}" target="_blank" class="msgr-mini-btn" title="Messenger রিমাইন্ডার">📨 MSG</a>` : ""}
                ${isPaid && phone ? `<a href="${waPaidLink}" target="_blank" class="wa-mini-btn" style="background:#dcfce7;color:#15803d;" title="পরিশোধ ধন্যবাদ WA">💬 WA ✓</a>` : ""}
                ${isPaid && phone ? `<a href="${msgrPaidLink}" target="_blank" class="msgr-mini-btn" title="পরিশোধ ধন্যবাদ MSG">📨 MSG ✓</a>` : ""}
            </div>`;

        if (isMobile) {
            // Mobile card layout
            html += `<div style="padding:12px 14px;border-radius:10px;border:1.5px solid var(--border);${rowBg}margin-bottom:8px;background:var(--card-bg);font-size:13px;" class="ml-row-item">
                <!-- Name row with serial and order btns -->
                <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;">
                    <span class="serial-badge" style="flex-shrink:0;">${idx + 1}</span>
                    <span style="flex:1;">${m.name}</span>
                    ${isAdmin ? `<div style="display:flex;flex-direction:row;gap:3px;">
                        <button class="order-btn order-up${idx === 0 ? ' order-disabled' : ''}" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
                        <button class="order-btn order-down${idx === membersData.length - 1 ? ' order-disabled' : ''}" data-idx="${idx}" ${idx === membersData.length - 1 ? 'disabled' : ''}>▼</button>
                    </div>` : ""}
                </div>
                <!-- Info row -->
                <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary);">
                    <span>💰 পরিশোধ: <strong style="color:#38a169;">৳${paid.toLocaleString("bn-BD")}</strong></span>
                    <span>🎯 লক্ষ্য: ${due > 0 ? `৳${due.toLocaleString("bn-BD")}` : "—"}</span>
                    ${showPhoneCol && phone ? `<span>📞 ${phone}</span>` : ""}
                </div>
                <!-- Status + action row -->
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span class="member-status ${isPaid ? 'status-paid' : 'status-unpaid'}">${isPaid ? "✅ পরিশোধ" : "⏳ বাকি"}</span>
                    ${!isPaid && phone ? `<a href="${waLink}" target="_blank" class="wa-mini-btn">💬 WA</a>` : ""}
                    ${!isPaid && phone ? `<a href="${msgrLink}" target="_blank" class="msgr-mini-btn">📨 MSG</a>` : ""}
                    ${isPaid && phone ? `<a href="${waPaidLink}" target="_blank" class="wa-mini-btn" style="background:#dcfce7;color:#15803d;">💬 ধন্যবাদ</a>` : ""}
                    ${isPaid && phone ? `<a href="${msgrPaidLink}" target="_blank" class="msgr-mini-btn">📨 ধন্যবাদ</a>` : ""}
                    ${isAdmin ? `<div style="margin-left:auto;display:flex;gap:4px;">
                        <button class="edit-member-btn action-btn-edit" data-id="${m.id}" data-name="${m.name}" data-due="${due}" data-phone="${phone}" data-messenger="${messenger}">✏️</button>
                        <button class="del-member-btn action-btn-del" data-id="${m.id}">🗑️</button>
                    </div>` : ""}
                </div>
            </div>`;
        } else {
            // Desktop grid row
            html += `<div style="${rowStyle}${rowBg}${rowEven}" class="ml-row-item">
                <!-- serial -->
                <div style="display:flex;align-items:center;gap:4px;flex-direction:column;">
                    <span class="serial-badge">${idx + 1}</span>
                    ${isAdmin ? `<div style="display:flex;flex-direction:column;gap:1px;">${upBtn}${downBtn}</div>` : ""}
                </div>
                <!-- name -->
                <div style="display:flex;align-items:center;gap:6px;min-width:0;font-weight:600;">
                    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.name}</span>
                </div>
                ${showPhoneCol ? `<div style="font-size:12px;color:var(--text-secondary);">
                    ${phone ? `<a href="tel:${phone}" style="color:inherit;text-decoration:none;">📞 ${phone}</a>` : '—'}
                </div>` : ""}
                <!-- paid -->
                <div><strong style="color:#38a169;">৳${paid.toLocaleString("bn-BD")}</strong></div>
                <!-- due -->
                <div style="color:var(--text-secondary);">${due > 0 ? `৳${due.toLocaleString("bn-BD")}` : '—'}</div>
                <!-- status -->
                ${statusButtons}
                <!-- actions -->
                ${isAdmin ? `<div style="display:flex;gap:4px;align-items:center;">
                    <button class="edit-member-btn action-btn-edit" data-id="${m.id}" data-name="${m.name}" data-due="${due}" data-phone="${phone}" data-messenger="${messenger}" title="এডিট">✏️</button>
                    <button class="del-member-btn action-btn-del" data-id="${m.id}" title="মুছুন">🗑️</button>
                </div>` : ""}
            </div>`;
        }
    });

    html += `</div>`;
    el.innerHTML = html;

    // Stats footer
    const total = membersData.length;
    const filterMonth2 = document.getElementById("memberMonthFilter")?.value || "";
    const paidCount = membersData.filter(m => {
        const payments = globalData.filter(d => d.type === "income" && d.name === m.name);
        const fp = filterMonth2 ? payments.filter(d => d.date?.startsWith(filterMonth2)) : payments;
        const paid = fp.reduce((s, d) => s + (d.amount || 0), 0);
        const due = m.due || 0;
        return due > 0 ? paid >= due : paid > 0;
    }).length;
    const statsEl = document.getElementById("memberStats");
    if (statsEl) {
        statsEl.innerHTML = `<span>মোট সদস্য: <strong>${total}</strong></span> | <span style="color:#38a169;">পরিশোধ: <strong>${paidCount}</strong></span> | <span style="color:#e53e3e;">বাকি: <strong>${total - paidCount}</strong></span>`;
    }

    // সিরিয়াল রিসেট বাটন
    const fixBtn = document.getElementById("fixOrderBtn");
    if (fixBtn) fixBtn.onclick = fixAllMemberOrders;

    // Phone toggle বাটন — onclick দিয়ে (re-render safe)
    const tBtn = document.getElementById("togglePhoneBtn");
    if (tBtn) tBtn.onclick = async () => { phoneVisible = !phoneVisible; try { await setDoc(doc(db, "settings", "appConfig"), { phoneVisible }, { merge: true }); } catch (e) { console.error("settings save error", e); } renderMembers(); };

    // ▲▼ ক্রম বাটন
    el.querySelectorAll(".order-up").forEach(btn => {
        btn.onclick = () => reorderMember(parseInt(btn.dataset.idx), -1);
    });
    el.querySelectorAll(".order-down").forEach(btn => {
        btn.onclick = () => reorderMember(parseInt(btn.dataset.idx), 1);
    });

    el.querySelectorAll(".del-member-btn").forEach(btn => {
        btn.onclick = async () => {
            if (!confirm("সদস্য মুছে ফেলবেন?")) return;
            await deleteDoc(doc(db, "members", btn.dataset.id));
            showMsg("🗑️ সদস্য মুছা হয়েছে।");
        };
    });

    el.querySelectorAll(".edit-member-btn").forEach(btn => {
        btn.onclick = () => openEditMemberModal(btn.dataset.id, btn.dataset.name, btn.dataset.due, btn.dataset.phone, btn.dataset.messenger || "");
    });
}

function openEditMemberModal(id, name, due, phone, messenger) {
    let modal = document.getElementById("editMemberModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "editMemberModal";
        modal.className = "modal";
        modal.innerHTML = `<div class="modal-box">
            <h3>✏️ সদস্য এডিট করুন</h3>
            <div class="form-group" style="margin:12px 0">
                <label>নাম *</label>
                <input id="editMemberName" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg3);color:var(--text);font-family:var(--font);">
            </div>
            <div class="form-group" style="margin:12px 0">
                <label>মাসিক লক্ষ্য (৳)</label>
                <input id="editMemberDue" type="number" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg3);color:var(--text);font-family:var(--font);">
            </div>
            <div class="form-group" style="margin:12px 0">
                <label>ফোন নম্বর</label>
                <input id="editMemberPhone" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg3);color:var(--text);font-family:var(--font);">
            </div>
            <div class="form-group" style="margin:12px 0">
                <label>📨 Messenger ID / Username</label>
                <input id="editMemberMessenger" placeholder="username বা profile ID" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg3);color:var(--text);font-family:var(--font);">
            </div>
            <div class="modal-btns">
                <button id="saveEditMemberBtn" class="btn-primary">✅ সংরক্ষণ করুন</button>
                <button onclick="document.getElementById('editMemberModal').style.display='none'" class="btn-danger">বাতিল</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    document.getElementById("editMemberName").value = name;
    document.getElementById("editMemberDue").value = due;
    document.getElementById("editMemberPhone").value = phone;
    document.getElementById("editMemberMessenger").value = messenger || "";
    modal.style.display = "flex";
    modal.dataset.editId = id;

    document.getElementById("saveEditMemberBtn").onclick = async () => {
        const newName = document.getElementById("editMemberName").value.trim();
        const newDue = Number(document.getElementById("editMemberDue").value) || 0;
        const newPhone = document.getElementById("editMemberPhone").value.trim();
        if (!newName) { showMsg("⚠️ নাম আবশ্যক!", "error"); return; }
        try {
            const newMessenger = document.getElementById("editMemberMessenger").value.trim();
            await updateDoc(doc(db, "members", modal.dataset.editId), { name: newName, due: newDue, phone: newPhone, messenger: newMessenger });
            modal.style.display = "none";
            showMsg("✅ সদস্য আপডেট হয়েছে!");
            addLog("✏️", `সদস্য এডিট: ${newName}`);
        } catch (err) {
            showMsg("❌ আপডেট করা যায়নি!", "error");
        }
    };
}

document.getElementById("saveMemberBtn")?.addEventListener("click", async () => {
    if (!isAdmin) { showMsg("⚠️ Admin লগইন করুন!", "error"); return; }
    const name = document.getElementById("memberName").value.trim();
    const due = Number(document.getElementById("memberDue").value) || 0;
    const phone = document.getElementById("memberPhone").value.trim();
    if (!name) { showMsg("⚠️ নাম আবশ্যক!", "error"); return; }

    // ডুপ্লিকেট নাম চেক (exact match, case-insensitive)
    const duplicate = membersData.find(m => m.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
        // সাজেশন তৈরি করো — নামের পাশে (২), (৩) বা ভাই/মিয়া ইত্যাদি
        const similar = membersData.filter(m => m.name.toLowerCase().startsWith(name.toLowerCase()));
        const suggestions = [
            `${name} (${similar.length + 1})`,
            `${name} ভাই`,
            `${name} মিয়া`,
            `${name} ২`,
        ].filter(s => !membersData.find(m => m.name.toLowerCase() === s.toLowerCase()));

        const suggestionHtml = suggestions.slice(0, 3).map(s =>
            `<button onclick="document.getElementById('memberName').value='${s}';document.getElementById('dupWarning').style.display='none';"
            style="margin:3px;padding:4px 12px;border-radius:6px;border:1.5px solid #e53e3e;background:#fff5f5;color:#e53e3e;cursor:pointer;font-family:var(--font);font-size:13px;">${s}</button>`
        ).join("");

        let warn = document.getElementById("dupWarning");
        if (!warn) {
            warn = document.createElement("div");
            warn.id = "dupWarning";
            document.getElementById("memberName").insertAdjacentElement("afterend", warn);
        }
        warn.style.cssText = "margin-top:6px;padding:8px 10px;background:#fff5f5;border:1.5px solid #fed7d7;border-radius:8px;font-size:13px;color:#c53030;font-family:var(--font);";
        warn.innerHTML = `⚠️ <strong>"${name}"</strong> নামে ইতোমধ্যে একজন সদস্য আছেন!<br><span style="color:#718096;font-size:12px;">ভিন্ন নাম ব্যবহার করুন। সাজেশন:</span><br>${suggestionHtml}`;
        showMsg(`❌ "${name}" নামটি আগে থেকেই আছে!`, "error");
        return;
    }

    // পুরনো warning সরাও
    const warn = document.getElementById("dupWarning");
    if (warn) warn.remove();

    try {
        const messenger_id = document.getElementById("memberMessenger").value.trim();
        await addDoc(collection(db, "members"), { name, due, phone, messenger: messenger_id, order: membersData.length });
        document.getElementById("memberName").value = "";
        document.getElementById("memberDue").value = "";
        document.getElementById("memberPhone").value = "";
        document.getElementById("memberMessenger").value = "";
        showMsg("✅ সদস্য যোগ হয়েছে!");
        addLog("👥", `নতুন সদস্য যোগ: ${name}`);
    } catch (err) {
        console.error("Member add error:", err);
        showMsg("❌ সদস্য যোগ করা যায়নি! Firebase permission চেক করুন।", "error");
    }
});

// নাম input থেকে warning সরানো
document.getElementById("memberName")?.addEventListener("input", () => {
    const warn = document.getElementById("dupWarning");
    if (warn) warn.remove();
});

document.getElementById("memberMonthFilter")?.addEventListener("change", renderMembers);

// বর্তমান মাস default সেট করুন
(function setDefaultMemberMonth() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const el = document.getElementById("memberMonthFilter");
    if (el) el.value = currentMonth;
})();

// ===== BUDGET =====
function renderBudgets() {
    const el = document.getElementById("budgetList");
    if (!el) return;
    if (!budgetData.length) {
        el.innerHTML = `<div class="section-card"><div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-text">কোনো বাজেট সেট করা নেই।</div></div></div>`;
        return;
    }
    const sorted = [...budgetData].sort((a, b) => b.month?.localeCompare(a.month || ""));
    el.innerHTML = sorted.map(b => {
        const monthData = globalData.filter(d => d.date?.startsWith(b.month));
        const actualIncome = monthData.filter(d => d.type === "income").reduce((s, d) => s + d.amount, 0);
        const actualExpense = monthData.filter(d => d.type === "expense").reduce((s, d) => s + d.amount, 0);
        const incomeGoal = b.income || 0;
        const expGoal = b.expense || 0;
        const incomeProgress = incomeGoal ? Math.min(100, Math.round(actualIncome / incomeGoal * 100)) : 0;
        const expProgress = expGoal ? Math.min(100, Math.round(actualExpense / expGoal * 100)) : 0;
        const [y, mo] = b.month.split("-");
        const monthLabel = new Date(y, mo - 1).toLocaleString("bn-BD", { year: "numeric", month: "long" });
        return `<div class="section-card budget-card">
            <div class="budget-header">
                <h3>🎯 ${monthLabel}</h3>
                ${b.note ? `<span class="budget-note-label">${b.note}</span>` : ""}
                ${isAdmin ? `<button class="del-budget-btn" data-id="${b.id}">🗑️</button>` : ""}
            </div>
            ${incomeGoal > 0 ? `<div class="budget-row">
                <div class="budget-row-label">
                    <span>📥 আয়</span>
                    <span style="color:#38a169;">৳${actualIncome.toLocaleString("bn-BD")} / ৳${incomeGoal.toLocaleString("bn-BD")}</span>
                </div>
                <div class="progress-bar"><div class="progress-fill income-fill" style="width:${incomeProgress}%">${incomeProgress}%</div></div>
            </div>` : ""}
            ${expGoal > 0 ? `<div class="budget-row">
                <div class="budget-row-label">
                    <span>📤 খরচ</span>
                    <span style="color:${expProgress > 100 ? '#e53e3e' : '#718096'};">৳${actualExpense.toLocaleString("bn-BD")} / ৳${expGoal.toLocaleString("bn-BD")}</span>
                </div>
                <div class="progress-bar"><div class="progress-fill ${expProgress > 100 ? 'over-fill' : 'expense-fill'}" style="width:${Math.min(expProgress, 100)}%">${expProgress}%</div></div>
            </div>` : ""}
        </div>`;
    }).join("");

    el.querySelectorAll(".del-budget-btn").forEach(btn => {
        btn.onclick = async () => {
            if (!confirm("বাজেট মুছবেন?")) return;
            await deleteDoc(doc(db, "budgets", btn.dataset.id));
            showMsg("🗑️ বাজেট মুছা হয়েছে।");
        };
    });
}

document.getElementById("saveBudgetBtn")?.addEventListener("click", async () => {
    const month = document.getElementById("budgetMonth").value;
    const income = Number(document.getElementById("budgetIncome").value) || 0;
    const expense = Number(document.getElementById("budgetExpense").value) || 0;
    const note = document.getElementById("budgetNote").value.trim();
    if (!month) { showMsg("⚠️ মাস বাছাই করুন!", "error"); return; }
    await setDoc(doc(db, "budgets", month), { month, income, expense, note });
    showMsg("✅ বাজেট সেভ হয়েছে!");
    addLog("🎯", `বাজেট সেট: ${month}`);
});

// ===== CHARTS =====
function renderCharts(data) {
    renderBarChart(data);
    renderPieChart(data);
}

function renderBarChart(data) {
    const canvas = document.getElementById("barChart");
    if (!canvas) return;
    const monthMap = {};
    data.forEach(d => {
        const m = d.date?.slice(0, 7);
        if (!m) return;
        if (!monthMap[m]) monthMap[m] = { income: 0, expense: 0 };
        if (d.type === "income") monthMap[m].income += d.amount || 0;
        else monthMap[m].expense += d.amount || 0;
    });
    const labels = Object.keys(monthMap).sort().slice(-6);
    const incomes = labels.map(m => monthMap[m].income);
    const expenses = labels.map(m => monthMap[m].expense);
    const labelsBn = labels.map(m => {
        const [y, mo] = m.split("-");
        return new Date(y, mo - 1).toLocaleString("bn-BD", { month: "short", year: "2-digit" });
    });
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const textColor = isDark ? "#a0aec0" : "#4a5568";
    if (barChartInstance) barChartInstance.destroy();
    barChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
            labels: labelsBn,
            datasets: [
                { label: "জমা", data: incomes, backgroundColor: "#38a16988", borderColor: "#38a169", borderWidth: 2, borderRadius: 6 },
                { label: "খরচ", data: expenses, backgroundColor: "#e53e3e88", borderColor: "#e53e3e", borderWidth: 2, borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: textColor, font: { family: "Hind Siliguri" } } } },
            scales: {
                y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => "৳" + v.toLocaleString() } },
                x: { grid: { display: false }, ticks: { color: textColor } }
            }
        }
    });
}

function renderPieChart(data) {
    const canvas = document.getElementById("pieChart");
    if (!canvas) return;
    const methodMap = {};
    data.forEach(d => {
        const m = d.category || "other";
        methodMap[m] = (methodMap[m] || 0) + (d.amount || 0);
    });
    const labels = Object.keys(methodMap).map(k => methodLabels[k] || k);
    const vals = Object.values(methodMap);
    const keys = Object.keys(methodMap);
    const colors = keys.map(k => methodColors[k] || "#718096");
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "#a0aec0" : "#4a5568";
    if (pieChartInstance) pieChartInstance.destroy();
    if (!labels.length) return;
    pieChartInstance = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{ data: vals, backgroundColor: colors, borderWidth: 2, borderColor: isDark ? "#1a1d27" : "#fff" }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: "bottom", labels: { color: textColor, font: { family: "Hind Siliguri" }, padding: 14 } },
                tooltip: { callbacks: { label: ctx => `  ৳${ctx.parsed.toLocaleString()}` } }
            }
        }
    });
}

// ===== ANIMATED COUNTER =====
function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let start = 0;
    const duration = 600;
    const step = Math.ceil(Math.abs(target) / (duration / 16));
    const interval = setInterval(() => {
        start += (target >= 0 ? step : -step);
        if ((target >= 0 && start >= target) || (target < 0 && start <= target)) {
            start = target;
            clearInterval(interval);
        }
        el.textContent = "৳ " + Math.abs(start).toLocaleString("bn-BD");
        el.style.color = target < 0 ? "#fc8181" : "";
    }, 16);
}

// ===== ADMIN COL TOGGLE =====
function updateAdminCols() {
    document.querySelectorAll(".admin-col").forEach(c => c.style.display = isAdmin ? "table-cell" : "none");
    document.querySelectorAll(".note-col").forEach(c => c.style.display = isAdmin ? "table-cell" : "none");
    document.querySelectorAll(".receipt-col").forEach(c => c.style.display = isAdmin ? "table-cell" : "none");
    document.querySelectorAll(".receipt-col").forEach(c => c.style.display = isAdmin ? "table-cell" : "none");
}

// ===== TABLE EVENTS =====
function attachTableEvents(tbody) {
    tbody.querySelectorAll(".note-view-btn").forEach(btn => {
        btn.onclick = (e) => {
            if (!isAdmin) return;
            const id = e.currentTarget.dataset.id;
            const item = globalData.find(x => x.id === id);
            if (!item) return;
            document.getElementById("noteViewMeta").innerHTML = `
                <div class="note-meta-row"><span class="note-meta-label">নাম:</span><span>${item.name}</span></div>
                <div class="note-meta-row"><span class="note-meta-label">টাকা:</span><span>${fmtAmount(item.amount)}</span></div>
                <div class="note-meta-row"><span class="note-meta-label">তারিখ:</span><span>${fmtDate(item.date)}</span></div>
                <div class="note-meta-row"><span class="note-meta-label">মাধ্যম:</span><span>${getMethodLabel(item.category)}</span></div>
                <div class="note-meta-row"><span class="note-meta-label">ধরন:</span><span>${item.type === "income" ? "🟢 জমা" : "🔴 খরচ"}</span></div>
            `;
            document.getElementById("noteViewContent").textContent = item.note || "কোনো নোট নেই।";
            document.getElementById("noteViewModal").style.display = "flex";
        };
    });

    tbody.querySelectorAll(".del-btn").forEach(btn => {
        btn.onclick = (e) => {
            pendingDeleteId = e.currentTarget.dataset.id;
            document.getElementById("confirmModal").style.display = "flex";
        };
    });

    tbody.querySelectorAll(".edit-btn").forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.dataset.id;
            const item = globalData.find(x => x.id === id);
            currentEditId = id;
            document.getElementById("editName").value = item.name || "";
            document.getElementById("editAmount").value = item.amount || "";
            document.getElementById("editDate").value = item.date || "";
            document.getElementById("editType").value = item.type || "income";
            document.getElementById("editCategory").value = item.category || "other";
            document.getElementById("editNote").value = item.note || "";
            document.getElementById("editModal").style.display = "flex";
        };
    });

    tbody.querySelectorAll(".receipt-btn").forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.dataset.id;
            const item = globalData.find(x => x.id === id);
            if (!item) return;
            exportSingleReceipt(item);
        };
    });
}

// ===== SINGLE RECEIPT PDF (বাংলা সাপোর্ট সহ) =====
function drawSignatures(ctx, canvasWidth, y) {
    // Signature section background
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.roundRect(30, y, canvasWidth - 60, 130, 10);
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Left signature — Admin
    ctx.fillStyle = "#4a5568";
    ctx.font = "14px 'Hind Siliguri', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("অ্যাডমিনের স্বাক্ষর", 150, y + 28);
    // signature line
    ctx.strokeStyle = "#2d3748";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, y + 80);
    ctx.lineTo(240, y + 80);
    ctx.stroke();
    ctx.fillStyle = "#1a202c";
    ctx.font = "bold 16px 'Hind Siliguri', sans-serif";
    ctx.fillText("রিয়াজ ইসলাম", 150, y + 100);
    ctx.fillStyle = "#718096";
    ctx.font = "13px 'Hind Siliguri', sans-serif";
    ctx.fillText("অ্যাডমিন", 150, y + 118);

    // Right signature — Sobhapati
    ctx.fillStyle = "#4a5568";
    ctx.font = "14px 'Hind Siliguri', sans-serif";
    ctx.fillText("সভাপতির স্বাক্ষর", canvasWidth - 150, y + 28);
    ctx.strokeStyle = "#2d3748";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(canvasWidth - 240, y + 80);
    ctx.lineTo(canvasWidth - 60, y + 80);
    ctx.stroke();
    ctx.fillStyle = "#1a202c";
    ctx.font = "bold 16px 'Hind Siliguri', sans-serif";
    ctx.fillText("নাঈম মৃধা", canvasWidth - 150, y + 100);
    ctx.fillStyle = "#718096";
    ctx.font = "13px 'Hind Siliguri', sans-serif";
    ctx.fillText("সভাপতি", canvasWidth - 150, y + 118);
}

function exportSingleReceipt(item) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, 140] });

    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 1050;
    const ctx = canvas.getContext("2d");

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 600, 1050);

    // Top decorative bar
    ctx.fillStyle = "#1a56db";
    ctx.fillRect(0, 0, 600, 8);

    // Header area
    const headerGrad = ctx.createLinearGradient(0, 8, 0, 110);
    headerGrad.addColorStop(0, "#1e3a8a");
    headerGrad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 8, 600, 105);

    // Logo circle
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(60, 58, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("৳", 60, 68);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px 'Hind Siliguri', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("টাকা ম্যানেজার", 110, 50);
    ctx.font = "16px 'Hind Siliguri', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("পেমেন্ট রিসিট", 110, 75);

    // Receipt number / date top right
    ctx.textAlign = "right";
    ctx.font = "13px 'Hind Siliguri', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const nowStr = new Date().toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" });
    ctx.fillText(nowStr, 575, 50);
    ctx.fillText(`ID: ${item.id?.slice(-6).toUpperCase() || "------"}`, 575, 70);

    // Status badge
    const isIncome = item.type === "income";
    const badgeColor = isIncome ? "#d1fae5" : "#fee2e2";
    const badgeText = isIncome ? "✓  টাকা জমা" : "✗  টাকা খরচ";
    const badgeFg = isIncome ? "#065f46" : "#991b1b";
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.roundRect(200, 125, 200, 38, 19);
    ctx.fill();
    ctx.fillStyle = badgeFg;
    ctx.font = "bold 17px 'Hind Siliguri', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(badgeText, 300, 149);

    // Big amount
    ctx.fillStyle = isIncome ? "#047857" : "#dc2626";
    ctx.font = "bold 58px 'Hind Siliguri', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`৳ ${Number(item.amount).toLocaleString("bn-BD")}`, 300, 240);

    // Dashed divider
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(30, 265);
    ctx.lineTo(570, 265);
    ctx.stroke();
    ctx.setLineDash([]);

    // Scissor icon on divider
    ctx.fillStyle = "#94a3b8";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("✂", 14, 270);

    // Info rows (no note)
    const infoRows = [
        ["👤  নাম / বিবরণ", item.name || "—"],
        ["📅  তারিখ", fmtDate(item.date)],
        ["💳  পেমেন্ট মাধ্যম", getMethodLabel(item.category).replace(/📱|💵|🏦|📦/g, "").trim()],
    ];

    ctx.textAlign = "left";
    infoRows.forEach((row, i) => {
        const y = 295 + i * 75;
        // card bg
        const cardGrad = ctx.createLinearGradient(30, y - 5, 570, y + 55);
        cardGrad.addColorStop(0, "#f8fafc");
        cardGrad.addColorStop(1, "#f1f5f9");
        ctx.fillStyle = cardGrad;
        ctx.beginPath();
        ctx.roundRect(30, y - 5, 540, 60, 10);
        ctx.fill();
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.stroke();
        // left accent bar
        ctx.fillStyle = isIncome ? "#10b981" : "#ef4444";
        ctx.beginPath();
        ctx.roundRect(30, y - 5, 5, 60, [3, 0, 0, 3]);
        ctx.fill();

        ctx.fillStyle = "#64748b";
        ctx.font = "14px 'Hind Siliguri', sans-serif";
        ctx.fillText(row[0], 50, y + 16);
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 20px 'Hind Siliguri', sans-serif";
        ctx.fillText(row[1], 50, y + 42);
    });

    // Signatures
    const sigY = 530;
    drawSignatures(ctx, 600, sigY);

    // Bottom footer
    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(0, 690, 600, 50);
    ctx.fillStyle = "#ffffff";
    ctx.font = "13px 'Hind Siliguri', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("টাকা ম্যানেজার — Money Management App", 300, 712);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "12px 'Hind Siliguri', sans-serif";
    ctx.fillText(`মুদ্রণের সময়: ${new Date().toLocaleString("bn-BD")}`, 300, 730);

    // Bottom blue bar
    ctx.fillStyle = "#1a56db";
    ctx.fillRect(0, 740, 600, 8);

    const imgData = canvas.toDataURL("image/png");
    doc.addImage(imgData, "PNG", 0, 0, 80, 140);

    const filename = `receipt-${item.name?.replace(/\s/g, "-") || "entry"}-${item.date || "date"}.pdf`;
    doc.save(filename);
    showMsg("🧾 রিসিট ডাউনলোড হচ্ছে!", "info");
}

// ===== PDF EXPORT =====
function exportToPDFWithBangla(rows, title, type) {
    const { jsPDF } = window.jspdf;

    // ── A4 portrait dimensions in px at 96dpi equivalent
    // A4 = 210mm × 297mm. We use 794×1123 canvas (≈ 96dpi A4 portrait)
    const CW = 794;   // canvas width  — matches A4 portrait width
    const CH = 1123;  // canvas height — matches A4 portrait height (one page)

    const MARGIN = 28;   // left/right margin
    const TW = CW - MARGIN * 2;  // table usable width = 738
    const ROW_H = 30;
    const HDR_H = 118;  // header section height
    const THDR_H = 32;   // table-header row height

    const isIncome = type === "income";
    const accentCol = isIncome ? "#059669" : "#dc2626";
    const accentDark = isIncome ? "#065f46" : "#991b1b";
    const accentLite = isIncome ? "#d1fae5" : "#fee2e2";

    const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
    const dateStr = new Date().toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" });

    // Column layout — widths must sum to TW (738)
    // [নাম, টাকা, তারিখ, মাধ্যম, ধরন]
    const COL_W = [220, 130, 120, 140, 128]; // sum = 738 ✓
    const COL_X = COL_W.reduce((acc, w, i) => {
        acc.push(i === 0 ? MARGIN : acc[i - 1] + COL_W[i - 1]);
        return acc;
    }, []);
    const HEADERS = ["নাম / বিবরণ", "টাকা", "তারিখ", "মাধ্যম", "ধরন"];

    // ── How many rows fit per page after the first-page header
    const firstPageBodyH = CH - HDR_H - THDR_H - 40 - 60; // 40=summary, 60=footer+sig
    const otherPageBodyH = CH - THDR_H - 40 - 60;
    const rowsPerFirst = Math.max(1, Math.floor(firstPageBodyH / ROW_H));
    const rowsPerOther = Math.max(1, Math.floor(otherPageBodyH / ROW_H));

    // Split rows into pages
    const pages = [];
    let remaining = [...rows];
    pages.push(remaining.splice(0, rowsPerFirst));
    while (remaining.length > 0) pages.push(remaining.splice(0, rowsPerOther));

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfW = doc.internal.pageSize.getWidth();   // 210mm
    const pdfH = doc.internal.pageSize.getHeight();  // 297mm
    const scale = pdfW / CW; // mm per canvas-px

    // ────────────────────────────────────────────────
    function drawPageCanvas(pageRows, pageIdx, totalPages) {
        const canvas = document.createElement("canvas");
        canvas.width = CW;
        canvas.height = CH;
        const ctx = canvas.getContext("2d");

        // Background
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, CW, CH);

        let curY = 0;

        // ── PAGE 1: draw big header
        if (pageIdx === 0) {
            // gradient header band
            const grad = ctx.createLinearGradient(0, 0, CW, HDR_H);
            grad.addColorStop(0, accentDark);
            grad.addColorStop(1, accentCol);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, CW, HDR_H);

            // decorative circles
            ctx.fillStyle = "rgba(255,255,255,0.07)";
            ctx.beginPath(); ctx.arc(60, 0, 80, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(CW - 70, HDR_H, 100, 0, Math.PI * 2); ctx.fill();

            // logo circle
            ctx.fillStyle = "rgba(255,255,255,0.18)";
            ctx.beginPath(); ctx.arc(60, 60, 34, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 30px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("৳", 60, 72);

            // app name + report title
            ctx.textAlign = "left";
            ctx.fillStyle = "#fff";
            ctx.font = "bold 28px 'Hind Siliguri',sans-serif";
            ctx.fillText("টাকা ম্যানেজার", 110, 48);
            ctx.font = "17px 'Hind Siliguri',sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.fillText(title, 112, 74);

            // right-side stats
            ctx.textAlign = "right";
            ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.font = "13px 'Hind Siliguri',sans-serif";
            ctx.fillText(`তারিখ: ${dateStr}`, CW - MARGIN, 38);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 14px 'Hind Siliguri',sans-serif";
            ctx.fillText(`মোট এন্ট্রি: ${rows.length} টি`, CW - MARGIN, 62);
            ctx.font = "bold 20px 'Hind Siliguri',sans-serif";
            ctx.fillStyle = accentLite;
            ctx.fillText(`মোট: ৳${total.toLocaleString("bn-BD")}`, CW - MARGIN, 94);

            // top accent bar
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillRect(0, 0, CW, 6);

            curY = HDR_H;
        } else {
            // continuation pages — small header bar
            ctx.fillStyle = accentDark;
            ctx.fillRect(0, 0, CW, 40);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 16px 'Hind Siliguri',sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(`টাকা ম্যানেজার — ${title}`, MARGIN, 26);
            ctx.textAlign = "right";
            ctx.font = "13px 'Hind Siliguri',sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.fillText(`পৃষ্ঠা ${pageIdx + 1} / ${totalPages}`, CW - MARGIN, 26);
            curY = 40;
        }

        // ── Table header
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, curY, CW, THDR_H);
        ctx.fillStyle = "#f1f5f9";
        ctx.font = "bold 13px 'Hind Siliguri',sans-serif";
        ctx.textAlign = "left";
        HEADERS.forEach((h, i) => {
            ctx.fillText(h, COL_X[i] + 8, curY + 21);
        });
        // header col separators
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        COL_X.slice(1).forEach(x => {
            ctx.beginPath(); ctx.moveTo(x, curY + 2); ctx.lineTo(x, curY + THDR_H - 2); ctx.stroke();
        });
        curY += THDR_H;

        // ── Data rows
        pageRows.forEach((d, idx) => {
            const rowY = curY + idx * ROW_H;
            const rowIsInc = d.type === "income";

            // alternating bg
            ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#f1f5f9";
            ctx.fillRect(0, rowY, CW, ROW_H);

            // left accent stripe
            ctx.fillStyle = rowIsInc ? "#10b98133" : "#ef444433";
            ctx.fillRect(0, rowY, 5, ROW_H);

            // bottom grid line
            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(0, rowY + ROW_H); ctx.lineTo(CW, rowY + ROW_H); ctx.stroke();

            // col separators
            COL_X.slice(1).forEach(x => {
                ctx.beginPath(); ctx.moveTo(x, rowY); ctx.lineTo(x, rowY + ROW_H); ctx.stroke();
            });

            const amtColor = rowIsInc ? "#059669" : "#dc2626";
            const cells = [
                { text: (d.name || "—").substring(0, 26), color: "#0f172a", bold: true },
                { text: `৳${Number(d.amount).toLocaleString("bn-BD")}`, color: amtColor, bold: true },
                { text: fmtDate(d.date), color: "#475569", bold: false },
                { text: getMethodLabel(d.category).replace(/[📱💵🏦📦]/g, "").trim(), color: "#475569", bold: false },
                { text: rowIsInc ? "জমা ↑" : "খরচ ↓", color: amtColor, bold: true },
            ];
            cells.forEach((cell, i) => {
                ctx.fillStyle = cell.color;
                ctx.font = (cell.bold ? "bold " : "") + "13px 'Hind Siliguri',sans-serif";
                ctx.textAlign = "left";
                ctx.fillText(cell.text, COL_X[i] + 8, rowY + 20);
            });
        });

        curY += pageRows.length * ROW_H;

        // ── Summary bar (last page only)
        const isLastPage = pageIdx === totalPages - 1;
        if (isLastPage) {
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(0, curY, CW, 36);
            ctx.textAlign = "left";
            ctx.fillStyle = "#94a3b8";
            ctx.font = "bold 13px 'Hind Siliguri',sans-serif";
            ctx.fillText(`মোট ${rows.length} টি লেনদেন`, MARGIN + 4, curY + 23);
            ctx.textAlign = "right";
            ctx.fillStyle = accentLite;
            ctx.font = "bold 15px 'Hind Siliguri',sans-serif";
            ctx.fillText(`সর্বমোট: ৳${total.toLocaleString("bn-BD")}`, CW - MARGIN, curY + 23);
            curY += 36;

            // ── Signatures
            drawSignatures(ctx, CW, curY + 16);
            curY += 170;
        }

        // ── Footer bar — always at bottom of page
        const footY = CH - 50;
        ctx.fillStyle = accentDark;
        ctx.fillRect(0, footY, CW, 43);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = "13px 'Hind Siliguri',sans-serif";
        ctx.fillText("টাকা ম্যানেজার — Money Management App", CW / 2, footY + 17);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "11px 'Hind Siliguri',sans-serif";
        ctx.fillText(`মুদ্রণের সময়: ${new Date().toLocaleString("bn-BD")}  |  পৃষ্ঠা ${pageIdx + 1} / ${totalPages}`, CW / 2, footY + 33);
        // accent bottom stripe
        ctx.fillStyle = accentCol;
        ctx.fillRect(0, CH - 7, CW, 7);

        return canvas;
    }
    // ────────────────────────────────────────────────

    pages.forEach((pageRows, pageIdx) => {
        if (pageIdx > 0) doc.addPage();
        const canvas = drawPageCanvas(pageRows, pageIdx, pages.length);
        // Each canvas is exactly CW×CH → maps to full A4 page
        doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pdfW, pdfH);
    });

    const filename = `${isIncome ? "joma" : "khoroch"}-talika-${new Date().toLocaleDateString("en")}.pdf`;
    doc.save(filename);
    addLog("🖨️", `${title} PDF ডাউনলোড করা হয়েছে।`);
    showMsg("📄 PDF ডাউনলোড হচ্ছে!", "info");
}

// ===== PDF BUTTONS =====
document.getElementById("pdfIncomeBtn").onclick = () => {
    const income = getFilteredData().filter(d => d.type === "income");
    exportToPDFWithBangla(income, "জমার তালিকা", "income");
};

document.getElementById("pdfExpenseBtn").onclick = () => {
    const expense = getFilteredData().filter(d => d.type === "expense");
    exportToPDFWithBangla(expense, "খরচের তালিকা", "expense");
};

document.getElementById("pdfIncomeFullBtn").onclick = () => {
    const income = globalData.filter(d => d.type === "income");
    exportToPDFWithBangla(income, "সকল জমার তালিকা", "income");
};

document.getElementById("pdfExpenseFullBtn").onclick = () => {
    const expense = globalData.filter(d => d.type === "expense");
    exportToPDFWithBangla(expense, "সকল খরচের তালিকা", "expense");
};

// ===== EXPORT CSV =====
document.getElementById("exportCSV").onclick = () => {
    const data = getFilteredData();
    const rows = [["নাম", "টাকা", "তারিখ", "ধরন", "পেমেন্ট মাধ্যম", "নোট"]];
    data.forEach(d => rows.push([d.name, d.amount, d.date, d.type === "income" ? "জমা" : "খরচ", getMethodLabel(d.category), d.note || ""]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `taka-report-${new Date().toLocaleDateString("en")}.csv`;
    a.click();
    addLog("📊", "CSV রিপোর্ট ডাউনলোড করা হয়েছে।");
    showMsg("📊 CSV ডাউনলোড হচ্ছে!", "info");
};

// ===== TABLE CSV EXPORT =====
document.getElementById("exportIncomeBtn").onclick = () => {
    const income = getFilteredData().filter(d => d.type === "income");
    exportTableCSV(income, "joma-talika");
};
document.getElementById("exportExpenseBtn").onclick = () => {
    const expense = getFilteredData().filter(d => d.type === "expense");
    exportTableCSV(expense, "khoroch-talika");
};
document.getElementById("exportIncomeFullBtn").onclick = () => {
    const income = globalData.filter(d => d.type === "income");
    exportTableCSV(income, "joma-full");
};
document.getElementById("exportExpenseFullBtn").onclick = () => {
    const expense = globalData.filter(d => d.type === "expense");
    exportTableCSV(expense, "khoroch-full");
};

function exportTableCSV(rows, filename) {
    const csvRows = [["নাম", "টাকা", "তারিখ", "পেমেন্ট মাধ্যম", "নোট"]];
    rows.forEach(d => csvRows.push([d.name, d.amount, fmtDate(d.date), getMethodLabel(d.category), d.note || ""]));
    const csv = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-${new Date().toLocaleDateString("en")}.csv`;
    a.click();
    showMsg("⬇️ CSV ডাউনলোড হচ্ছে!", "info");
}

// ===== FULL PDF (REPORT PAGE - বাংলা সাপোর্ট) =====
document.getElementById("exportPDF").onclick = () => {
    const all = globalData;
    exportToPDFWithBangla(all, "সম্পূর্ণ রিপোর্ট — সকল লেনদেন", "income");
};

document.getElementById("printReport").onclick = () => window.print();

// ===== WHATSAPP NOTIFICATION =====
function showWhatsAppModal(entry) {
    const msg = `🎉 নতুন পেমেন্ট হয়েছে!\n\nনাম: ${entry.name}\nটাকা: ৳${Number(entry.amount).toLocaleString()}\nমাধ্যম: ${getMethodLabel(entry.category)}\nতারিখ: ${entry.date}\n\nটাকা ম্যানেজার অ্যাপ`;
    document.getElementById("whatsappMsgPreview").textContent = msg;
    pendingEntryForWA = entry;

    // সদস্যের ফোন নম্বর auto-fill করো
    const member = membersData.find(m => m.name.toLowerCase() === entry.name.toLowerCase());
    const memberPhone = member?.phone || "";
    const waInput = document.getElementById("waPhoneInput");
    if (memberPhone) {
        waInput.value = `88${memberPhone}`;
    }

    document.getElementById("whatsappModal").style.display = "flex";

    document.getElementById("waSendLink").onclick = () => {
        const phone = document.getElementById("waPhoneInput").value.trim();
        const encoded = encodeURIComponent(msg);
        document.getElementById("waSendLink").href = `https://wa.me/${phone}?text=${encoded}`;
        setTimeout(() => { document.getElementById("whatsappModal").style.display = "none"; }, 500);
    };
}

document.getElementById("waSkip")?.addEventListener("click", () => {
    document.getElementById("whatsappModal").style.display = "none";
});

// ===== ADD DATA =====
document.getElementById("saveBtn").onclick = async () => {
    const name = document.getElementById("name").value.trim();
    const amount = document.getElementById("amount").value;
    const date = document.getElementById("date").value;
    const type = document.getElementById("type").value;
    const category = document.getElementById("category").value;
    const note = document.getElementById("note").value.trim();
    const notifyWA = document.getElementById("whatsappNotify").value;
    if (!name || !amount || !date) { showMsg("⚠️ নাম, টাকা ও তারিখ আবশ্যক!", "error"); return; }
    try {
        const entry = { name, amount: Number(amount), date, type, category, note, time: serverTimestamp() };
        await addDoc(collection(db, "moneyList"), entry);
        document.getElementById("name").value = "";
        document.getElementById("amount").value = "";
        document.getElementById("note").value = "";
        addLog("➕", `নতুন এন্ট্রি: "${name}" — ${fmtAmount(amount)} (${getMethodLabel(category)})`);
        showMsg("✅ সফলভাবে যোগ হয়েছে!", "success");

        // নতুন নাম হলে সদস্য তালিকায় যোগ করার অফার
        if (type === "income") {
            const existingMember = membersData.find(m => m.name.trim().toLowerCase() === name.toLowerCase());
            if (!existingMember) {
                showAddMemberPrompt(name);
            }
        }

        if (notifyWA === "yes") {
            showWhatsAppModal({ name, amount: Number(amount), date, type, category, note });
        } else if (notifyWA === "messenger") {
            showMessengerModal({ name, amount: Number(amount), date, category });
        }
    } catch { showMsg("❌ যোগ করা যায়নি!", "error"); }
};

// নতুন নাম পাওয়া গেলে সদস্য যোগের popup
function showAddMemberPrompt(name) {
    let el = document.getElementById("addMemberPrompt");
    if (el) el.remove();
    el = document.createElement("div");
    el.id = "addMemberPrompt";
    el.style.cssText = `position:fixed;bottom:80px;right:20px;z-index:9998;background:var(--card-bg);border:1.5px solid #3182ce;border-radius:12px;padding:14px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-family:var(--font);max-width:300px;`;
    el.innerHTML = `<div style="font-size:14px;font-weight:600;margin-bottom:8px;">👤 নতুন নাম পাওয়া গেছে!</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">"<strong>${name}</strong>" সদস্য তালিকায় নেই। যোগ করবেন?</div>
        <div style="display:flex;gap:8px;">
            <button id="addMemberYes" style="background:#3182ce;color:#fff;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-family:var(--font);font-size:13px;font-weight:600;">✅ যোগ করুন</button>
            <button id="addMemberNo" style="background:var(--bg3);border:1.5px solid var(--border);padding:6px 14px;border-radius:8px;cursor:pointer;font-family:var(--font);font-size:13px;">না</button>
        </div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 15000); // ১৫ সেকেন্ড পর auto close

    document.getElementById("addMemberYes").onclick = async () => {
        try {
            await addDoc(collection(db, "members"), { name, due: 0, phone: "", messenger: "", order: membersData.length });
            showMsg(`✅ "${name}" সদস্য তালিকায় যোগ হয়েছে!`, "success");
            addLog("👥", `স্বয়ংক্রিয় সদস্য যোগ: ${name}`);
        } catch { showMsg("❌ সদস্য যোগ করা যায়নি!", "error"); }
        el.remove();
    };
    document.getElementById("addMemberNo").onclick = () => el.remove();
}

// Messenger notification modal
function showMessengerModal(entry) {
    const member = membersData.find(m => m.name.trim().toLowerCase() === entry.name.toLowerCase());
    const messenger = member?.messenger || "";
    const phone = member?.phone || "";
    const msg = `🎉 নতুন পেমেন্ট হয়েছে!\n\nনাম: ${entry.name}\nটাকা: ৳${Number(entry.amount).toLocaleString()}\nমাধ্যম: ${getMethodLabel(entry.category)}\nতারিখ: ${entry.date}\n\nটাকা ম্যানেজার অ্যাপ`;

    // Show preview in modal
    document.getElementById("messengerMsgPreview").textContent = msg;

    // Auto-fill messenger ID or phone
    const msgrInput = document.getElementById("msgrIdInput");
    if (messenger) {
        msgrInput.value = messenger;
    } else if (phone) {
        msgrInput.value = `88${phone}`;
    } else {
        msgrInput.value = "";
    }

    document.getElementById("messengerModal").style.display = "flex";

    document.getElementById("msgrSendLink").onclick = () => {
        const id = document.getElementById("msgrIdInput").value.trim();
        if (!id) { showMsg("⚠️ Messenger ID বা ফোন দিন!", "error"); return; }
        const encoded = encodeURIComponent(msg);
        document.getElementById("msgrSendLink").href = `https://m.me/${id}?text=${encoded}`;
        setTimeout(() => { document.getElementById("messengerModal").style.display = "none"; }, 500);
    };
}

document.getElementById("msgrSkip")?.addEventListener("click", () => {
    document.getElementById("messengerModal").style.display = "none";
});

// ===== UPDATE DATA =====
document.getElementById("updateBtn").onclick = async () => {
    const name = document.getElementById("editName").value.trim();
    const amount = document.getElementById("editAmount").value;
    const date = document.getElementById("editDate").value;
    const type = document.getElementById("editType").value;
    const category = document.getElementById("editCategory").value;
    const note = document.getElementById("editNote").value.trim();
    try {
        await updateDoc(doc(db, "moneyList", currentEditId), { name, amount: Number(amount), date, type, category, note });
        document.getElementById("editModal").style.display = "none";
        addLog("✏️", `"${name}" আপডেট করা হয়েছে।`);
        showMsg("✅ আপডেট সফল!", "success");
    } catch { showMsg("❌ আপডেট হয়নি!", "error"); }
};

// ===== CONFIRM DELETE =====
document.getElementById("confirmDelete").onclick = async () => {
    if (!pendingDeleteId) return;
    try {
        const item = globalData.find(x => x.id === pendingDeleteId);
        await deleteDoc(doc(db, "moneyList", pendingDeleteId));
        addLog("🗑️", `"${item?.name || "এন্ট্রি"}" ডিলিট করা হয়েছে।`);
        showMsg("🗑️ ডিলিট সফল!", "success");
    } catch { showMsg("❌ ডিলিট করা যায়নি!", "error"); }
    document.getElementById("confirmModal").style.display = "none";
    pendingDeleteId = null;
};

document.getElementById("confirmCancel").onclick = () => {
    document.getElementById("confirmModal").style.display = "none";
    pendingDeleteId = null;
};

// ===== DARK MODE =====
const themeBtn = document.getElementById("themeToggle");
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeBtn.textContent = theme === "dark" ? "☀️ লাইট মোড" : "🌙 ডার্ক মোড";
    localStorage.setItem("theme", theme);
    setTimeout(() => renderCharts(globalData), 100);
}
themeBtn.onclick = () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
};
applyTheme(localStorage.getItem("theme") || "light");

// ===== SIDEBAR NAVIGATION =====
function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add("active");
    const navEl = document.querySelector(`[data-page="${page}"]`);
    if (navEl) navEl.classList.add("active");
    const titles = {
        dashboard: "ড্যাশবোর্ড",
        income: "জমার তালিকা",
        expense: "খরচের তালিকা",
        members: "সদস্য তালিকা",
        budget: "বাজেট প্ল্যানার",
        report: "রিপোর্ট ও চার্ট",
        payment: "পেমেন্ট",
        log: "অ্যাক্টিভিটি লগ"
    };
    document.querySelector(".topbar-title").textContent = titles[page] || page;
    if (window.innerWidth <= 900) {
        document.getElementById("sidebar").classList.remove("open");
        document.getElementById("overlay").classList.remove("show");
    }
    if (page === "report") setTimeout(() => renderCharts(globalData), 50);
    if (page === "members") renderMembers();
    if (page === "budget") renderBudgets();
}

document.querySelectorAll(".nav-item").forEach(item => {
    item.onclick = (e) => { e.preventDefault(); navigateTo(item.dataset.page); };
});

// ===== HAMBURGER =====
const hamburger = document.getElementById("hamburger");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const sidebarClose = document.getElementById("sidebarClose");
function openSidebar() { sidebar.classList.add("open"); overlay.classList.add("show"); }
function closeSidebar() { sidebar.classList.remove("open"); overlay.classList.remove("show"); }
hamburger.onclick = openSidebar;
sidebarClose.onclick = closeSidebar;
overlay.onclick = closeSidebar;

// ===== MODAL CONTROLS =====
document.getElementById("adminBtn").onclick = () => document.getElementById("loginModal").style.display = "flex";
document.getElementById("closeModal").onclick = () => document.getElementById("loginModal").style.display = "none";
document.getElementById("closeEditModal").onclick = () => document.getElementById("editModal").style.display = "none";
document.getElementById("closeNoteView").onclick = () => document.getElementById("noteViewModal").style.display = "none";
document.getElementById("noteViewModal").onclick = (e) => {
    if (e.target === document.getElementById("noteViewModal")) document.getElementById("noteViewModal").style.display = "none";
};

// ===== PAYMENT COPY =====
document.getElementById("paymentCopyArea").onclick = () => {
    navigator.clipboard.writeText("01893454283").then(() => showMsg("📋 নাম্বার কপি হয়েছে!", "success"));
};

// ===== RESPONSIVE RESIZE =====
let resizeTimer;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (document.getElementById("page-members")?.classList.contains("active")) {
            renderMembers();
        }
    }, 200);
});
