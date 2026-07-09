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
