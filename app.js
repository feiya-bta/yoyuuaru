// ==========================================
// 1. デフォルトデータ & 初期化
// ==========================================
const DEFAULT_DATA = {
    budget: {},   // { "2026-07": 50000 }
    categories: [
        { id: 1, name: "食費" },
        { id: 2, name: "日用品" },
        { id: 3, name: "交通費" },
        { id: 4, name: "娯楽" },
        { id: 5, name: "医療" },
        { id: 6, name: "その他" }
    ],
    nextCategoryId: 7,
    expenses: []  // { id, amount, categoryId, memo, datetime, dateKey, monthKey }
};

let appData = JSON.parse(localStorage.getItem("yoyu_aru_data")) || JSON.parse(JSON.stringify(DEFAULT_DATA));
if (!appData.budget) appData.budget = {};
if (!appData.categories || appData.categories.length === 0) appData.categories = JSON.parse(JSON.stringify(DEFAULT_DATA.categories));
if (!appData.expenses) appData.expenses = [];
if (!appData.nextCategoryId) {
    appData.nextCategoryId = Math.max(0, ...appData.categories.map(c => c.id)) + 1;
}

let categoryFormMode = "add"; // "add" | "edit"

// HTML にユーザー入力を差し込む前に必ず通す（XSS 対策）
function escapeHtml(value) {
    const str = String(value === undefined || value === null ? "" : value);
    return str.replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[ch]));
}

// 簡易サウンド（Web Audio なので音源ファイル不要）
let audioCtx = null;
function playTone(freq, duration, type = "sine", volume = 0.12) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const t = audioCtx.currentTime;
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.start(t);
        osc.stop(t + duration);
    } catch (e) { /* 音が出せない環境は無視 */ }
}
function playPop() { playTone(520, 0.08, "triangle", 0.1); }
function playCoin() { playTone(880, 0.12, "sine", 0.1); setTimeout(() => playTone(1318, 0.14, "sine", 0.1), 90); }
function vibrate(ms = 18) { if (navigator.vibrate) navigator.vibrate(ms); }

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
    initRoomSystem();
});

function initApp() {
    saveData();
    renderPeriodLabel();
    renderBudgetSummary();
    renderExpenseTimeline();
    renderCategorySelect();
    renderCategoryManageList();
    renderBudgetInputValue();
}

function saveData() {
    localStorage.setItem("yoyu_aru_data", JSON.stringify(appData));
}

// ==========================================
// 2. 年月ユーティリティ
// ==========================================
function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentPeriodLabel() {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月の予算`;
}

function renderPeriodLabel() {
    const label = document.getElementById("budget-period-label");
    if (label) label.textContent = getCurrentPeriodLabel();
}

// ==========================================
// 3. 予算サマリー
// ==========================================
function renderBudgetSummary() {
    const monthKey = getCurrentMonthKey();
    const budget = appData.budget[monthKey] || 0;
    const spent = appData.expenses
        .filter(e => e.monthKey === monthKey)
        .reduce((sum, e) => sum + e.amount, 0);

    const summarySpent = document.getElementById("summary-spent");
    const summaryBudget = document.getElementById("summary-budget");
    const remainingText = document.getElementById("budget-remaining-text");
    const progressFill = document.getElementById("budget-progress-fill");
    const budgetBox = document.getElementById("budget-box");
    const fab = document.getElementById("fab-add-expense");
    const btnEditBudget = document.getElementById("btn-edit-budget");
    const usagePercent = document.getElementById("budget-usage-percent");

    if (fab) fab.classList.toggle("needs-budget", budget <= 0);

    if (btnEditBudget) {
        btnEditBudget.style.display = budget > 0 ? "none" : "inline-flex";
    }

    if (summarySpent) summarySpent.textContent = spent.toLocaleString();
    if (summaryBudget) summaryBudget.textContent = budget.toLocaleString();

    if (budgetBox) budgetBox.classList.remove("state-warn", "state-over");

    if (budget <= 0) {
        if (remainingText) remainingText.textContent = "予算が未設定です";
        if (progressFill) progressFill.style.width = "0%";
        refreshPetMood();
        return;
    }

    const ratio = spent / budget;
    const percent = Math.min(ratio * 100, 100);
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (usagePercent) usagePercent.textContent = `${Math.round((spent / budget) * 100)}%`;

    const remaining = budget - spent;
    if (remainingText) {
        remainingText.textContent = remaining >= 0
            ? `残り ${remaining.toLocaleString()} 円`
            : `予算を ${Math.abs(remaining).toLocaleString()} 円 超過しています`;
    }

    if (budgetBox) {
        if (ratio > 1) budgetBox.classList.add("state-over");
        else if (ratio >= 0.8) budgetBox.classList.add("state-warn");
    }

    refreshPetMood();
}

function renderBudgetInputValue() {
    const monthKey = getCurrentMonthKey();
    const budgetInput = document.getElementById("budget-input");
    if (budgetInput) budgetInput.value = appData.budget[monthKey] || "";
}

// ==========================================
// 4. カテゴリー管理
// ==========================================
function getCategoryById(id) {
    return appData.categories.find(c => c.id === id);
}

function renderCategorySelect() {
    const select = document.getElementById("expense-category");
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = appData.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    if (appData.categories.some(c => String(c.id) === prevValue)) select.value = prevValue;
}

function renderCategoryManageList() {
    const list = document.getElementById("category-manage-list");
    if (!list) return;
    list.innerHTML = "";
    appData.categories.forEach(cat => {
        const row = document.createElement("div");
        row.className = "category-manage-row";
        row.innerHTML = `
            <span class="category-manage-name">${escapeHtml(cat.name)}</span>
            <span class="category-manage-actions">
                <span class="material-icons-round" onclick="startEditCategory(${cat.id})">edit</span>
                <span class="material-icons-round delete-icon" onclick="deleteCategoryById(${cat.id})">delete</span>
            </span>
        `;
        list.appendChild(row);
    });
}

function openCategoryForm(mode) {
    categoryFormMode = mode;
    const form = document.getElementById("category-edit-form");
    const saveBtn = document.getElementById("btn-save-category");
    if (form) form.classList.add("open");
    if (saveBtn) saveBtn.textContent = mode === "edit" ? "更新する" : "追加する";
}

function closeCategoryForm() {
    const form = document.getElementById("category-edit-form");
    if (form) form.classList.remove("open");
    document.getElementById("cat-edit-id").value = "";
    document.getElementById("cat-form-name").value = "";
}

window.startEditCategory = function (id) {
    const cat = getCategoryById(id);
    if (!cat) return;
    document.getElementById("cat-edit-id").value = cat.id;
    document.getElementById("cat-form-name").value = cat.name;
    openCategoryForm("edit");
};

window.deleteCategoryById = function (id) {
    if (appData.categories.length <= 1) {
        alert("カテゴリーは最低1つ必要です。");
        return;
    }
    const cat = getCategoryById(id);
    if (!cat) return;
    if (!confirm(`「${cat.name}」を削除しますか？\n記録済みの支出は残りのカテゴリーに移動されます。`)) return;

    appData.categories = appData.categories.filter(c => c.id !== id);
    const fallbackId = appData.categories[0].id;
    appData.expenses.forEach(e => {
        if (e.categoryId === id) e.categoryId = fallbackId;
    });

    saveData();
    renderCategoryManageList();
    renderCategorySelect();
    renderExpenseTimeline();
    closeCategoryForm();
};

// ==========================================
// 5. 支出タイムライン
// ==========================================
function renderExpenseTimeline() {
    renderBreakdown();
    renderRoomLevel();
    const container = document.getElementById("expense-timeline");
    if (!container) return;
    container.innerHTML = "";

    const monthKey = getCurrentMonthKey();
    const monthExpenses = appData.expenses.filter(e => e.monthKey === monthKey);

    if (monthExpenses.length === 0) {
        container.innerHTML = `<p class="timeline-empty-hint">今月の支出はまだ記録されていません</p>`;
        return;
    }

    monthExpenses.sort((a, b) => b.datetime.localeCompare(a.datetime));

    let lastDateKey = null;
    monthExpenses.forEach(exp => {
        const cat = getCategoryById(exp.categoryId) || { name: "不明" };

        if (exp.dateKey !== lastDateKey) {
            lastDateKey = exp.dateKey;
            const divider = document.createElement("div");
            divider.className = "timeline-date-divider";
            divider.innerHTML = `<span>${formatDateLabel(exp.datetime)}</span>`;
            container.appendChild(divider);
        }

        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <div class="card-info">
                <span class="category-badge">${escapeHtml(cat.name)}</span>
                <div class="card-body">
                    ${exp.memo ? `<h4>${escapeHtml(exp.memo)}</h4>` : ""}
                </div>
                <span class="badge-time">${formatTimeLabel(exp.datetime)}</span>
            </div>
            <div class="card-right">
                <span class="main-amount">${exp.amount.toLocaleString()} 円</span>
                <div class="card-actions">
                    <span class="material-icons-round" onclick="editExpense(${exp.id})" title="編集">edit</span>
                    <span class="material-icons-round delete-icon" onclick="deleteExpense(${exp.id})" title="削除">delete</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderBreakdown() {
    const list = document.getElementById("breakdown-list");
    if (!list) return;
    list.innerHTML = "";

    const monthKey = getCurrentMonthKey();
    const monthExpenses = appData.expenses.filter(e => e.monthKey === monthKey);
    if (monthExpenses.length === 0) {
        list.innerHTML = `<p class="breakdown-empty">今月の支出はまだありません</p>`;
        return;
    }

    const totals = {};
    monthExpenses.forEach(e => { totals[e.categoryId] = (totals[e.categoryId] || 0) + e.amount; });
    const entries = Object.entries(totals)
        .map(([cid, amt]) => ({ cat: getCategoryById(parseInt(cid)) || { name: "不明" }, amt }))
        .sort((a, b) => b.amt - a.amt);

    const max = entries[0].amt;
    entries.forEach(({ cat, amt }) => {
        const pct = Math.max(4, Math.round((amt / max) * 100));
        const row = document.createElement("div");
        row.className = "breakdown-row";
        row.innerHTML = `
            <span class="breakdown-label">${escapeHtml(cat.name)}</span>
            <span class="breakdown-track"><span class="breakdown-fill" style="width:${pct}%"></span></span>
            <span class="breakdown-value">${amt.toLocaleString()} 円</span>
        `;
        list.appendChild(row);
    });
}

function getRoomLevel() {
    return Math.min(99, Math.floor(appData.expenses.length / 5) + 1);
}
function renderRoomLevel() {
    const el = document.getElementById("room-level");
    if (el) el.textContent = "Lv." + getRoomLevel();
}

function formatDateLabel(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(d);
}

function formatTimeLabel(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function formatFullDateTimeLabel(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

// ==========================================
// 6. 支出フォーム検証
// ==========================================
function validateExpenseInput() {
    const amountInput = document.getElementById("expense-amount");
    const btnSave = document.getElementById("btn-save-expense");
    if (!amountInput || !btnSave) return;
    const amount = parseFloat(amountInput.value);
    btnSave.disabled = isNaN(amount) || amount <= 0;
}

// ==========================================
// 7. イベントリスナー
// ==========================================
function showToast(message) {
    if (typeof petSay === "function") {
        petSay(message);
    } else {
        let toast = document.getElementById("app-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "app-toast";
            toast.className = "app-toast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    }
}

function ensureBudgetIsSet() {
    const monthKey = getCurrentMonthKey();
    if ((appData.budget[monthKey] || 0) > 0) return true;

    const budgetBox = document.getElementById("budget-box");
    document.getElementById("budget-box-display")?.classList.add("hidden");
    document.getElementById("budget-box-edit")?.classList.add("open");
    
    setTimeout(() => document.getElementById("budget-input")?.focus(), 300);

    budgetBox?.classList.remove("budget-required-shake");
    void budgetBox?.offsetWidth;
    budgetBox?.classList.add("budget-required-shake");

    showToast(getPetLine("idle", "先に今月の予算を設定してね！")); 
    vibrate(20);
    return false;
}

function setupEventListeners() {
    // ------------------------------------------
    // 追加: モーダル背景（空白部分）クリックで閉じる
    // ------------------------------------------
    document.querySelectorAll(".modal, #modal-expense, #modal-category, #modal-data").forEach(modal => {
        modal.addEventListener("click", (e) => {
            // クリックされたのが背景の黒い枠自体の場合のみ閉じる（中のカード部分をクリックした時は閉じない）
            if (e.target === modal) {
                modal.classList.remove("open");
            }
        });
    });

    const btnEditBudget = document.getElementById("btn-edit-budget");
    if (btnEditBudget) {
        btnEditBudget.addEventListener("click", () => {
            const monthKey = getCurrentMonthKey();
            if ((appData.budget[monthKey] || 0) > 0) {
                showToast(getPetLine("idle", "今月の予算は確定済みのため変更できません。"));
                return;
            }
            renderBudgetInputValue();
            document.getElementById("budget-box-display").classList.add("hidden");
            document.getElementById("budget-box-edit").classList.add("open");
        });
    }

    const btnSaveBudget = document.getElementById("btn-save-budget");
    if (btnSaveBudget) {
        btnSaveBudget.addEventListener("click", () => {
            const budgetInput = document.getElementById("budget-input");
            if (!budgetInput) return;
            const monthKey = getCurrentMonthKey();

            if ((appData.budget[monthKey] || 0) > 0) {
                showToast(getPetLine("idle", "今月の予算は確定済みです。"));
                document.getElementById("budget-box-display").classList.remove("hidden");
                document.getElementById("budget-box-edit").classList.remove("open");
                return;
            }

            const value = parseFloat(budgetInput.value);
            if (isNaN(value) || value <= 0) {
                showToast(getPetLine("idle", "1円以上の予算を設定してね！"));
                return;
            }

            appData.budget[monthKey] = value;
            saveData();
            renderBudgetSummary();
            document.getElementById("budget-box-display").classList.remove("hidden");
            document.getElementById("budget-box-edit").classList.remove("open");
        });
    }

    const fabAddExpense = document.getElementById("fab-add-expense");
    if (fabAddExpense) {
        fabAddExpense.addEventListener("click", () => {
            if (!ensureBudgetIsSet()) return;
            openExpenseModal();
        });
    }

    const btnCloseExpense = document.getElementById("btn-close-expense");
    if (btnCloseExpense) {
        btnCloseExpense.addEventListener("click", () => {
            const modal = document.getElementById("modal-expense");
            if (modal) modal.classList.remove("open");
        });
    }

    const expenseAmount = document.getElementById("expense-amount");
    if (expenseAmount) expenseAmount.addEventListener("input", validateExpenseInput);

    const btnSaveExpense = document.getElementById("btn-save-expense");
    if (btnSaveExpense) {
        btnSaveExpense.addEventListener("click", () => {
            const editId = document.getElementById("expense-edit-id").value;
            const amount = parseFloat(document.getElementById("expense-amount").value);
            const categoryId = parseInt(document.getElementById("expense-category").value);
            const memo = document.getElementById("expense-memo").value.trim();

            if (isNaN(amount) || amount <= 0) return;

            if (editId) {
                const existing = appData.expenses.find(e => e.id === parseInt(editId));
                if (existing) {
                    existing.amount = amount;
                    existing.categoryId = categoryId;
                    existing.memo = memo;
                }
            } else {
                const now = new Date();
                const isoStr = now.toISOString();
                appData.expenses.push({
                    id: Date.now(), amount, categoryId, memo,
                    datetime: isoStr, dateKey: isoStr.split("T")[0], monthKey: getCurrentMonthKey()
                });
                roomData.points += 100;
                saveRoomData();
                renderCurrency();
            }

            saveData();
            renderBudgetSummary();
            renderExpenseTimeline();
            spawnPetReaction("favorite");
            petSay(getPetLine("idle", "記録できた！100ptゲット。えらい"));
            playCoin();
            vibrate(25);
            const modal = document.getElementById("modal-expense");
            if (modal) modal.classList.remove("open");
        });
    }

    const btnOpenCategory = document.getElementById("btn-open-category");
    if (btnOpenCategory) {
        btnOpenCategory.addEventListener("click", () => {
            closeCategoryForm();
            renderCategoryManageList();
            const modal = document.getElementById("modal-category");
            if (modal) modal.classList.add("open");
        });
    }

    const btnOpenData = document.getElementById("btn-open-data");
    if (btnOpenData) {
        btnOpenData.addEventListener("click", () => {
            renderStorageInfo();
            const status = document.getElementById("data-import-status");
            if (status) status.textContent = "";
            const modal = document.getElementById("modal-data");
            if (modal) modal.classList.add("open");
        });
    }

    const btnCloseData = document.getElementById("btn-close-data");
    if (btnCloseData) {
        btnCloseData.addEventListener("click", () => {
            const modal = document.getElementById("modal-data");
            if (modal) modal.classList.remove("open");
        });
    }

    const btnExportCsv = document.getElementById("btn-export-csv");
    if (btnExportCsv) {
        btnExportCsv.addEventListener("click", exportExpensesAsCsv);
    }

    const inputImportCsv = document.getElementById("input-import-csv");
    if (inputImportCsv) {
        inputImportCsv.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importExpensesFromCsv(file);
            inputImportCsv.value = "";
        });
    }

    const btnResetMonth = document.getElementById("btn-reset-month");
    if (btnResetMonth) {
        btnResetMonth.addEventListener("click", resetCurrentMonthData);
    }

    const btnResetAll = document.getElementById("btn-reset-all");
    if (btnResetAll) {
        btnResetAll.addEventListener("click", resetAllData);
    }

    const btnCloseCategory = document.getElementById("btn-close-category");
    if (btnCloseCategory) {
        btnCloseCategory.addEventListener("click", () => {
            const modal = document.getElementById("modal-category");
            if (modal) modal.classList.remove("open");
        });
    }

    const btnShowAddCategory = document.getElementById("btn-show-add-category");
    if (btnShowAddCategory) {
        btnShowAddCategory.addEventListener("click", () => {
            document.getElementById("cat-edit-id").value = "";
            document.getElementById("cat-form-name").value = "";
            openCategoryForm("add");
        });
    }

    const btnCancelCategory = document.getElementById("btn-cancel-category");
    if (btnCancelCategory) {
        btnCancelCategory.addEventListener("click", closeCategoryForm);
    }

    const btnSaveCategory = document.getElementById("btn-save-category");
    if (btnSaveCategory) {
        btnSaveCategory.addEventListener("click", () => {
            const name = document.getElementById("cat-form-name").value.trim();
            if (!name) {
                alert("カテゴリー名を入力してください。");
                return;
            }

            if (categoryFormMode === "edit") {
                const editId = parseInt(document.getElementById("cat-edit-id").value);
                const existing = getCategoryById(editId);
                if (existing) {
                    existing.name = name;
                }
            } else {
                const isDuplicate = appData.categories.some(c => c.name === name);
                if (isDuplicate) {
                    alert("同じ名前のカテゴリーが既にあります。");
                    return;
                }
                appData.categories.push({ id: appData.nextCategoryId, name });
                appData.nextCategoryId += 1;
            }

            saveData();
            renderCategoryManageList();
            renderCategorySelect();
            renderExpenseTimeline();
            closeCategoryForm();
        });
    }
}

// ==========================================
// 8. 支出モーダル制御
// ==========================================
function openExpenseModal() {
    const titleEl = document.getElementById("expense-modal-title");
    const editIdEl = document.getElementById("expense-edit-id");
    const amountEl = document.getElementById("expense-amount");
    const memoEl = document.getElementById("expense-memo");
    const datetimeDisplay = document.getElementById("expense-datetime-display");
    const modal = document.getElementById("modal-expense");

    if (titleEl) titleEl.textContent = "支出を記録";
    if (editIdEl) editIdEl.value = "";
    if (amountEl) amountEl.value = "";
    if (memoEl) memoEl.value = "";
    renderCategorySelect();
    if (datetimeDisplay) datetimeDisplay.textContent = formatFullDateTimeLabel(new Date().toISOString());

    validateExpenseInput();
    if (modal) modal.classList.add("open");
}

window.editExpense = function (id) {
    const exp = appData.expenses.find(e => e.id === id);
    if (!exp) return;

    const titleEl = document.getElementById("expense-modal-title");
    const editIdEl = document.getElementById("expense-edit-id");
    const amountEl = document.getElementById("expense-amount");
    const categoryEl = document.getElementById("expense-category");
    const memoEl = document.getElementById("expense-memo");
    const datetimeDisplay = document.getElementById("expense-datetime-display");
    const modal = document.getElementById("modal-expense");

    if (titleEl) titleEl.textContent = "支出を編集";
    if (editIdEl) editIdEl.value = exp.id;
    if (amountEl) amountEl.value = exp.amount;
    renderCategorySelect();
    if (categoryEl) categoryEl.value = exp.categoryId;
    if (memoEl) memoEl.value = exp.memo || "";
    if (datetimeDisplay) datetimeDisplay.textContent = formatFullDateTimeLabel(exp.datetime);

    validateExpenseInput();
    if (modal) modal.classList.add("open");
};

window.deleteExpense = function (id) {
    if (!confirm("この支出を削除しますか？")) return;
    appData.expenses = appData.expenses.filter(e => e.id !== id);
    saveData();
    renderBudgetSummary();
    renderExpenseTimeline();
};

// ==========================================
// 9. データ管理（CSV書き出し・読み込み・リセット）
// ==========================================
function csvEscape(value) {
    const str = String(value === undefined || value === null ? "" : value);
    if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            row.push(field); field = "";
        } else if (char === "\n") {
            row.push(field); field = "";
            rows.push(row); row = [];
        } else if (char === "\r") {
            if (text[i + 1] !== "\n") {
                row.push(field); field = "";
                rows.push(row); row = [];
            }
        } else {
            field += char;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(r => r.some(c => c.trim() !== ""));
}

function exportExpensesAsCsv() {
    const header = ["日時", "カテゴリー", "金額", "メモ"];
    const rows = [header];
    const sorted = [...appData.expenses].sort((a, b) => a.datetime.localeCompare(b.datetime));
    sorted.forEach(exp => {
        const cat = getCategoryById(exp.categoryId);
        rows.push([exp.datetime, cat ? cat.name : "不明", exp.amount, exp.memo || ""]);
    });

    const csvContent = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const fname = `yoyu_aru_expenses_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importExpensesFromCsv(file) {
    const statusEl = document.getElementById("data-import-status");
    const reader = new FileReader();

    reader.onload = (e) => {
        const rows = parseCsv(String(e.target.result));
        if (rows.length === 0) {
            if (statusEl) statusEl.textContent = "読み込めるデータがありませんでした。";
            return;
        }

        let startIndex = 0;
        const firstCell = (rows[0][0] || "").trim().toLowerCase();
        if (firstCell === "日時" || firstCell === "datetime" || firstCell === "date") startIndex = 1;

        let added = 0;
        let skipped = 0;

        for (let i = startIndex; i < rows.length; i++) {
            const cols = rows[i];
            const [rawDatetime, rawCategory, rawAmount, rawMemo] = cols;

            const amount = parseFloat(String(rawAmount || "").replace(/[^\d.-]/g, ""));
            const d = new Date(rawDatetime);

            if (!rawDatetime || isNaN(amount) || amount <= 0 || isNaN(d.getTime())) {
                skipped++;
                continue;
            }

            const categoryName = (rawCategory || "その他").trim() || "その他";
            let category = appData.categories.find(c => c.name === categoryName);
            if (!category) {
                category = { id: appData.nextCategoryId, name: categoryName };
                appData.categories.push(category);
                appData.nextCategoryId += 1;
            }

            const isoStr = d.toISOString();
            appData.expenses.push({
                id: Date.now() + added,
                amount,
                categoryId: category.id,
                memo: (rawMemo || "").trim(),
                datetime: isoStr,
                dateKey: isoStr.split("T")[0],
                monthKey: isoStr.slice(0, 7)
            });
            added++;
        }

        saveData();
        renderBudgetSummary();
        renderExpenseTimeline();
        renderCategorySelect();
        renderCategoryManageList();
        renderStorageInfo();

        if (statusEl) {
            statusEl.textContent = skipped > 0
                ? `${added}件を読み込みました（${skipped}件はスキップしました）`
                : `${added}件を読み込みました`;
        }
    };

    reader.onerror = () => {
        if (statusEl) statusEl.textContent = "ファイルの読み込みに失敗しました。";
    };

    reader.readAsText(file, "utf-8");
}

function resetCurrentMonthData() {
    const monthKey = getCurrentMonthKey();
    const label = getCurrentPeriodLabel().replace("の予算", "");
    if (!confirm(`${label}の支出と予算をすべて削除します。よろしいですか？`)) return;

    appData.expenses = appData.expenses.filter(e => e.monthKey !== monthKey);
    delete appData.budget[monthKey];

    saveData();
    renderBudgetSummary();
    renderExpenseTimeline();
    renderBudgetInputValue();
    renderStorageInfo();
}

function resetAllData() {
    if (!confirm("すべてのデータ（予算・カテゴリー・支出履歴・マイルーム）を削除して初期状態に戻します。この操作は元に戻せません。よろしいですか？")) return;
    if (!confirm("本当によろしいですか？もう一度確認します。")) return;

    localStorage.clear();

    appData = JSON.parse(JSON.stringify(DEFAULT_DATA));
    const monthKey = getCurrentMonthKey();
    appData.budget[monthKey] = 0;

    roomData = JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA));
    petIsAsleep = Math.random() < 0.25;

    saveData();
    saveRoomData();

    renderPeriodLabel();
    renderBudgetSummary();
    renderExpenseTimeline();
    renderCategorySelect();
    renderCategoryManageList();
    renderBudgetInputValue();
    renderStorageInfo();
    renderCurrency();
    renderRoomPreview();
    centerRoomPreviewOnPet();

    if (!roomData.pet) openPetSelectModal();
    
    alert("初期化が完了しました！（初期予算:0,ポイント: 8888）");
}

function renderStorageInfo() {
    const el = document.getElementById("data-storage-info");
    if (!el) return;
    const raw = localStorage.getItem("yoyu_aru_data") || "";
    const sizeKb = (new Blob([raw]).size / 1024).toFixed(1);
    el.textContent = `記録件数: ${appData.expenses.length}件 ／ 保存容量: 約${sizeKb}KB`;
}

// ==========================================
// マイルーム（ペット・部屋・ショップ）
// ==========================================

const ROOM_STORAGE_KEY = "yoyu_aru_room_data";

const FURNITURE_CATALOG = [
    { id: "nezumi_karakuri", img: "assets/nezumi_karakuri.gif", price: 800 },
    { id: "toy_car_red", img: "assets/toy_car_red.png", price: 800 },
    { id: "wool_red", img: "assets/wool_red.png", price: 800 },
    { id: "toy_car", img: "assets/toy_car.png", price: 800 },
    { id: "toy_ball", img: "assets/toy_ball.png", price: 1200 },
    { id: "neko_toy", img: "assets/neko_toy.png", price: 1000 },
    { id: "sofa_01", img: "assets/sofa_01.png", price: 3200 },
    { id: "sofa_02", img: "assets/sofa_02.png", price: 4300 },
    { id: "sofa_03", img: "assets/sofa_03.png", price: 4500 },
    { id: "hang_plant", img: "assets/hang_plant.png", price: 1800 },
    { id: "desk_01", img: "assets/desk_01.png", price: 3500 },
    { id: "rack", img: "assets/rack.png", price: 2000 },
    { id: "danro", img: "assets/danro.gif", price: 4800 },
    { id: "window", img: "assets/window.png", price: 3600 },
    { id: "clock", img: "assets/clock.gif", price: 1600 },
    { id: "recorder", img: "assets/recorder.png", price: 2500 },
    { id: "tv", img: "assets/tv.png", price: 3500 },
    { id: "tiki", img: "assets/tiki.png", price: 3000 },
    { id: "neko_tower", img: "assets/neko_tower.png", price: 1300 },
    { id: "pet_food", img: "assets/pet_food.png", price: 2300 },
    { id: "pet_bed_01", img: "assets/pet_bed_01.png", price: 4000 },
    { id: "pet_bed_02", img: "assets/pet_bed_02.png", price: 3700 },
    { id: "pet_bed_03", img: "assets/pet_bed_03.png", price: 3900 },
    { id: "globe", img: "assets/globe.gif", price: 900 },
    { id: "fishbowl", img: "assets/fishbowl.gif", price: 2400 },
    { id: "fishtank", img: "assets/fishtank.gif", price: 4000 }
];

const WALLPAPER_CATALOG = [
    { id: "default", img: "assets/wallpaper.jpg", price: 0 },
    { id: "modern_gray", img: "assets/wallpaper_modern_gray.jpg", price: 1500 },
    { id: "modern_pastel", img: "assets/wallpaper_cute_pastel.jpg", price: 1500 }
];

const PET_Z = 25;

const ANIMATED_FURNITURE_GIF = {
    clock: "assets/clock.gif",
    danro: "assets/danro.gif",
    fishbowl: "assets/fishbowl.gif"
};
const PET_AWAKE_IMG = {
    neko: "assets/neko_awake.png",
    usagi: "assets/usagi_awake.png"
};
const PET_SLEEP_IMG = {
    neko: "assets/neko_sleep1.gif",
    usagi: "assets/usagi_sleep.gif"
};

const PET_FLOOR_Y = 82;
const TOY_ITEM_IDS = ["nezumi_karakuri", "toy_car_red", "wool_red", "toy_car", "toy_ball", "neko_toy"];

const PET_CHAT = {
    idle: ["ゆとり、ある？", "今日も一緒にがんばろう", "おかえり！今日もおつかれさま", "記録できてえらい", "小さな節約も未来の余裕につながる"],
    under: ["まだ予算に余裕がある", "この調子、いい感じ", "目標に向かってコツコツいこう", "無理しない節約がいちばん"],
    warn: ["そろそろ予算が心配", "使いすぎに気をつけよう", "ちょっとだけブレーキかけよう", "目標を思い出して、今日はゆっくり考えてから買おう"],
    over: ["予算オーバーだ", "いったん深呼吸して、次の記録から整えていこう", "大丈夫、ここから立て直せばいい"]
};

let roomDragMoved = false;

const DEFAULT_ROOM_DATA = {
    points: 8888,
    lastLoginDate: null,
    pet: null,
    ownedItemIds: [],
    placedItems: [],
    wallpaperId: "default",
    ownedWallpaperIds: ["default"]
};

let roomData = loadRoomData();
let petIsAsleep = Math.random() < 0.25;
let petLifeLoopsStarted = false;
let roomEditorSelectedUid = null;

function loadRoomData() {
    let data;
    try {
        data = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY));
    } catch (e) {
        data = null;
    }
    if (!data) data = JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA));
    if (data.points === undefined) data.points = 8888;
    if (!data.ownedItemIds) data.ownedItemIds = [];
    if (!data.wallpaperId) data.wallpaperId = "default";
    if (!data.ownedWallpaperIds) data.ownedWallpaperIds = ["default"];
    if (!data.ownedWallpaperIds.includes("default")) data.ownedWallpaperIds.push("default");
    if (data.pet && !data.pet.name) data.pet.name = data.pet.type === "usagi" ? "ぴょん" : "ねこ";
    if (!data.placedItems) data.placedItems = [];
    
    if (data.pet) data.pet.y = PET_FLOOR_Y;

    if (data.pet && typeof data.pet.x === "number" && data.pet.x > 100) data.pet.x = data.pet.x / 2;
    data.placedItems.forEach(it => {
        if (typeof it.x === "number" && it.x > 100) it.x = it.x / 2;
    });
    
    return data;
}

function saveRoomData() {
    localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(roomData));
}

function todayDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getFurnitureById(id) {
    return FURNITURE_CATALOG.find(f => f.id === id);
}

function getWallpaperById(id) {
    return WALLPAPER_CATALOG.find(w => w.id === id) || WALLPAPER_CATALOG[0];
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

// ==========================================
// ペットの行動ループ & 演出
// ==========================================
function startPetLifeLoops() {
    if (petLifeLoopsStarted) return;
    petLifeLoopsStarted = true;
    scheduleNextSleepToggle();
    scheduleNextStretch();
    scheduleNextToyPlay();
    scheduleNextPetComment();
    scheduleNextWander();
}

function scheduleNextSleepToggle() {
    const delayMs = petIsAsleep
        ? randomBetween(15000, 40000)
        : randomBetween(30000, 90000);
    setTimeout(() => {
        petIsAsleep = !petIsAsleep;
        updatePetSleepVisual();
        scheduleNextSleepToggle();
    }, delayMs);
}

function updatePetSleepVisual() {
    if (!roomData.pet) return;
    document.querySelectorAll(".pet-item").forEach(el => {
        el.classList.toggle("is-sleeping", petIsAsleep);
        const img = el.querySelector("img");
        if (img) {
            img.dataset.retried = "0";
            img.src = petIsAsleep
                ? (PET_SLEEP_IMG[roomData.pet.type] || PET_SLEEP_IMG.neko)
                : (PET_AWAKE_IMG[roomData.pet.type] || PET_AWAKE_IMG.neko);
        }
    });
}

function scheduleNextStretch() {
    const delayMs = randomBetween(14000, 32000);
    setTimeout(() => {
        if (!petIsAsleep) triggerPetStretch();
        scheduleNextStretch();
    }, delayMs);
}

function triggerPetStretch() {
    document.querySelectorAll(".pet-item").forEach(el => {
        el.classList.remove("stretching");
        void el.offsetWidth;
        el.classList.add("stretching");
    });
}

function triggerPetHop(silent = false) {
    if (!silent) {
        playPop();
        vibrate(18);
    }
    document.querySelectorAll(".pet-item").forEach(el => {
        el.classList.remove("hopping");
        void el.offsetWidth;
        el.classList.add("hopping");
        const img = el.querySelector("img");
        const onEnd = (e) => {
            if (e.target !== img) return;
            el.classList.remove("hopping");
            el.removeEventListener("animationend", onEnd);
        };
        el.addEventListener("animationend", onEnd);
    });
}

function scheduleNextToyPlay() {
    const delayMs = randomBetween(12000, 26000);
    setTimeout(() => {
        if (!petIsAsleep && roomData.pet && !document.getElementById("room-editor")?.classList.contains("open")) {
            tryPlayWithToy();
        }
        scheduleNextToyPlay();
    }, delayMs);
}

function tryPlayWithToy() {
    const el = document.querySelector("#room-scene-preview .pet-item");
    if (!el) return;
    const toys = roomData.placedItems
        .filter(it => it.placed && TOY_ITEM_IDS.includes(it.itemId))
        .map(it => ({ x: it.x, d: Math.abs(it.x - roomData.pet.x) }));
    if (toys.length === 0) return;
    toys.sort((a, b) => a.d - b.d);
    if (toys[0].d > 28) return;

    const curX = roomData.pet.x;
    const targetX = Math.max(10, Math.min(90, toys[0].x));
    el.style.setProperty("--flip", targetX < curX ? -1 : 1);
    el.style.left = targetX + "%";
    roomData.pet.x = targetX;
    saveRoomData();

    setTimeout(() => triggerPetHop(true), 200);
    spawnPetReaction("sports_esports");
}

function scheduleNextWander() {
    const delayMs = randomBetween(8000, 18000);
    setTimeout(() => {
        if (!petIsAsleep && roomData.pet && !document.getElementById("room-editor")?.classList.contains("open")) {
            wanderPetInPreview();
        }
        scheduleNextWander();
    }, delayMs);
}

function wanderPetInPreview() {
    const el = document.querySelector("#room-scene-preview .pet-item");
    if (!el) return;
    const targetX = randomBetween(15, 85);
    const curX = roomData.pet.x;
    el.style.setProperty("--flip", targetX < curX ? -1 : 1);
    el.style.left = targetX + "%";
    el.style.top = PET_FLOOR_Y + "%";
    roomData.pet.x = targetX;
    roomData.pet.y = PET_FLOOR_Y;
    saveRoomData();
}

function getCurrentBudgetRatioOrNull() {
    const monthKey = getCurrentMonthKey();
    const budget = appData.budget[monthKey] || 0;
    if (budget <= 0) return null;
    const spent = appData.expenses
        .filter(e => e.monthKey === monthKey)
        .reduce((sum, e) => sum + e.amount, 0);
    return spent / budget;
}

function refreshPetMood() {
    const ratio = getCurrentBudgetRatioOrNull();
    const isOver = ratio !== null && ratio >= 1;
    const isWarn = ratio !== null && ratio >= 0.8 && ratio < 1;

    document.querySelectorAll(".pet-item").forEach(el => {
        el.classList.toggle("mood-over", isOver);
        el.classList.toggle("mood-warn", isWarn);
        const badge = el.querySelector(".mood-badge");
        if (!badge) return;
        const icon = badge.querySelector(".material-icons-round");
        if (isOver) {
            badge.classList.remove("hidden");
            if (icon) icon.textContent = "sentiment_very_dissatisfied";
        } else if (isWarn) {
            badge.classList.remove("hidden");
            if (icon) icon.textContent = "sentiment_neutral";
        } else {
            badge.classList.add("hidden");
        }
    });
}

function spawnPetReaction(iconName) {
    const scene = document.getElementById("room-scene-preview");
    if (!scene) return;
    const reaction = document.createElement("div");
    reaction.className = "pet-reaction";
    reaction.innerHTML = `<span class="material-icons-round">${iconName}</span>`;
    scene.appendChild(reaction);
    reaction.addEventListener("animationend", () => reaction.remove());
    setTimeout(() => reaction.remove(), 1500);
}

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function pickPetLine(ratio) {
    let line;
    if (ratio === null) line = randomPick(PET_CHAT.idle);
    else if (ratio >= 1) line = randomPick(PET_CHAT.over);
    else if (ratio >= 0.8) line = randomPick(PET_CHAT.warn);
    else line = randomPick(PET_CHAT.under);
    return getPetLine("idle", line);
}

function getPetGobi() { return roomData.pet?.type === "usagi" ? "ぴょん" : "にゃ～"; }
function getPetLine(kind, text) {
    const clean = String(text || "").replace(/(にゃ～|にゃ|ぴょん)[！!。．]?$/u, "");
    return `${clean}${getPetGobi()}`;
}
function petSay(text) {
    if (!text) return;
    const box = document.getElementById("room-dialogue-box");
    const textEl = document.getElementById("room-dialogue-text");
    if (!box || !textEl) return;
    textEl.textContent = text;
    box.classList.add("show");
    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(() => box.classList.remove("show"), 4200);
}

function getTimeGreeting() {
    const h = new Date().getHours();
    if (h < 5) return getPetLine("idle", "遅い時間だね。もう寝よう？");
    if (h < 11) return getPetLine("idle", "おはよう！今日もゆとり、ある？");
    if (h < 18) return getPetLine("idle", "こんにちは！記録、進んでる？");
    return getPetLine("idle", "こんばんは！おつかれさま");
}

function localDateKeyOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getRecordingStreak() {
    const days = new Set();
    appData.expenses.forEach(e => {
        const d = new Date(e.datetime);
        if (!isNaN(d.getTime())) days.add(localDateKeyOf(d));
    });
    let streak = 0;
    const cur = new Date();
    if (!days.has(localDateKeyOf(cur))) cur.setDate(cur.getDate() - 1);
    while (days.has(localDateKeyOf(cur))) {
        streak++;
        cur.setDate(cur.getDate() - 1);
    }
    return streak;
}

function petChatReply(text) {
    const t = (text || "").trim();
    if (!t) return getPetLine("idle", "なにか話したいのかな？");
    if (/こんにちは|こんばんは|おはよう|やあ|hello|hi/i.test(t)) return getPetLine("idle", "こんにちは！今日も一緒にがんばろう");
    if (/目標|貯金|節約|予算|お金|円|買い/i.test(t)) return pickPetLine(getCurrentBudgetRatioOrNull());
    if (/すごい|えらい|かわいい|いいね|good|好き|love/i.test(t)) return getPetLine("idle", "ありがとう！うれしい");
    if (/元気|げんき|大丈夫|どう/i.test(t)) return getPetLine("idle", "元気だよ！あなたも無理しないでね");
    if (/眠|ねむ|おやすみ/i.test(t)) return getPetLine("idle", "おやすみ。また明日ね");
    return randomPick([getPetLine("idle", "なるほど！"), getPetLine("idle", "そうなんだ！"), getPetLine("idle", "うん、聞いてるよ！"), getPetLine("idle", "ふむふむ…")]);
}

function scheduleNextPetComment() {
    const delayMs = randomBetween(30000, 60000);
    setTimeout(() => {
        if (!petIsAsleep && roomData.pet) {
            petSay(pickPetLine(getCurrentBudgetRatioOrNull()));
        }
        scheduleNextPetComment();
    }, delayMs);
}

function setupRoomDragToScroll() {
    const wrapper = document.querySelector(".room-scroll-wrapper");
    if (!wrapper) return;
    let isDown = false;
    let startX = 0;
    let startScroll = 0;

    wrapper.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDown = true;
        roomDragMoved = false;
        startX = e.pageX;
        startScroll = wrapper.scrollLeft;
        wrapper.classList.add("is-dragging");
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        const dx = e.pageX - startX;
        if (Math.abs(dx) > 5) roomDragMoved = true;
        wrapper.scrollLeft = startScroll - dx;
    });

    const endDrag = () => {
        if (!isDown) return;
        isDown = false;
        wrapper.classList.remove("is-dragging");
        setTimeout(() => { roomDragMoved = false; }, 120);
    };
    document.addEventListener("mouseup", endDrag);
}

function initRoomSystem() {
    renderCurrency();
    setupRoomEventListeners();
    setupRoomDragToScroll();

    if (!roomData.pet) {
        openPetSelectModal();
    } else {
        maybeShowDailyLoginBonus();
    }

    renderRoomPreview();
    centerRoomPreviewOnPet();
    preloadPetSleepGif();
    startPetLifeLoops();

    if (roomData.pet && !petIsAsleep) {
        setTimeout(() => {
            const streak = getRecordingStreak();
            let greet = getTimeGreeting();
            if (streak >= 2) greet += `（${streak}日連続記録中！）`;
            petSay(greet);
        }, 500);
    }
}

// ==========================================
// ペット選択（初回）
// ==========================================
function openPetSelectModal() {
    const modal = document.getElementById("modal-pet-select");
    if (modal) modal.classList.add("open");
}

let pendingPetType = null;

function choosePet(type) {
    pendingPetType = type;
    const preview = document.getElementById("petname-preview-img");
    const title = document.getElementById("petname-title");
    const input = document.getElementById("pet-name-input");
    const isRabbit = type === "usagi";
    if (preview) preview.src = isRabbit ? PET_AWAKE_IMG.usagi : PET_AWAKE_IMG.neko;
    if (title) title.textContent = `${isRabbit ? "うさぎ" : "ねこ"}に名前をつけよう`;
    if (input) { input.value = ""; input.placeholder = isRabbit ? "例：ぴょん" : "例：もち"; }
    document.getElementById("modal-pet-select")?.classList.remove("open");
    document.getElementById("modal-pet-name")?.classList.add("open");
    setTimeout(() => input?.focus(), 80);
}

function confirmPetName() {
    const input = document.getElementById("pet-name-input");
    const name = (input?.value || "").trim();
    if (!pendingPetType || !name) { input?.focus(); return; }
    roomData.pet = { type: pendingPetType, name, x: 50, y: PET_FLOOR_Y, scale: 1 };
    pendingPetType = null;
    saveRoomData();
    document.getElementById("modal-pet-name")?.classList.remove("open");
    renderRoomPreview(); centerRoomPreviewOnPet(); preloadPetSleepGif();
    petSay(getPetLine("idle", `${name}、今日からよろしく`));
    maybeShowDailyLoginBonus();
}

// ==========================================
// デイリーログインボーナス
// ==========================================
function maybeShowDailyLoginBonus() {
    const today = todayDateKey();
    if (roomData.lastLoginDate === today) return;
    const modal = document.getElementById("modal-daily-login");
    if (modal) modal.classList.add("open");
}

function claimDailyLoginBonus() {
    const amount = 200;
    roomData.points += amount;
    roomData.lastLoginDate = todayDateKey();
    saveRoomData();
    renderCurrency();
    playCoin();
    vibrate(25);
    const modal = document.getElementById("modal-daily-login");
    if (modal) modal.classList.remove("open");
}

// ==========================================
// 所持ポイント表示
// ==========================================
function renderCurrency() {
    const el = document.getElementById("currency-amount");
    if (el) el.textContent = roomData.points.toLocaleString();
    const shopEl = document.getElementById("shop-currency-amount");
    if (shopEl) shopEl.textContent = roomData.points.toLocaleString();
}

// ==========================================
// ルームプレビュー
// ==========================================
function renderRoomScene(container, interactive) {
    if (!container) return;
    container.innerHTML = "";
    container.style.backgroundImage = `url("${getWallpaperById(roomData.wallpaperId).img}")`;

    if (roomData.pet) {
        const petEl = createPetElement(interactive, container);
        container.appendChild(petEl);
        refreshPetMood();
    }

    roomData.placedItems.filter(it => it.placed).forEach(it => {
        const el = createFurnitureElement(it, interactive, container);
        container.appendChild(el);
    });
}

function renderRoomPreview() {
    renderRoomScene(document.getElementById("room-scene-preview"), false);
}

function centerRoomPreviewOnPet() {
    const scene = document.getElementById("room-scene-preview");
    const wrapper = scene ? scene.parentElement : null;
    if (!scene || !wrapper) return;
    const petX = roomData.pet ? (parseFloat(roomData.pet.x) || 50) : 50;
    const target = (petX / 100) * scene.scrollWidth - wrapper.clientWidth / 2;
    wrapper.scrollLeft = Math.max(0, target);
}

function preloadPetSleepGif() {
    if (!roomData.pet) return;
    const src = PET_SLEEP_IMG[roomData.pet.type];
    if (!src) return;
    const img = new Image();
    img.src = src;
}

function attachImgRetryFallback(imgEl, fallbackSrc) {
    imgEl.dataset.retried = "0";
    imgEl.addEventListener("error", function onImgError() {
        if (imgEl.dataset.retried !== "1") {
            imgEl.dataset.retried = "1";
            const base = imgEl.src.split("?")[0];
            setTimeout(() => { imgEl.src = base + "?retry=" + Date.now(); }, 400);
        } else if (fallbackSrc && !imgEl.src.endsWith(fallbackSrc)) {
            imgEl.src = fallbackSrc;
        }
    });
}

function createPetElement(interactive, container) {
    const type = roomData.pet.type;
    const img = petIsAsleep
        ? (PET_SLEEP_IMG[type] || PET_SLEEP_IMG.neko)
        : (PET_AWAKE_IMG[type] || PET_AWAKE_IMG.neko);
    const el = document.createElement("div");
    el.className = "room-item pet-item" + (petIsAsleep ? " is-sleeping" : "");
    el.style.left = roomData.pet.x + "%";
    el.style.top = PET_FLOOR_Y + "%";
    el.style.setProperty("--scale", roomData.pet.scale || 1);
    el.style.zIndex = PET_Z;
    el.innerHTML = `
        <img src="${img}" alt="${type}" draggable="false" decoding="async">
        <div class="pet-name-tag${roomData.pet.name ? "" : " hidden"}">${escapeHtml(roomData.pet.name || "")}</div>
        <div class="mood-badge hidden"><span class="material-icons-round"></span></div>
    `;
    if (!interactive) {
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!roomData.pet || petIsAsleep) return;
            triggerPetHop(); spawnPetReaction("favorite");
            petSay(pickPetLine(getCurrentBudgetRatioOrNull())); vibrate(15);
        });
    }
    if (interactive) {
        el.dataset.uid = "pet";
        makeItemDraggable(el, "pet", container);
    }
    const petImgEl = el.querySelector("img");
    if (petImgEl) attachImgRetryFallback(petImgEl, PET_AWAKE_IMG[type] || PET_AWAKE_IMG.neko);
    return el;
}

function createFurnitureElement(placedItem, interactive, container) {
    const furniture = getFurnitureById(placedItem.itemId);
    const el = document.createElement("div");
    el.className = "room-item furniture-item";
    el.dataset.itemId = placedItem.itemId;
    el.style.left = placedItem.x + "%";
    el.style.top = placedItem.y + "%";
    el.style.setProperty("--scale", placedItem.scale || 1);
    el.style.zIndex = placedItem.z || 1;
    const src = furniture ? (ANIMATED_FURNITURE_GIF[placedItem.itemId] || furniture.img) : "";
    el.innerHTML = `<img src="${src}" alt="" draggable="false" decoding="async">`;
    if (interactive) {
        el.dataset.uid = placedItem.uid;
        makeItemDraggable(el, placedItem.uid, container);
    }
    const furnitureImgEl = el.querySelector("img");
    if (furnitureImgEl && furniture) attachImgRetryFallback(furnitureImgEl, furniture.img);
    return el;
}

// ==========================================
// ルーム編集（フルスクリーン）
// ==========================================
function openRoomEditor() {
    const editor = document.getElementById("room-editor");
    if (editor) editor.classList.add("open");
    renderRoomEditorCanvas();
    renderInventoryTray();
}

function closeRoomEditor() {
    const editor = document.getElementById("room-editor");
    if (editor) editor.classList.remove("open");
    deselectRoomItem();
    renderRoomPreview();
}

function renderRoomEditorCanvas() {
    renderRoomScene(document.getElementById("room-editor-canvas"), true);
}

function renderInventoryTray() {
    const tray = document.getElementById("room-editor-tray-items");
    if (!tray) return;
    tray.innerHTML = "";

    const unplaced = roomData.placedItems.filter(it => !it.placed);
    if (unplaced.length === 0) {
        tray.innerHTML = `<p class="tray-empty-hint">ショップで家具を購入すると、ここに表示されます</p>`;
        return;
    }

    unplaced.forEach(it => {
        const furniture = getFurnitureById(it.itemId);
        if (!furniture) return;
        const card = document.createElement("div");
        card.className = "tray-item";
        card.innerHTML = `<img src="${furniture.img}" alt="" draggable="false"><span class="tray-item-plus material-icons-round">add_circle</span>`;
        card.addEventListener("click", () => placeItemToCenter(it.uid));
        tray.appendChild(card);
    });
}

function placeItemToCenter(uid) {
    const item = roomData.placedItems.find(it => it.uid === uid);
    if (!item) return;
    item.placed = true;
    item.x = 50;
    item.y = 50;
    item.scale = item.scale || 1;
    item.z = item.z || 1;
    saveRoomData();
    renderRoomEditorCanvas();
    renderInventoryTray();
    selectRoomItem(uid);
}

function makeItemDraggable(el, uid, canvas) {
    let dragging = false;
    let startX, startY, origLeftPct, origTopPct;

    el.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".resize-handle") || e.target.closest(".item-controls")) return;
        e.preventDefault();
        selectRoomItem(uid);
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origLeftPct = parseFloat(el.style.left);
        origTopPct = parseFloat(el.style.top);
        el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", (e) => {
        if (!dragging || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dxPct = ((e.clientX - startX) / rect.width) * 100;
        const dyPct = ((e.clientY - startY) / rect.height) * 100;
        let newLeft = Math.min(100, Math.max(0, origLeftPct + dxPct));
        let newTop = uid === "pet" ? PET_FLOOR_Y : Math.min(100, Math.max(0, origTopPct + dyPct));
        el.style.left = newLeft + "%";
        el.style.top = newTop + "%";
    });

    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        persistItemPosition(uid, parseFloat(el.style.left), parseFloat(el.style.top));
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
}

function persistItemPosition(uid, x, y) {
    if (uid === "pet") {
        roomData.pet.x = x;
        roomData.pet.y = PET_FLOOR_Y;
    } else {
        const item = roomData.placedItems.find(it => it.uid === uid);
        if (item) { item.x = x; item.y = y; }
    }
    saveRoomData();
}

function selectRoomItem(uid) {
    roomEditorSelectedUid = uid;
    document.querySelectorAll("#room-editor-canvas .room-item").forEach(el => {
        el.classList.toggle("selected", el.dataset.uid === uid);
    });
    attachSelectionControls(uid);
}

function deselectRoomItem() {
    roomEditorSelectedUid = null;
    document.querySelectorAll("#room-editor-canvas .room-item").forEach(el => {
        el.classList.remove("selected");
        const handle = el.querySelector(".resize-handle");
        if (handle) handle.remove();
        const controls = el.querySelector(".item-controls");
        if (controls) controls.remove();
    });
}

function attachSelectionControls(uid) {
    const el = document.querySelector(`#room-editor-canvas .room-item[data-uid="${uid}"]`);
    if (!el) return;

    if (!el.querySelector(".resize-handle")) {
        const handle = document.createElement("div");
        handle.className = "resize-handle";
        handle.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handle.setPointerCapture(e.pointerId);
            const startX = e.clientX;
            const startScale = getCurrentScale(uid);

            const onMove = (ev) => {
                const delta = (ev.clientX - startX) / 100;
                const newScale = Math.min(2.5, Math.max(0.4, startScale + delta));
                el.style.setProperty("--scale", newScale);
            };
            const onUp = () => {
                const finalScale = parseFloat(el.style.getPropertyValue("--scale")) || 1;
                persistItemScale(uid, finalScale);
                handle.removeEventListener("pointermove", onMove);
                handle.removeEventListener("pointerup", onUp);
            };
            handle.addEventListener("pointermove", onMove);
            handle.addEventListener("pointerup", onUp);
        });
        el.appendChild(handle);
    }

    if (!el.querySelector(".item-controls") && uid !== "pet") {
        const item = roomData.placedItems.find(it => it.uid === uid);
        const isInFrontOfPet = (item ? (item.z || 1) : 1) > PET_Z;
        const controls = document.createElement("div");
        controls.className = "item-controls";
        controls.innerHTML = `
            <button class="item-control-btn layer-up" title="1段階前へ"><span class="material-icons-round">arrow_upward</span></button>
            <button class="item-control-btn layer-down" title="1段階後ろへ"><span class="material-icons-round">arrow_downward</span></button>
            <button class="item-control-btn layer-toggle" title="ペットの前後を切り替え"><span class="material-icons-round">${isInFrontOfPet ? "flip_to_back" : "flip_to_front"}</span></button>
            <button class="item-control-btn confirm" title="配置を確定"><span class="material-icons-round">check</span></button>
            <button class="item-control-btn remove" title="持ち物に戻す"><span class="material-icons-round">inventory_2</span></button>
        `;
        controls.querySelector(".layer-up").addEventListener("pointerdown", (e) => { e.stopPropagation(); changeItemLayer(uid, 1); });
        controls.querySelector(".layer-down").addEventListener("pointerdown", (e) => { e.stopPropagation(); changeItemLayer(uid, -1); });
        controls.querySelector(".layer-toggle").addEventListener("pointerdown", (e) => { e.stopPropagation(); toggleLayerAcrossPet(uid); });
        controls.querySelector(".confirm").addEventListener("pointerdown", (e) => { e.stopPropagation(); deselectRoomItem(); });
        controls.querySelector(".remove").addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            returnItemToInventory(uid);
        });
        el.appendChild(controls);
    } else if (!el.querySelector(".item-controls")) {
        const controls = document.createElement("div");
        controls.className = "item-controls";
        controls.innerHTML = `<button class="item-control-btn confirm" title="確定"><span class="material-icons-round">check</span></button>`;
        controls.querySelector(".confirm").addEventListener("pointerdown", (e) => { e.stopPropagation(); deselectRoomItem(); });
        el.appendChild(controls);
    }
}

function getCurrentScale(uid) {
    if (uid === "pet") return roomData.pet.scale || 1;
    const item = roomData.placedItems.find(it => it.uid === uid);
    return item ? (item.scale || 1) : 1;
}

function persistItemScale(uid, scale) {
    if (uid === "pet") {
        roomData.pet.scale = scale;
    } else {
        const item = roomData.placedItems.find(it => it.uid === uid);
        if (item) item.scale = scale;
    }
    saveRoomData();
}

// レイヤー操作 (1段階ずつ切り替え)
function changeItemLayer(uid, delta) {
    if (uid === "pet") return;

    const item = roomData.placedItems.find(it => it.uid === uid);
    if (!item) return;

    const currentZ = item.z !== undefined ? item.z : 1;
    item.z = Math.min(50, Math.max(1, currentZ + delta));

    saveRoomData();
    applyItemZIndex(uid, item.z);
}

function applyItemZIndex(uid, z) {
    const el = document.querySelector(`#room-editor-canvas .room-item[data-uid="${uid}"]`);
    if (el) {
        el.style.zIndex = z;
        const item = roomData.placedItems.find(it => it.uid === uid);
        if (item) updateLayerToggleIcon(el, item);
    }
}

function toggleLayerAcrossPet(uid) {
    if (uid === "pet") return;
    const item = roomData.placedItems.find(it => it.uid === uid);
    if (!item) return;
    const current = item.z || 1;
    item.z = current > PET_Z ? Math.max(1, PET_Z - 1) : Math.min(50, PET_Z + 1);
    saveRoomData();
    const el = document.querySelector(`#room-editor-canvas .room-item[data-uid="${uid}"]`);
    if (el) {
        el.style.zIndex = item.z;
        updateLayerToggleIcon(el, item);
    }
}

function updateLayerToggleIcon(el, item) {
    const icon = el.querySelector(".layer-toggle .material-icons-round");
    if (icon) icon.textContent = (item.z || 1) > PET_Z ? "flip_to_back" : "flip_to_front";
}

function returnItemToInventory(uid) {
    const item = roomData.placedItems.find(it => it.uid === uid);
    if (!item) return;
    item.placed = false;
    deselectRoomItem();
    saveRoomData();
    renderRoomEditorCanvas();
    renderInventoryTray();
}

// ==========================================
// ショップ
// ==========================================
let shopTab = "furniture"; // "furniture" | "wallpaper"

function openShop() {
    shopTab = "furniture";
    updateShopTabButtons();
    renderShopGrid();
    renderCurrency();
    const modal = document.getElementById("modal-shop");
    if (modal) modal.classList.add("open");
}

function setShopTab(tab) {
    shopTab = tab;
    updateShopTabButtons();
    renderShopGrid();
}

function updateShopTabButtons() {
    document.querySelectorAll(".shop-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === shopTab);
    });
}

function renderShopGrid() {
    if (shopTab === "wallpaper") {
        renderWallpaperShopGrid();
    } else {
        renderFurnitureShopGrid();
    }
}

function renderFurnitureShopGrid() {
    const grid = document.getElementById("shop-grid");
    const emptyHint = document.getElementById("shop-empty-hint");
    if (!grid) return;
    grid.innerHTML = "";

    const available = FURNITURE_CATALOG.filter(f => !roomData.ownedItemIds.includes(f.id));

    if (available.length === 0) {
        if (emptyHint) {
            emptyHint.style.display = "block";
            emptyHint.textContent = "すべてのアイテムを購入しました！";
        }
        return;
    }
    if (emptyHint) emptyHint.style.display = "none";

    available.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-card";
        const affordable = roomData.points >= item.price;
        card.innerHTML = `
            <div class="shop-card-image"><img src="${item.img}" alt="" draggable="false"></div>
            <div class="shop-card-price">
                <span class="material-icons-round">toll</span>
                ${item.price.toLocaleString()}
            </div>
            <button class="shop-buy-btn" ${affordable ? "" : "disabled"}>購入</button>
        `;
        card.querySelector(".shop-buy-btn").addEventListener("click", () => buyItem(item.id));
        grid.appendChild(card);
    });
}

function renderWallpaperShopGrid() {
    const grid = document.getElementById("shop-grid");
    const emptyHint = document.getElementById("shop-empty-hint");
    if (!grid) return;
    grid.innerHTML = "";
    if (emptyHint) emptyHint.style.display = "none";

    WALLPAPER_CATALOG.forEach(item => {
        const owned = roomData.ownedWallpaperIds.includes(item.id);
        const active = roomData.wallpaperId === item.id;
        const affordable = roomData.points >= item.price;

        const card = document.createElement("div");
        card.className = "shop-card wallpaper-card" + (active ? " active" : "");
        card.innerHTML = `
            <div class="shop-card-image"><img src="${item.img}" alt="" draggable="false"></div>
            ${
                owned
                    ? `<button class="shop-buy-btn wallpaper-select-btn" ${active ? "disabled" : ""}>${active ? "使用中" : "使用する"}</button>`
                    : `<div class="shop-card-price"><span class="material-icons-round">toll</span>${item.price.toLocaleString()}</div>
                       <button class="shop-buy-btn" ${affordable ? "" : "disabled"}>購入</button>`
            }
        `;
        card.querySelector(".shop-buy-btn").addEventListener("click", () => {
            if (owned) {
                selectWallpaper(item.id);
            } else {
                buyWallpaper(item.id);
            }
        });
        grid.appendChild(card);
    });
}

function buyWallpaper(wallpaperId) {
    const item = getWallpaperById(wallpaperId);
    if (!item) return;
    if (roomData.points < item.price) return;
    if (roomData.ownedWallpaperIds.includes(wallpaperId)) return;

    roomData.points -= item.price;
    roomData.ownedWallpaperIds.push(wallpaperId);
    selectWallpaper(wallpaperId); 

    saveRoomData();
    renderCurrency();
    renderShopGrid();
    playCoin();
    vibrate(25);
}

function selectWallpaper(wallpaperId) {
    if (!roomData.ownedWallpaperIds.includes(wallpaperId)) return;
    roomData.wallpaperId = wallpaperId;
    saveRoomData();
    renderRoomPreview();
    if (document.getElementById("room-editor").classList.contains("open")) {
        renderRoomScene(document.getElementById("room-editor-canvas"), true);
    }
    renderShopGrid();
}

function buyItem(itemId) {
    const item = getFurnitureById(itemId);
    if (!item) return;
    if (roomData.points < item.price) return;
    if (roomData.ownedItemIds.includes(itemId)) return;

    roomData.points -= item.price;
    roomData.ownedItemIds.push(itemId);
    roomData.placedItems.push({
        uid: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        itemId,
        x: 50, y: 50, scale: 1, z: 1,
        placed: false
    });

    saveRoomData();
    renderCurrency();
    renderShopGrid();
    playCoin();
    vibrate(25);
}

// ==========================================
// マイルームCSV バックアップ
// ==========================================
function exportRoomAsCsv() {
    const rows = [["key", "value"]];
    rows.push(["points", roomData.points]);
    rows.push(["lastLoginDate", roomData.lastLoginDate || ""]);
    rows.push(["petType", roomData.pet ? roomData.pet.type : ""]);
    rows.push(["petName", roomData.pet ? roomData.pet.name || "" : ""]);
    rows.push(["petX", roomData.pet ? roomData.pet.x : ""]);
    rows.push(["petY", roomData.pet ? roomData.pet.y : ""]);
    rows.push(["petScale", roomData.pet ? roomData.pet.scale : ""]);
    rows.push(["ownedItemIds", roomData.ownedItemIds.join("|")]);
    rows.push(["wallpaperId", roomData.wallpaperId || "default"]);
    rows.push(["ownedWallpaperIds", roomData.ownedWallpaperIds.join("|")]);
    roomData.placedItems.forEach((it, i) => {
        rows.push([`item_${i}`, `${it.uid},${it.itemId},${it.x},${it.y},${it.scale},${it.placed},${it.z || 1}`]);
    });

    const csvContent = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const fname = `yoyu_aru_room_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importRoomFromCsv(file) {
    const statusEl = document.getElementById("data-import-room-status");
    const reader = new FileReader();
    reader.onload = (e) => {
        const rows = parseCsv(String(e.target.result));
        const map = {};
        const items = [];
        rows.slice(1).forEach(r => {
            const [key, value] = r;
            if (!key) return;
            if (key.startsWith("item_")) items.push(value);
            else map[key] = value;
        });

        const newData = JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA));
        newData.points = parseInt(map.points) || 0;
        newData.lastLoginDate = map.lastLoginDate || null;
        if (map.petType) {
            newData.pet = {
                type: map.petType,
                name: map.petName || (map.petType === "usagi" ? "ぴょん" : "ねこ"),
                x: parseFloat(map.petX) || 50,
                y: parseFloat(map.petY) || 85,
                scale: parseFloat(map.petScale) || 1
            };
        }
        newData.ownedItemIds = map.ownedItemIds ? map.ownedItemIds.split("|").filter(Boolean) : [];
        newData.wallpaperId = map.wallpaperId || "default";
        newData.ownedWallpaperIds = map.ownedWallpaperIds
            ? map.ownedWallpaperIds.split("|").filter(Boolean)
            : ["default"];
        if (!newData.ownedWallpaperIds.includes("default")) newData.ownedWallpaperIds.push("default");
        newData.placedItems = items.map(v => {
            const [uid, itemId, x, y, scale, placed, z] = v.split(",");
            return { uid, itemId, x: parseFloat(x), y: parseFloat(y), scale: parseFloat(scale), placed: placed === "true", z: parseInt(z) || 1 };
        });

        roomData = newData;
        saveRoomData();
        renderCurrency();
        renderRoomPreview();
        if (statusEl) statusEl.textContent = "マイルームのデータを読み込みました";
    };
    reader.onerror = () => { if (statusEl) statusEl.textContent = "ファイルの読み込みに失敗しました。"; };
    reader.readAsText(file, "utf-8");
}

// ==========================================
// イベント登録
// ==========================================
function setupRoomEventListeners() {
    document.getElementById("choose-neko")?.addEventListener("click", () => choosePet("neko"));
    document.getElementById("choose-usagi")?.addEventListener("click", () => choosePet("usagi"));
    document.getElementById("btn-confirm-pet-name")?.addEventListener("click", confirmPetName);
    document.getElementById("pet-name-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmPetName(); });

    document.querySelectorAll(".shop-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => setShopTab(btn.dataset.tab));
    });

    document.getElementById("btn-claim-daily-login")?.addEventListener("click", claimDailyLoginBonus);
    document.getElementById("btn-later-daily-login")?.addEventListener("click", () => {
        document.getElementById("modal-daily-login")?.classList.remove("open");
    });

    const petChatInput = document.getElementById("pet-chat-input");
    const petChatSend = document.getElementById("pet-chat-send");
    const sendPetChat = () => {
        if (!petChatInput) return;
        const text = petChatInput.value;
        petChatInput.value = "";
        if (!roomData.pet || petIsAsleep) return;
        petSay(petChatReply(text));
        vibrate(15);
    };
    petChatSend?.addEventListener("click", sendPetChat);
    petChatInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendPetChat();
    });

    document.getElementById("btn-open-shop")?.addEventListener("click", openShop);
    document.getElementById("btn-close-shop")?.addEventListener("click", () => {
        document.getElementById("modal-shop")?.classList.remove("open");
    });

    document.getElementById("btn-open-room-editor")?.addEventListener("click", openRoomEditor);
    document.getElementById("btn-close-room-editor")?.addEventListener("click", closeRoomEditor);

    document.getElementById("pet-room-preview")?.addEventListener("click", () => {
        if (roomDragMoved) return;
        if (!roomData.pet || petIsAsleep) return;
        triggerPetHop();
        if (Math.random() < 0.6) spawnPetReaction("favorite");
    });

    document.getElementById("btn-export-room-csv")?.addEventListener("click", exportRoomAsCsv);
    const inputImportRoomCsv = document.getElementById("input-import-room-csv");
    if (inputImportRoomCsv) {
        inputImportRoomCsv.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importRoomFromCsv(file);
            inputImportRoomCsv.value = "";
        });
    }
}