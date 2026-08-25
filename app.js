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

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
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

    if (summarySpent) summarySpent.textContent = spent.toLocaleString();
    if (summaryBudget) summaryBudget.textContent = budget.toLocaleString();

    if (budgetBox) budgetBox.classList.remove("state-warn", "state-over");

    if (budget <= 0) {
        if (remainingText) remainingText.textContent = "予算が未設定です";
        if (progressFill) progressFill.style.width = "0%";
        return;
    }

    const ratio = spent / budget;
    const percent = Math.min(ratio * 100, 100);
    if (progressFill) progressFill.style.width = `${percent}%`;

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
}

function renderBudgetInputValue() {
    const monthKey = getCurrentMonthKey();
    const budgetInput = document.getElementById("budget-input");
    if (budgetInput) budgetInput.value = appData.budget[monthKey] || "";
}

// ==========================================
// 4. カテゴリ管理
// ==========================================
function getCategoryById(id) {
    return appData.categories.find(c => c.id === id);
}

function renderCategorySelect() {
    const select = document.getElementById("expense-category");
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = appData.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
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
            <span class="category-manage-name">${cat.name}</span>
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
        alert("カテゴリは最低1つ必要です。");
        return;
    }
    const cat = getCategoryById(id);
    if (!cat) return;
    if (!confirm(`「${cat.name}」を削除しますか？\n記録済みの支出は残りのカテゴリに移動されます。`)) return;

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
                <span class="category-badge">${cat.name}</span>
                <div class="card-body">
                    ${exp.memo ? `<h4>${exp.memo}</h4>` : ""}
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
function setupEventListeners() {
    // 予算編集トグル
    const btnEditBudget = document.getElementById("btn-edit-budget");
    if (btnEditBudget) {
        btnEditBudget.addEventListener("click", () => {
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
            const value = parseFloat(budgetInput.value);
            const monthKey = getCurrentMonthKey();
            appData.budget[monthKey] = isNaN(value) || value < 0 ? 0 : value;
            saveData();
            renderBudgetSummary();
            document.getElementById("budget-box-display").classList.remove("hidden");
            document.getElementById("budget-box-edit").classList.remove("open");
        });
    }

    // 支出追加 FAB
    const fabAddExpense = document.getElementById("fab-add-expense");
    if (fabAddExpense) {
        fabAddExpense.addEventListener("click", () => {
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
                    id: Date.now(),
                    amount,
                    categoryId,
                    memo,
                    datetime: isoStr,
                    dateKey: isoStr.split("T")[0],
                    monthKey: getCurrentMonthKey()
                });
            }

            saveData();
            renderBudgetSummary();
            renderExpenseTimeline();
            const modal = document.getElementById("modal-expense");
            if (modal) modal.classList.remove("open");
        });
    }

    // カテゴリ設定モーダル
    const btnOpenCategory = document.getElementById("btn-open-category");
    if (btnOpenCategory) {
        btnOpenCategory.addEventListener("click", () => {
            closeCategoryForm();
            renderCategoryManageList();
            const modal = document.getElementById("modal-category");
            if (modal) modal.classList.add("open");
        });
    }

    // データ管理モーダル
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
                alert("カテゴリ名を入力してください。");
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
                    alert("同じ名前のカテゴリが既にあります。");
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
            // skip, \r\n handled via \n branch
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
    const header = ["日時", "カテゴリ", "金額", "メモ"];
    const rows = [header];
    const sorted = [...appData.expenses].sort((a, b) => a.datetime.localeCompare(b.datetime));
    sorted.forEach(exp => {
        const cat = getCategoryById(exp.categoryId);
        rows.push([exp.datetime, cat ? cat.name : "不明", exp.amount, exp.memo || ""]);
    });

    const csvContent = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
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
    if (!confirm("すべてのデータ（予算・カテゴリ・支出履歴）を削除して初期状態に戻します。この操作は元に戻せません。よろしいですか？")) return;
    if (!confirm("本当によろしいですか？もう一度確認します。")) return;

    appData = JSON.parse(JSON.stringify(DEFAULT_DATA));

    saveData();
    renderPeriodLabel();
    renderBudgetSummary();
    renderExpenseTimeline();
    renderCategorySelect();
    renderCategoryManageList();
    renderBudgetInputValue();
    renderStorageInfo();
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
const ROOM_WALLPAPER = "assets/wallpaper.jpg";

// アイテムIDから決定的に1,000〜5,000円(100円刻み)の価格を出す
const FURNITURE_CATALOG = [
    { id: "nezumi_karakuri", img: "assets/nezumi_karakuri.png", price: 800 },
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
    { id: "danro", img: "assets/danro.png", price: 4800 },
    { id: "window", img: "assets/window.png", price: 3600 },
    { id: "clock", img: "assets/clock.png", price: 1600 },
    { id: "recorder", img: "assets/recorder.png", price: 2500 },
    { id: "tv", img: "assets/tv.png", price: 3500 },
    { id: "tiki", img: "assets/tiki.png", price: 3000 },
    { id: "neko_tower", img: "assets/neko_tower.png", price: 1300 },
    { id: "pet_food", img: "assets/pet_food.png", price: 2300 },
    { id: "pet_bed_01", img: "assets/pet_bed_01.png", price: 4000 },
    { id: "pet_bed_02", img: "assets/pet_bed_02.png", price: 3700 },
    { id: "pet_bed_03", img: "assets/pet_bed_03.png", price: 3900 },
    { id: "globe", img: "assets/globe.png", price: 900 },
    { id: "fishbowl", img: "assets/fishbowl.png", price: 2400 },
    { id: "fishtank", img: "assets/fishtank.png", price: 4000 }
];

const DEFAULT_ROOM_DATA = {
    points: 8888,
    lastLoginDate: null,
    pet: null, // { type: 'neko'|'usagi', x, y, scale }
    ownedItemIds: [], // 購入済みアイテムID（ショップから消える）
    placedItems: [] // { uid, itemId, x, y, scale, placed } placed=falseなら持ち物(未配置)
};

let roomData = loadRoomData();
let petAwakeState = Math.random() < 0.5; // 開いた瞬間にランダムで起きてる/寝てる決定
let roomEditorSelectedUid = null; // 現在ルーム編集中に選択中の要素uid ('pet'固定 or 家具uid)

function loadRoomData() {
    let data;
    try {
        data = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY));
    } catch (e) {
        data = null;
    }
    if (!data) data = JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA));
    if (data.points === undefined) data.points = 0;
    if (!data.ownedItemIds) data.ownedItemIds = [];
    if (!data.placedItems) data.placedItems = [];
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

// ==========================================
// 初期化
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initRoomSystem();
});

function initRoomSystem() {
    renderCurrency();
    setupRoomEventListeners();

    if (!roomData.pet) {
        openPetSelectModal();
    } else {
        maybeShowDailyLoginBonus();
    }

    renderRoomPreview();
}

// ==========================================
// ペット選択（初回）
// ==========================================
function openPetSelectModal() {
    const modal = document.getElementById("modal-pet-select");
    if (modal) modal.classList.add("open");
}

function choosePet(type) {
    roomData.pet = { type, x: 50, y: 62, scale: 1 };
    saveRoomData();
    const modal = document.getElementById("modal-pet-select");
    if (modal) modal.classList.remove("open");
    renderRoomPreview();
    maybeShowDailyLoginBonus();
}

// ==========================================
// デイリーログインボーナス（1日1回・初回起動時）
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
// ルームプレビュー（メイン画面の小さい箱）
// ==========================================
function renderRoomScene(container, interactive) {
    if (!container) return;
    container.innerHTML = "";
    container.style.backgroundImage = `url("${ROOM_WALLPAPER}")`;

    if (roomData.pet) {
        const petEl = createPetElement(interactive, container);
        container.appendChild(petEl);
    }

    roomData.placedItems.filter(it => it.placed).forEach(it => {
        const el = createFurnitureElement(it, interactive, container);
        container.appendChild(el);
    });
}

function renderRoomPreview() {
    renderRoomScene(document.getElementById("room-scene-preview"), false);
}

function createPetElement(interactive, container) {
    const awake = petAwakeState;
    const type = roomData.pet.type;
    const img = `assets/${type}_${awake ? "awake" : "sleep"}.png`;
    const el = document.createElement("div");
    el.className = "room-item pet-item";
    el.style.left = roomData.pet.x + "%";
    el.style.top = roomData.pet.y + "%";
    el.style.setProperty("--scale", roomData.pet.scale || 1);
    el.innerHTML = `<img src="${img}" alt="${type}" draggable="false">`;
    if (interactive) {
        el.dataset.uid = "pet";
        makeItemDraggable(el, "pet", container);
    }
    return el;
}

function createFurnitureElement(placedItem, interactive, container) {
    const furniture = getFurnitureById(placedItem.itemId);
    const el = document.createElement("div");
    el.className = "room-item furniture-item";
    el.style.left = placedItem.x + "%";
    el.style.top = placedItem.y + "%";
    el.style.setProperty("--scale", placedItem.scale || 1);
    el.style.zIndex = placedItem.z || 1;
    el.innerHTML = `<img src="${furniture ? furniture.img : ""}" alt="" draggable="false">`;
    if (interactive) {
        el.dataset.uid = placedItem.uid;
        makeItemDraggable(el, placedItem.uid, container);
    }
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

// タップでルーム中央に配置 → ドラッグ/リサイズ → 確定
// （元は長押しだったが、トレイが横スクロールできるため、スクロール操作と
//   ぶつかって反応しないことがあった。タップ一発で置けるようにした）
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

// ドラッグで移動 + 選択 + 角ハンドルでリサイズ
// ※ canvas は要素をDOMに追加する前に呼び出し元から渡してもらう
//   （el.closest() で探そうとすると、まだ親についていないため常にnullになってしまう）
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
        let newTop = Math.min(100, Math.max(0, origTopPct + dyPct));
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
        roomData.pet.y = y;
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
        const controls = document.createElement("div");
        controls.className = "item-controls";
        controls.innerHTML = `
            <button class="item-control-btn layer-up" title="前面へ"><span class="material-icons-round">arrow_upward</span></button>
            <button class="item-control-btn layer-down" title="背面へ"><span class="material-icons-round">arrow_downward</span></button>
            <button class="item-control-btn confirm" title="配置を確定"><span class="material-icons-round">check</span></button>
            <button class="item-control-btn remove" title="持ち物に戻す"><span class="material-icons-round">inventory_2</span></button>
        `;
        controls.querySelector(".layer-up").addEventListener("pointerdown", (e) => { e.stopPropagation(); changeItemLayer(uid, 1); });
        controls.querySelector(".layer-down").addEventListener("pointerdown", (e) => { e.stopPropagation(); changeItemLayer(uid, -1); });
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

// 前面(+1)／背面(-1)へ重なり順を1段階ずらす
function changeItemLayer(uid, direction) {
    if (uid === "pet") return;
    const item = roomData.placedItems.find(it => it.uid === uid);
    if (!item) return;
    item.z = Math.max(1, Math.min(50, (item.z || 1) + direction));
    saveRoomData();
    const el = document.querySelector(`#room-editor-canvas .room-item[data-uid="${uid}"]`);
    if (el) el.style.zIndex = item.z;
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
function openShop() {
    renderShopGrid();
    renderCurrency();
    const modal = document.getElementById("modal-shop");
    if (modal) modal.classList.add("open");
}

function renderShopGrid() {
    const grid = document.getElementById("shop-grid");
    const emptyHint = document.getElementById("shop-empty-hint");
    if (!grid) return;
    grid.innerHTML = "";

    const available = FURNITURE_CATALOG.filter(f => !roomData.ownedItemIds.includes(f.id));

    if (available.length === 0) {
        if (emptyHint) emptyHint.style.display = "block";
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
}

// ==========================================
// マイルームCSV バックアップ
// ==========================================
function exportRoomAsCsv() {
    const rows = [["key", "value"]];
    rows.push(["points", roomData.points]);
    rows.push(["lastLoginDate", roomData.lastLoginDate || ""]);
    rows.push(["petType", roomData.pet ? roomData.pet.type : ""]);
    rows.push(["petX", roomData.pet ? roomData.pet.x : ""]);
    rows.push(["petY", roomData.pet ? roomData.pet.y : ""]);
    rows.push(["petScale", roomData.pet ? roomData.pet.scale : ""]);
    rows.push(["ownedItemIds", roomData.ownedItemIds.join("|")]);
    roomData.placedItems.forEach((it, i) => {
        rows.push([`item_${i}`, `${it.uid},${it.itemId},${it.x},${it.y},${it.scale},${it.placed},${it.z || 1}`]);
    });

    const csvContent = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
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
                x: parseFloat(map.petX) || 50,
                y: parseFloat(map.petY) || 62,
                scale: parseFloat(map.petScale) || 1
            };
        }
        newData.ownedItemIds = map.ownedItemIds ? map.ownedItemIds.split("|").filter(Boolean) : [];
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

    document.getElementById("btn-claim-daily-login")?.addEventListener("click", claimDailyLoginBonus);

    document.getElementById("btn-open-shop")?.addEventListener("click", openShop);
    document.getElementById("btn-close-shop")?.addEventListener("click", () => {
        document.getElementById("modal-shop")?.classList.remove("open");
    });

    document.getElementById("pet-room-preview")?.addEventListener("click", openRoomEditor);
    document.getElementById("btn-close-room-editor")?.addEventListener("click", closeRoomEditor);

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
