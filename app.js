// ================================================================
// ▼ app.js
// ================================================================

// ==========================================
// 0. 基盤層 — ストレージキー / スキーマ / ID / 時刻 / マイグレーション
// ==========================================
const SCHEMA_VERSION = 4;
const STORAGE_KEY = "yoyu_aru_data";
const ROOM_STORAGE_KEY = "yoyu_aru_room_data";

function newId() {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
    } catch (e) { /* 使えない環境はフォールバックへ */ }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function localDateKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localMonthKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
    const parts = String(monthKey || "").split("-");
    if (parts.length < 2) return "";
    return `${parts[0]}年${parseInt(parts[1], 10)}月`;
}

function addMonths(monthKey, delta) {
    const parts = String(monthKey || "").split("-").map(n => parseInt(n, 10));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return localMonthKey(new Date());
    return localMonthKey(new Date(parts[0], parts[1] - 1 + delta, 1));
}

function toDatetimeLocalValue(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocalValue(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(
        parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
        parseInt(m[4], 10), parseInt(m[5], 10), 0, 0
    );
    return isNaN(d.getTime()) ? null : d;
}

// ==========================================
// 1. デフォルトデータ
// ==========================================
const DEFAULT_CATEGORIES = [
    { id: "cat-food", name: "食費" },
    { id: "cat-daily", name: "日用品" },
    { id: "cat-transport", name: "交通費" },
    { id: "cat-fun", name: "娯楽" },
    { id: "cat-medical", name: "医療" },
    { id: "cat-other", name: "その他" }
];

const DEFAULT_CATEGORY_ID_BY_NAME = {
    "食費": "cat-food",
    "日用品": "cat-daily",
    "交通費": "cat-transport",
    "娯楽": "cat-fun",
    "医療": "cat-medical",
    "その他": "cat-other"
};

const DEFAULT_DATA = {
    schemaVersion: SCHEMA_VERSION,
    ownerId: null,
    budget: {},
    budgetUpdatedAt: {},
    categoryBudget: {},
    categoryBudgetUpdatedAt: {},
    categories: [],
    plan: null,
    expenses: []
};

function cloneDefaultCategories() {
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}

function cloneDefaultData() {
    const d = JSON.parse(JSON.stringify(DEFAULT_DATA));
    d.categories = cloneDefaultCategories();
    return d;
}

function safeParse(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

function normalizeItem(item) {
    const it = item && typeof item === "object" ? item : {};
    return {
        id: typeof it.id === "string" && it.id ? it.id : newId(),
        name: String(it.name || ""),
        price: Number(it.price) || 0,
        qty: Number(it.qty) || 1,
        categoryId: it.categoryId ? String(it.categoryId) : null
    };
}

// カテゴリ別予算は「月 → { カテゴリID: 金額 }」。
// 消えたカテゴリや 0 円以下は保存しない。
function sanitizeCategoryBudgetMap(raw, categories) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    const validIds = new Set((Array.isArray(categories) ? categories : []).map(c => String(c.id)));
    Object.keys(raw).forEach(id => {
        const amount = Number(raw[id]);
        if (!validIds.has(String(id))) return;
        if (!isFinite(amount) || amount <= 0) return;
        out[String(id)] = Math.round(amount);
    });
    return out;
}

function migrateData(raw) {
    let data = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : cloneDefaultData();
    const from = Number(data.schemaVersion) || 0;

    if (!data.budget || typeof data.budget !== "object" || Array.isArray(data.budget)) data.budget = {};
    if (!Array.isArray(data.expenses)) data.expenses = [];
    if (!Array.isArray(data.categories) || data.categories.length === 0) {
        data.categories = cloneDefaultCategories();
    }
    if (data.ownerId === undefined) data.ownerId = null;
    if (!data.budgetUpdatedAt || typeof data.budgetUpdatedAt !== "object" || Array.isArray(data.budgetUpdatedAt)) {
        data.budgetUpdatedAt = {};
    }
    if (!data.categoryBudget || typeof data.categoryBudget !== "object" || Array.isArray(data.categoryBudget)) {
        data.categoryBudget = {};
    }
    if (!data.categoryBudgetUpdatedAt || typeof data.categoryBudgetUpdatedAt !== "object" || Array.isArray(data.categoryBudgetUpdatedAt)) {
        data.categoryBudgetUpdatedAt = {};
    }

    if (from < 2) {
        const idMap = {};
        const usedCategoryIds = new Set();
        data.categories = data.categories.map((cat, index) => {
            const rawCat = cat && typeof cat === "object" ? cat : {};
            const oldId = rawCat.id !== undefined && rawCat.id !== null ? String(rawCat.id) : "";
            let nextId;
            if (oldId.indexOf("cat-") === 0) {
                nextId = oldId;
            } else {
                nextId = DEFAULT_CATEGORY_ID_BY_NAME[rawCat.name];
                if (!nextId || usedCategoryIds.has(nextId)) nextId = newId();
            }
            usedCategoryIds.add(nextId);
            if (oldId) idMap[oldId] = nextId;
            return { id: nextId, name: String(rawCat.name || `カテゴリ${index + 1}`) };
        });
        const fallbackCategoryId = data.categories[0].id;

        const usedExpenseIds = new Set();
        data.expenses = data.expenses.map(exp => {
            const e = exp && typeof exp === "object" ? exp : {};

            let id = e.id !== undefined && e.id !== null ? String(e.id) : "";
            if (!id || usedExpenseIds.has(id)) id = newId();
            while (usedExpenseIds.has(id)) id = newId();
            usedExpenseIds.add(id);

            const parsed = new Date(e.datetime);
            const when = isNaN(parsed.getTime()) ? new Date() : parsed;

            return {
                id: id,
                amount: Number(e.amount) || 0,
                categoryId: idMap[String(e.categoryId)] || fallbackCategoryId,
                memo: typeof e.memo === "string" ? e.memo : "",
                store: typeof e.store === "string" ? e.store : "",
                items: Array.isArray(e.items) ? e.items.map(normalizeItem) : [],
                datetime: when.toISOString(),
                dateKey: localDateKey(when),
                monthKey: localMonthKey(when),
                source: e.source || "manual",
                deletedAt: e.deletedAt || null
            };
        });

        delete data.nextCategoryId;
    }

    if (from < 3) {
        data.expenses = data.expenses.map(e => {
            if (!e || typeof e !== "object") return e;
            const fallback = e.datetime || new Date().toISOString();
            return Object.assign({}, e, {
                createdAt: e.createdAt || fallback,
                updatedAt: e.updatedAt || e.deletedAt || fallback
            });
        });
        if (data.plan === undefined) data.plan = null;
    }

    // カテゴリ別予算（v4）。古いデータには無いので、空のままでも動く。
    const cleanedCategoryBudget = {};
    Object.keys(data.categoryBudget).forEach(monthKey => {
        if (!/^\d{4}-\d{2}$/.test(monthKey)) return;
        const map = sanitizeCategoryBudgetMap(data.categoryBudget[monthKey], data.categories);
        if (Object.keys(map).length > 0) cleanedCategoryBudget[monthKey] = map;
    });
    data.categoryBudget = cleanedCategoryBudget;

    data.schemaVersion = SCHEMA_VERSION;
    return data;
}

let appData = migrateData(safeParse(localStorage.getItem(STORAGE_KEY)));

let selectedMonthKey = localMonthKey(new Date());

let categoryFormMode = "add";

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

// ------------------------------------------
// 端末ごとの設定（データ移行のコードには含めない）
// ------------------------------------------
const PREFS_KEY = "yoyu_aru_prefs";
const DEFAULT_PREFS = { sound: true, haptics: true, lastBackupAt: null, backupRemindedAt: null };
let appPrefs = loadPrefs();

function loadPrefs() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null"); } catch (e) { saved = null; }
    return Object.assign({}, DEFAULT_PREFS, (saved && typeof saved === "object") ? saved : {});
}

function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(appPrefs)); } catch (e) { /* 設定は保存できなくても動く */ }
}

function markBackupDone() {
    appPrefs.lastBackupAt = new Date().toISOString();
    savePrefs();
    renderBackupBanner();
}

let audioCtx = null;
function playTone(freq, duration, type = "sine", volume = 0.12) {
    if (!appPrefs.sound) return;
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
function vibrate(ms = 18) { if (appPrefs.haptics && navigator.vibrate) navigator.vibrate(ms); }

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
    initRoomSystem();
});

// .app-container は overflow:hidden だが、下にはみ出した閉じ中のモーダルのせいで
// プログラムからはスクロールできてしまう。入力欄の focus() や scrollIntoView で
// 画面全体が押し上げられて戻せなくなるのを防ぐ。（CSS の overflow:clip が効かない古い端末向けの保険）
function lockAppShellScroll() {
    const shell = document.querySelector(".app-container");
    if (!shell) return;
    shell.addEventListener("scroll", () => {
        if (shell.scrollTop !== 0 || shell.scrollLeft !== 0) {
            shell.scrollTop = 0;
            shell.scrollLeft = 0;
        }
    }, { passive: true });
}

// 予期しないエラーが出たとき、画面が黙って固まらないようにお知らせする
let lastErrorToastAt = 0;
function reportUnexpectedError() {
    const now = Date.now();
    if (now - lastErrorToastAt < 10000) return;
    lastErrorToastAt = now;
    try { showToast("うまく動かない操作がありました。続くときは再読み込みしてください"); } catch (e) { /* 通知自体の失敗は無視 */ }
}
window.addEventListener("error", (e) => {
    if (e && /ResizeObserver/i.test(String(e.message || ""))) return;
    reportUnexpectedError();
});
window.addEventListener("unhandledrejection", () => reportUnexpectedError());

// ブラウザの自動掃除でデータが消えにくいように、永続ストレージを申請する
function requestPersistentStorage() {
    try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) { /* 非対応は無視 */ }
}

// オフラインでも開けるようにする（https または localhost のときだけ）
function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

const BACKUP_REMIND_AFTER_DAYS = 30;
const BACKUP_REMIND_REPEAT_DAYS = 7;

function daysSince(iso) {
    if (!iso) return Infinity;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return Infinity;
    return (Date.now() - t) / 86400000;
}

function shouldShowBackupBanner() {
    if (activeExpenses().length < 5) return false;
    if (daysSince(appPrefs.lastBackupAt) < BACKUP_REMIND_AFTER_DAYS) return false;
    if (daysSince(appPrefs.backupRemindedAt) < BACKUP_REMIND_REPEAT_DAYS) return false;
    return true;
}

function renderBackupBanner() {
    const el = document.getElementById("backup-banner");
    if (!el) return;
    if (!shouldShowBackupBanner()) { el.style.display = "none"; return; }
    const d = daysSince(appPrefs.lastBackupAt);
    const text = document.getElementById("backup-banner-text");
    if (text) {
        text.textContent = Number.isFinite(d)
            ? `最後のバックアップから ${Math.floor(d)} 日たちました。コードを保存しておくと安心です。`
            : "まだバックアップがありません。コードを保存しておくと、端末が壊れても安心です。";
    }
    el.style.display = "flex";
}

function initApp() {
    lockAppShellScroll();
    requestPersistentStorage();
    registerServiceWorker();
    saveData();
    renderBackupBanner();
    renderMonthNav();
    renderPeriodLabel();
    renderBudgetSummary();
    renderCategorySelect();
    renderCategoryManageList();
    renderFilterCategoryOptions();
    renderBudgetInputValue();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
}

let lastSaveWarnAt = 0;
function warnSaveFailed() {
    const now = Date.now();
    if (now - lastSaveWarnAt < 15000) return;
    lastSaveWarnAt = now;
    alert("データを保存できませんでした。\nブラウザの保存容量がいっぱいか、プライベートモードの可能性があります。\n「データ移行」でコードを保存しておくと安心です。");
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        return true;
    } catch (e) {
        warnSaveFailed();
        return false;
    }
}

function activeExpenses() {
    return appData.expenses.filter(e => !e.deletedAt);
}

function expensesOfMonth(monthKey) {
    return activeExpenses().filter(e => e.monthKey === monthKey);
}

// ==========================================
// 2. 年月ユーティリティ
// ==========================================
function getCurrentMonthKey() {
    return localMonthKey(new Date());
}

function getViewMonthKey() {
    return selectedMonthKey;
}

function isViewingCurrentMonth() {
    return selectedMonthKey === getCurrentMonthKey();
}

function getCurrentPeriodLabel() {
    return `${formatMonthLabel(selectedMonthKey)}の予算`;
}

function renderPeriodLabel() {
    const label = document.getElementById("budget-period-label");
    if (label) label.textContent = getCurrentPeriodLabel();
}

function setViewMonth(monthKey) {
    const current = getCurrentMonthKey();
    selectedMonthKey = monthKey > current ? current : monthKey;
    renderMonthNav();
    renderPeriodLabel();
    renderBudgetSummary();
    renderBudgetInputValue();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
}

function renderMonthNav() {
    const label = document.getElementById("month-nav-label");
    if (label) label.textContent = formatMonthLabel(selectedMonthKey);

    const nextBtn = document.getElementById("btn-next-month");
    if (nextBtn) nextBtn.disabled = selectedMonthKey >= getCurrentMonthKey();

    const todayBtn = document.getElementById("btn-this-month");
    if (todayBtn) todayBtn.style.display = isViewingCurrentMonth() ? "none" : "inline-flex";

    const note = document.getElementById("month-past-note");
    if (note) note.style.display = isViewingCurrentMonth() ? "none" : "block";
}

function renderBreakdownTitle() {
    const el = document.getElementById("breakdown-title-text");
    if (el) el.textContent = `${formatMonthLabel(selectedMonthKey)}の内訳`;
}

// ==========================================
// 3. 予算サマリー
// ==========================================
function renderBudgetSummary() {
    const monthKey = getViewMonthKey();
    const budget = appData.budget[monthKey] || 0;
    const spent = expensesOfMonth(monthKey).reduce((sum, e) => sum + e.amount, 0);

    const summarySpent = document.getElementById("summary-spent");
    const summaryBudget = document.getElementById("summary-budget");
    const remainingText = document.getElementById("budget-remaining-text");
    const heroLabel = document.getElementById("budget-hero-label");
    const categorySummary = document.getElementById("budget-category-summary");
    const progressFill = document.getElementById("budget-progress-fill");
    const budgetBox = document.getElementById("budget-box");
    const fab = document.getElementById("fab-add-expense");
    const btnEditBudget = document.getElementById("btn-edit-budget");

    const categoryBudgetTotal = Object.values(getCategoryBudgetMap(monthKey))
        .reduce((sum, amount) => sum + (Number(amount) || 0), 0);
    if (categorySummary) {
        categorySummary.textContent = categoryBudgetTotal > 0
            ? `カテゴリ予算の合計 ${categoryBudgetTotal.toLocaleString()} 円`
            : "";
        categorySummary.classList.toggle("is-over", budget > 0 && categoryBudgetTotal > budget);
    }

    if (heroLabel) {
        heroLabel.textContent = isViewingCurrentMonth()
            ? "今月の余裕"
            : `${formatMonthLabel(monthKey)}の余裕`;
    }

    if (btnEditBudget) btnEditBudget.style.display = "inline-flex";

    if (fab) fab.classList.toggle("needs-budget", isViewingCurrentMonth() && budget <= 0);

    if (summarySpent) summarySpent.textContent = spent.toLocaleString();
    if (summaryBudget) summaryBudget.textContent = budget.toLocaleString();

    if (budgetBox) budgetBox.classList.remove("state-warn", "state-over");

    if (budget <= 0) {
        if (remainingText) {
            remainingText.textContent = isViewingCurrentMonth()
                ? "予算を決めよう"
                : "予算なし";
        }
        if (progressFill) progressFill.style.width = "0%";
        petWasOverBudget = false;
        refreshPetMood();
        return;
    }

    const ratio = spent / budget;
    const percent = Math.min(ratio * 100, 100);
    if (progressFill) progressFill.style.width = `${percent}%`;

    const remaining = budget - spent;
    if (remainingText) {
        remainingText.textContent = remaining >= 0
            ? `${remaining.toLocaleString()} 円`
            : `${Math.abs(remaining).toLocaleString()} 円 超過`;
    }

    if (budgetBox) {
        if (ratio > 1) budgetBox.classList.add("state-over");
        else if (ratio >= 0.8) budgetBox.classList.add("state-warn");
    }

    const isOverNow = ratio > 1;
    if (isOverNow && !petWasOverBudget) petFeelDown();
    petWasOverBudget = isOverNow;

    refreshPetMood();
}

// ------------------------------------------
// カテゴリ別予算
// ------------------------------------------
function getCategoryBudgetMap(monthKey) {
    const map = appData.categoryBudget && appData.categoryBudget[monthKey];
    return (map && typeof map === "object" && !Array.isArray(map)) ? map : {};
}

function getCategoryBudgetTotal(monthKey) {
    return Object.values(getCategoryBudgetMap(monthKey))
        .reduce((sum, amount) => sum + (Number(amount) || 0), 0);
}

// 過去 monthsBack か月の平均支出から、カテゴリ予算のたたき台を作る。
// データが無い月は分母に入れない（1か月分しか無いのに 1/3 にならないように）。
function suggestCategoryBudgets(expenses, categories, monthKey, monthsBack) {
    const back = Math.max(1, Number(monthsBack) || 3);
    const months = [];
    for (let i = 0; i < back; i++) months.push(addMonths(monthKey, -i));
    const monthSet = new Set(months);
    const totals = {};
    const monthsWithData = new Set();

    (Array.isArray(expenses) ? expenses : []).forEach(exp => {
        if (!exp || exp.deletedAt) return;
        if (!monthSet.has(exp.monthKey)) return;
        const cid = String(exp.categoryId);
        totals[cid] = (totals[cid] || 0) + (Number(exp.amount) || 0);
        monthsWithData.add(exp.monthKey);
    });

    const divisor = Math.max(1, monthsWithData.size);
    const out = {};
    (Array.isArray(categories) ? categories : []).forEach(cat => {
        const average = (totals[String(cat.id)] || 0) / divisor;
        if (average < 100) return;
        out[String(cat.id)] = Math.round(average / 100) * 100;
    });
    return out;
}

function renderCategoryBudgetEditor() {
    const list = document.getElementById("category-budget-list");
    const desc = document.getElementById("category-budget-desc");
    if (!list) return;

    const monthKey = getViewMonthKey();
    const budgets = getCategoryBudgetMap(monthKey);
    const spentLabel = isViewingCurrentMonth() ? "今月" : formatMonthLabel(monthKey);
    const spentByCategory = {};
    expensesOfMonth(monthKey).forEach(exp => {
        const cid = String(exp.categoryId);
        spentByCategory[cid] = (spentByCategory[cid] || 0) + (Number(exp.amount) || 0);
    });

    if (desc) {
        desc.textContent = `${formatMonthLabel(monthKey)}、カテゴリごとに使える金額を決めます。空欄のカテゴリは「決めない」になります。`;
    }

    list.innerHTML = "";
    appData.categories.forEach(cat => {
        const row = document.createElement("label");
        row.className = "category-budget-row";
        const amount = Number(budgets[String(cat.id)]) || 0;
        const spent = spentByCategory[String(cat.id)] || 0;
        row.innerHTML = `
            <span class="category-budget-main">
                <span class="category-budget-name">${escapeHtml(cat.name)}</span>
                <span class="category-budget-spent">${spentLabel}の支出 ${spent.toLocaleString()} 円</span>
            </span>
            <span class="category-budget-input-wrap">
                <input type="number" class="category-budget-input" data-cat-id="${escapeHtml(cat.id)}"
                       value="${amount > 0 ? amount : ""}" min="0" step="100" placeholder="未設定"
                       inputmode="numeric" aria-label="${escapeHtml(cat.name)}の予算">
                <span class="category-budget-unit">円</span>
            </span>
        `;
        list.appendChild(row);
    });

    updateCategoryBudgetTotal();
}

function updateCategoryBudgetTotal() {
    const totalEl = document.getElementById("category-budget-total");
    if (!totalEl) return;
    let total = 0;
    document.querySelectorAll("#category-budget-list .category-budget-input").forEach(input => {
        const n = parseFloat(input.value);
        if (isFinite(n) && n > 0) total += Math.round(n);
    });
    const monthKey = getViewMonthKey();
    const budget = Number(appData.budget[monthKey]) || 0;
    totalEl.textContent = budget > 0
        ? `合計 ${total.toLocaleString()} 円 / 総予算 ${budget.toLocaleString()} 円`
        : `合計 ${total.toLocaleString()} 円`;
    totalEl.classList.toggle("is-over", budget > 0 && total > budget);
}

function openCategoryBudgetModal() {
    renderCategoryBudgetEditor();
    document.getElementById("modal-category-budget")?.classList.add("open");
}

function applySuggestedCategoryBudgets() {
    const suggested = suggestCategoryBudgets(appData.expenses, appData.categories, getViewMonthKey(), 3);
    const list = document.getElementById("category-budget-list");
    if (!list) return;
    list.querySelectorAll(".category-budget-input").forEach(input => {
        const value = suggested[String(input.dataset.catId)];
        input.value = value ? value : "";
    });
    updateCategoryBudgetTotal();
    showToast(Object.keys(suggested).length > 0
        ? "過去3か月の平均から提案しました。金額は自由に直せます"
        : "提案できるだけの記録がまだありません");
}

function saveCategoryBudgets() {
    const monthKey = getViewMonthKey();
    if (!appData.categoryBudget || typeof appData.categoryBudget !== "object" || Array.isArray(appData.categoryBudget)) {
        appData.categoryBudget = {};
    }
    if (!appData.categoryBudgetUpdatedAt || typeof appData.categoryBudgetUpdatedAt !== "object" || Array.isArray(appData.categoryBudgetUpdatedAt)) {
        appData.categoryBudgetUpdatedAt = {};
    }
    const map = {};
    document.querySelectorAll("#category-budget-list .category-budget-input").forEach(input => {
        const catId = String(input.dataset.catId || "");
        const amount = parseFloat(input.value);
        if (!catId || !isFinite(amount) || amount <= 0) return;
        map[catId] = Math.round(amount);
    });

    if (Object.keys(map).length > 0) {
        appData.categoryBudget[monthKey] = map;
        appData.categoryBudgetUpdatedAt[monthKey] = new Date().toISOString();
    } else {
        delete appData.categoryBudget[monthKey];
        delete appData.categoryBudgetUpdatedAt[monthKey];
    }

    saveData();
    document.getElementById("modal-category-budget")?.classList.remove("open");
    renderBudgetSummary();
    renderBreakdown();
    renderCharts();
    showToast(Object.keys(map).length > 0
        ? `${formatMonthLabel(monthKey)}のカテゴリ予算を保存しました`
        : "カテゴリ予算をクリアしました");
}

function renderBudgetInputValue() {
    const budgetInput = document.getElementById("budget-input");
    if (budgetInput) budgetInput.value = appData.budget[getViewMonthKey()] || "";
}

// ==========================================
// 4. カテゴリ管理
// ==========================================
function getCategoryById(id) {
    if (id === undefined || id === null) return undefined;
    const key = String(id);
    return appData.categories.find(c => String(c.id) === key);
}

function renderCategorySelect() {
    const select = document.getElementById("expense-category");
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = appData.categories
        .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
        .join("");
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
                <span class="material-icons-round" data-cat-action="edit" data-cat-id="${escapeHtml(cat.id)}" title="編集">edit</span>
                <span class="material-icons-round delete-icon" data-cat-action="delete" data-cat-id="${escapeHtml(cat.id)}" title="削除">delete</span>
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

function startEditCategory(id) {
    const cat = getCategoryById(id);
    if (!cat) return;
    document.getElementById("cat-edit-id").value = cat.id;
    document.getElementById("cat-form-name").value = cat.name;
    openCategoryForm("edit");
}

function deleteCategoryById(id) {
    if (appData.categories.length <= 1) {
        alert("カテゴリは最低1つ必要です。");
        return;
    }
    const cat = getCategoryById(id);
    if (!cat) return;
    if (!confirm(`「${cat.name}」を削除しますか？\n記録済みの支出は残りのカテゴリに移動されます。`)) return;

    appData.categories = appData.categories.filter(c => String(c.id) !== String(id));
    const fallbackId = appData.categories[0].id;
    appData.expenses.forEach(e => {
        if (String(e.categoryId) === String(id)) {
            e.categoryId = fallbackId;
            e.updatedAt = new Date().toISOString();
        }
    });

    // 消したカテゴリの予算が「不明」として残らないように取り除く
    if (appData.categoryBudget && typeof appData.categoryBudget === "object") {
        Object.keys(appData.categoryBudget).forEach(monthKey => {
            const map = appData.categoryBudget[monthKey];
            if (!map || typeof map !== "object") return;
            delete map[String(id)];
            if (Object.keys(map).length === 0) {
                delete appData.categoryBudget[monthKey];
                if (appData.categoryBudgetUpdatedAt) delete appData.categoryBudgetUpdatedAt[monthKey];
            } else if (appData.categoryBudgetUpdatedAt) {
                appData.categoryBudgetUpdatedAt[monthKey] = new Date().toISOString();
            }
        });
    }

    saveData();
    renderCategoryManageList();
    renderCategorySelect();
    renderFilterCategoryOptions();
    renderExpenseTimeline();
    renderCharts();
    closeCategoryForm();
}

// ==========================================
// 4.5 絞り込み
// ==========================================
const DEFAULT_FILTER = {
    keyword: "",
    categoryId: "",
    min: null,
    max: null,
    from: "",
    to: "",
    sort: "date-desc"
};

let expenseFilter = Object.assign({}, DEFAULT_FILTER);

function isFilterActive() {
    const f = expenseFilter;
    return !!(f.keyword || f.categoryId || f.min !== null || f.max !== null || f.from || f.to);
}

function readFilterFromForm() {
    const val = (id) => {
        const el = document.getElementById(id);
        return el ? String(el.value || "").trim() : "";
    };
    const num = (id) => {
        const el = document.getElementById(id);
        if (!el || el.value === "") return null;
        const n = parseFloat(el.value);
        return isNaN(n) ? null : n;
    };
    expenseFilter = {
        keyword: val("filter-keyword").toLowerCase(),
        categoryId: val("filter-category"),
        min: num("filter-min"),
        max: num("filter-max"),
        from: val("filter-from"),
        to: val("filter-to"),
        sort: val("filter-sort") || DEFAULT_FILTER.sort
    };
}

function matchesFilter(exp) {
    const f = expenseFilter;
    if (f.categoryId && String(exp.categoryId) !== f.categoryId) return false;

    const amount = Number(exp.amount) || 0;
    if (f.min !== null && amount < f.min) return false;
    if (f.max !== null && amount > f.max) return false;

    const day = exp.dateKey || localDateKey(exp.datetime);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;

    if (f.keyword) {
        const haystack = [
            exp.memo || "",
            exp.store || "",
            ...(Array.isArray(exp.items) ? exp.items.map(it => it.name || "") : [])
        ].join(" ").toLowerCase();
        if (haystack.indexOf(f.keyword) === -1) return false;
    }
    return true;
}

function applyFilter(expenses) {
    const sorters = {
        "date-desc": (a, b) => String(b.datetime).localeCompare(String(a.datetime)),
        "date-asc": (a, b) => String(a.datetime).localeCompare(String(b.datetime)),
        "amount-desc": (a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0),
        "amount-asc": (a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0)
    };
    const sorter = sorters[expenseFilter.sort] || sorters["date-desc"];
    return expenses.filter(matchesFilter).sort(sorter);
}

function renderFilterCategoryOptions() {
    const select = document.getElementById("filter-category");
    if (!select) return;
    const prev = select.value;
    select.innerHTML = `<option value="">すべてのカテゴリ</option>` +
        appData.categories
            .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
            .join("");
    if (appData.categories.some(c => String(c.id) === prev)) select.value = prev;
}

function clearFilter() {
    expenseFilter = Object.assign({}, DEFAULT_FILTER);
    ["filter-keyword", "filter-min", "filter-max", "filter-from", "filter-to"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const cat = document.getElementById("filter-category");
    if (cat) cat.value = "";
    const sort = document.getElementById("filter-sort");
    if (sort) sort.value = DEFAULT_FILTER.sort;
    renderExpenseTimeline();
}

function updateFilterIndicator(count, total) {
    const el = document.getElementById("filter-count");
    if (!el) return;
    el.textContent = isFilterActive()
        ? `${count}件 / ${total.toLocaleString()}円`
        : "";
}

// ==========================================
// 5. 支出タイムライン
// ==========================================
function renderExpenseTimeline() {
    renderBreakdownTitle();
    renderBreakdown();
    renderRoomLevel();

    const container = document.getElementById("expense-timeline");
    if (!container) return;
    container.innerHTML = "";

    const monthKey = getViewMonthKey();
    const monthExpenses = expensesOfMonth(monthKey);

    if (monthExpenses.length === 0) {
        updateFilterIndicator(0, 0);
        container.innerHTML = `<p class="timeline-empty-hint">${
            isViewingCurrentMonth() ? "今月の支出はまだ記録されていません"
                                    : `${formatMonthLabel(monthKey)}の支出は記録されていません`
        }</p>`;
        return;
    }

    const visible = applyFilter(monthExpenses);
    updateFilterIndicator(visible.length, visible.reduce((s, e) => s + (Number(e.amount) || 0), 0));

    if (visible.length === 0) {
        container.innerHTML = `<p class="timeline-empty-hint">条件に合う支出がありません</p>`;
        return;
    }

    const sorted = visible;

    let lastDateKey = null;
    sorted.forEach(exp => {
        const cat = getCategoryById(exp.categoryId) || { name: "不明" };

        const dayKey = exp.dateKey || localDateKey(exp.datetime);
        if (dayKey !== lastDateKey) {
            lastDateKey = dayKey;
            const divider = document.createElement("div");
            divider.className = "timeline-date-divider";
            divider.innerHTML = `<span>${formatDateLabel(exp.datetime)}</span>`;
            container.appendChild(divider);
        }

        const items = Array.isArray(exp.items) ? exp.items : [];
        const itemsHtml = items.length > 0
            ? `<button class="card-detail-toggle" data-action="toggle" type="button">
                   明細 ${items.length}点 <span class="material-icons-round">expand_more</span>
               </button>
               <div class="card-items" hidden>
                   ${items.map(it => `
                       <div class="card-item-row">
                           <span class="card-item-name">${escapeHtml(it.name || "（名称なし）")}${
                               Number(it.qty) > 1 ? ` ×${Number(it.qty)}` : ""
                           }</span>
                           <span class="card-item-price">${(Number(it.price) || 0).toLocaleString()} 円</span>
                       </div>
                   `).join("")}
               </div>`
            : "";

        const card = document.createElement("div");
        card.className = "card";
        card.dataset.expId = exp.id;
        card.innerHTML = `
            <div class="card-info">
                <span class="category-badge">${escapeHtml(cat.name)}</span>
                ${exp.store ? `<span class="card-store"><span class="material-icons-round">storefront</span>${escapeHtml(exp.store)}</span>` : ""}
                <div class="card-body">
                    ${exp.memo ? `<h4>${escapeHtml(exp.memo)}</h4>` : ""}
                </div>
                <span class="badge-time">${formatTimeLabel(exp.datetime)}</span>
                ${itemsHtml}
            </div>
            <div class="card-right">
                <span class="main-amount">${(Number(exp.amount) || 0).toLocaleString()} 円</span>
                <div class="card-actions">
                    <span class="material-icons-round" data-action="edit" title="編集">edit</span>
                    <span class="material-icons-round delete-icon" data-action="delete" title="削除">delete</span>
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

    const monthKey = getViewMonthKey();
    const monthExpenses = expensesOfMonth(monthKey);
    const categoryBudgets = getCategoryBudgetMap(monthKey);
    const budgetIds = Object.keys(categoryBudgets);

    if (monthExpenses.length === 0 && budgetIds.length === 0) {
        list.innerHTML = `<p class="breakdown-empty">${
            isViewingCurrentMonth() ? "今月の支出はまだありません"
                                    : `${formatMonthLabel(monthKey)}の支出はありません`
        }</p>`;
        return;
    }

    const totals = {};
    monthExpenses.forEach(e => {
        const key = String(e.categoryId);
        totals[key] = (totals[key] || 0) + (Number(e.amount) || 0);
    });

    const ids = new Set([...Object.keys(totals), ...budgetIds]);
    const entries = [...ids]
        .map(cid => ({
            cat: getCategoryById(cid) || { name: "不明" },
            amt: totals[cid] || 0,
            cap: Number(categoryBudgets[cid]) || 0
        }))
        .sort((a, b) => b.amt - a.amt);

    const max = Math.max(1, ...entries.map(entry => entry.amt));
    entries.forEach(({ cat, amt, cap }) => {
        const hasCap = cap > 0;
        const ratio = hasCap ? amt / cap : 0;
        const pct = hasCap
            ? Math.min(100, Math.round(ratio * 100))
            : Math.max(4, Math.round((amt / max) * 100));
        const stateClass = hasCap && ratio > 1 ? " is-over"
            : (hasCap && ratio >= 0.8 ? " is-warn" : "");
        const value = hasCap
            ? `${amt.toLocaleString()} / ${cap.toLocaleString()} 円`
            : `${amt.toLocaleString()} 円`;

        const row = document.createElement("div");
        row.className = `breakdown-row${stateClass}`;
        row.innerHTML = `
            <span class="breakdown-label">${escapeHtml(cat.name)}</span>
            <span class="breakdown-track"><span class="breakdown-fill" style="width:${pct}%"></span></span>
            <span class="breakdown-value">${value}</span>
        `;
        list.appendChild(row);
    });
}

function getRoomLevel() {
    return Math.min(99, Math.floor(activeExpenses().length / 5) + 1);
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

// ==========================================
// モーダル背景タップで閉じる
// ==========================================
const MODAL_NO_BACKDROP_CLOSE = ["modal-pet-select", "modal-pet-name"];

function isExpenseFormDirty() {
    const v = (id) => {
        const el = document.getElementById(id);
        return el ? String(el.value || "").trim() : "";
    };
    return !!(v("expense-amount") || v("expense-memo") || v("expense-store")
        || document.querySelectorAll("#expense-items-list .item-row").length > 0);
}

function closeModalByBackdrop(overlay) {
    if (!overlay) return;
    if (MODAL_NO_BACKDROP_CLOSE.indexOf(overlay.id) !== -1) return;
    if (overlay.id === "modal-expense" && isExpenseFormDirty()
        && !confirm("入力中の内容は保存されません。閉じますか？")) return;
    overlay.classList.remove("open");
}

function setupModalBackdropClose() {
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        if (MODAL_NO_BACKDROP_CLOSE.indexOf(overlay.id) !== -1) return;

        overlay.addEventListener("click", (e) => {
            if (e.target !== overlay) return;
            closeModalByBackdrop(overlay);
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        document.querySelectorAll(".modal-overlay.open").forEach(overlay => {
            closeModalByBackdrop(overlay);
        });
    });
}

function setupEventListeners() {
    // ヘッダーの「その他」メニュー
    const moreButton = document.getElementById("btn-open-more");
    const moreMenu = document.getElementById("header-more-menu");
    if (moreButton && moreMenu) {
        const closeMoreMenu = () => {
            moreMenu.classList.remove("open");
            moreButton.setAttribute("aria-expanded", "false");
        };
        moreButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const willOpen = !moreMenu.classList.contains("open");
            moreMenu.classList.toggle("open", willOpen);
            moreButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
        });
        moreMenu.addEventListener("click", (e) => {
            if (e.target.closest("button")) closeMoreMenu();
        });
        document.addEventListener("click", (e) => {
            if (!moreMenu.classList.contains("open")) return;
            if (moreMenu.contains(e.target) || moreButton.contains(e.target)) return;
            closeMoreMenu();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeMoreMenu();
        });
    }

    const btnEditBudget = document.getElementById("btn-edit-budget");
    if (btnEditBudget) {
        btnEditBudget.addEventListener("click", () => {
            renderBudgetInputValue();
            document.getElementById("budget-box-display").classList.add("hidden");
            document.getElementById("budget-box-edit").classList.add("open");
            setTimeout(() => document.getElementById("budget-input")?.focus(), 200);
        });
    }

    const btnSaveBudget = document.getElementById("btn-save-budget");
    if (btnSaveBudget) {
        btnSaveBudget.addEventListener("click", () => {
            const budgetInput = document.getElementById("budget-input");
            if (!budgetInput) return;

            const monthKey = getViewMonthKey();
            const value = parseFloat(budgetInput.value);

            if (isNaN(value) || value <= 0) {
                showToast(getPetLine("idle", "1円以上の予算を設定してね！"));
                return;
            }

            const existing = appData.budget[monthKey] || 0;
            if (existing > 0 && existing !== value) {
                if (!confirm(`${formatMonthLabel(monthKey)}の予算を `
                    + `${existing.toLocaleString()}円 から ${value.toLocaleString()}円 に変更しますか？`)) {
                    return;
                }
            }

            appData.budget[monthKey] = value;
            if (!appData.budgetUpdatedAt || typeof appData.budgetUpdatedAt !== "object") {
                appData.budgetUpdatedAt = {};
            }
            appData.budgetUpdatedAt[monthKey] = new Date().toISOString();
            saveData();
            renderBudgetSummary();
            renderPlanCard();
            document.getElementById("budget-box-display").classList.remove("hidden");
            document.getElementById("budget-box-edit").classList.remove("open");
            showToast(getPetLine("idle", `${formatMonthLabel(monthKey)}の予算を ${value.toLocaleString()}円 にしたよ`));
            if (typeof onboardingNotify === "function") onboardingNotify("budget");
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
        btnSaveExpense.addEventListener("click", async () => {
            const now = new Date();
            const editId = document.getElementById("expense-edit-id").value;
            const amount = parseFloat(document.getElementById("expense-amount").value);
            const categoryId = String(document.getElementById("expense-category").value || "");
            const memo = document.getElementById("expense-memo").value.trim();
            const storeEl = document.getElementById("expense-store");
            const store = storeEl ? storeEl.value.trim() : "";
            const items = collectItemsFromForm();

            const datetimeEl = document.getElementById("expense-datetime");
            const when = parseDatetimeLocalValue(datetimeEl ? datetimeEl.value : "") || now;

            if (isNaN(amount) || amount <= 0) return;

            if (localMonthKey(when) > getCurrentMonthKey()) {
                alert("来月以降の日付は記録できません。日時を確認してください。");
                return;
            }

            let receiptImageId = null;
            if (pendingReceipt && pendingReceipt.dataUrl) {
                receiptImageId = newId();
                try {
                    await saveReceiptImage(receiptImageId, dataUrlToBlob(pendingReceipt.dataUrl));
                } catch (e) {
                    receiptImageId = null;
                }
            }

            let targetMonth = selectedMonthKey;

            if (editId) {
                const existing = appData.expenses.find(e => String(e.id) === String(editId));
                if (existing) {
                    const oldImageId = existing.receiptImageId;
                    existing.amount = amount;
                    existing.categoryId = categoryId;
                    existing.memo = memo;
                    existing.store = store;
                    existing.items = items;
                    existing.datetime = when.toISOString();
                    existing.dateKey = localDateKey(when);
                    existing.monthKey = localMonthKey(when);
                    if (receiptImageId) {
                        existing.receiptImageId = receiptImageId;
                        if (oldImageId && oldImageId !== receiptImageId
                            && typeof deleteReceiptImage === "function") {
                            deleteReceiptImage(oldImageId).catch(() => {});
                        }
                    }
                    existing.updatedAt = now.toISOString();
                    targetMonth = existing.monthKey;
                }
            } else {
                appData.expenses.push({
                    id: newId(),
                    amount, categoryId, memo, store, items,
                    datetime: when.toISOString(),
                    dateKey: localDateKey(when),
                    monthKey: localMonthKey(when),
                    receiptImageId: receiptImageId,
                    source: pendingReceipt ? "ocr" : "manual",
                    deletedAt: null,
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString()
                });
                targetMonth = localMonthKey(when);
                roomData.points += 100;
                saveRoomData();
                renderCurrency();
            }

            saveData();
            pendingReceipt = null;

            if (targetMonth && targetMonth !== selectedMonthKey) setViewMonth(targetMonth);

            renderBudgetSummary();
            renderExpenseTimeline();
            renderCharts();
            renderPlanCard();

            if (editId) {
                spawnPetReaction("favorite");
                petSay(getPetLine("idle", "更新した！"));
            } else {
                const affinity = addAffinityForRecord();
                const today = getAffinity();
                const rank = getAffinityRank(today.score);
                let line = "記録できた！100ptゲット。えらい";
                if (affinity.bonus > 0) line = `連続記録ボーナス！${rank.label}になったよ`;
                else if (affinity.gained <= 0) line = "記録できた！";
                petSay(getPetLine("idle", line));
                playCoin();
            }
            vibrate(25);
            const modal = document.getElementById("modal-expense");
            if (modal) modal.classList.remove("open");
            if (!editId && typeof onboardingNotify === "function") onboardingNotify("expense");
        });
    }

    // カテゴリ別予算
    document.getElementById("btn-open-category-budget")?.addEventListener("click", openCategoryBudgetModal);
    document.getElementById("btn-close-category-budget")?.addEventListener("click", () => {
        document.getElementById("modal-category-budget")?.classList.remove("open");
    });
    document.getElementById("btn-save-category-budget")?.addEventListener("click", saveCategoryBudgets);
    document.getElementById("btn-suggest-category-budget")?.addEventListener("click", applySuggestedCategoryBudgets);
    document.getElementById("category-budget-list")?.addEventListener("input", updateCategoryBudgetTotal);

    const btnOpenCategory = document.getElementById("btn-open-category");    if (btnOpenCategory) {
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
            renderOcrSettingsForm();
            const status = document.getElementById("data-import-status");
            if (status) status.textContent = "";
            const backupStatus = document.getElementById("data-backup-status");
            if (backupStatus) backupStatus.textContent = "";
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

    // 統合CSV（家計＋マイルーム）の書き出し
    const btnExportUnifiedCsv = document.getElementById("btn-export-unified-csv");
    if (btnExportUnifiedCsv) {
        btnExportUnifiedCsv.addEventListener("click", exportUnifiedCsv);
    }

    // CSV読み込み（統合CSV/支出CSVを自動判別）
    const inputImportCsv = document.getElementById("input-import-csv");
    if (inputImportCsv) {
        inputImportCsv.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importAnyCsvFile(file);
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
                const editId = document.getElementById("cat-edit-id").value;
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
                appData.categories.push({ id: newId(), name });
            }

            saveData();
            renderCategoryManageList();
            renderCategorySelect();
            renderExpenseTimeline();
            closeCategoryForm();
        });
    }

    document.getElementById("btn-prev-month")?.addEventListener("click", () => setViewMonth(addMonths(selectedMonthKey, -1)));
    document.getElementById("btn-next-month")?.addEventListener("click", () => setViewMonth(addMonths(selectedMonthKey, 1)));
    document.getElementById("btn-this-month")?.addEventListener("click", () => setViewMonth(getCurrentMonthKey()));

    const timeline = document.getElementById("expense-timeline");
    if (timeline) {
        timeline.addEventListener("click", (e) => {
            const card = e.target.closest(".card");
            if (!card) return;
            const expId = card.dataset.expId;
            if (!expId) return;
            const actionEl = e.target.closest("[data-action]");
            const action = actionEl ? actionEl.dataset.action : null;

            if (action === "edit") {
                editExpense(expId);
            } else if (action === "delete") {
                deleteExpense(expId);
            } else if (action === "toggle") {
                const box = card.querySelector(".card-items");
                if (!box) return;
                box.hidden = !box.hidden;
                card.classList.toggle("items-open", !box.hidden);
            }
        });
    }

    const catListEl = document.getElementById("category-manage-list");
    if (catListEl) {
        catListEl.addEventListener("click", (e) => {
            const target = e.target.closest("[data-cat-action]");
            if (!target) return;
            const catId = target.dataset.catId;
            if (target.dataset.catAction === "edit") startEditCategory(catId);
            else if (target.dataset.catAction === "delete") deleteCategoryById(catId);
        });
    }

    document.getElementById("btn-add-item")?.addEventListener("click", () => addItemRow());
    const itemListEl = document.getElementById("expense-items-list");
    if (itemListEl) {
        itemListEl.addEventListener("click", (e) => {
            const removeBtn = e.target.closest("[data-item-remove]");
            if (!removeBtn) return;
            const row = removeBtn.closest(".item-row");
            if (row) row.remove();
            updateItemsSummary();
        });
        itemListEl.addEventListener("input", updateItemsSummary);
    }
    document.getElementById("btn-apply-items-total")?.addEventListener("click", () => {
        const total = sumItemPrices();
        const amountEl = document.getElementById("expense-amount");
        if (total > 0 && amountEl) {
            amountEl.value = total;
            validateExpenseInput();
        }
    });

    ["filter-keyword", "filter-category", "filter-min", "filter-max",
     "filter-from", "filter-to", "filter-sort"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, () => {
            readFilterFromForm();
            renderExpenseTimeline();
        });
    });
    document.getElementById("btn-clear-filter")?.addEventListener("click", clearFilter);
    document.getElementById("btn-toggle-filter")?.addEventListener("click", () => {
        const panel = document.getElementById("filter-panel");
        if (panel) panel.classList.toggle("open");
    });

    document.getElementById("btn-open-planner")?.addEventListener("click", openPlannerModal);
    document.getElementById("btn-close-planner")?.addEventListener("click", () => {
        document.getElementById("modal-planner")?.classList.remove("open");
    });
    document.getElementById("btn-run-planner")?.addEventListener("click", runPlanner);
    document.getElementById("planner-difficulty")?.addEventListener("click", (e) => {
        const card = e.target.closest("[data-difficulty]");
        if (!card) return;
        plannerDifficulty = card.dataset.difficulty;
        updateDifficultyButtons();
    });
    document.getElementById("plan-card")?.addEventListener("click", (e) => {
        if (e.target.closest("#btn-clear-plan")) clearPlan();
    });

    const receiptInput = document.getElementById("input-receipt-image");
    if (receiptInput) {
        receiptInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            handleReceiptFile(file);
            receiptInput.value = "";
        });
    }

    document.getElementById("ocr-provider")?.addEventListener("change", updateOcrEndpointVisibility);
    document.getElementById("btn-save-ocr")?.addEventListener("click", saveOcrSettingsFromForm);
    document.getElementById("btn-test-ocr")?.addEventListener("click", testOcrConnection);

    document.getElementById("btn-export-backup")?.addEventListener("click", exportBackupFile);
    const backupInput = document.getElementById("input-import-backup");
    if (backupInput) {
        backupInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importBackupFile(file);
            backupInput.value = "";
        });
    }
    document.getElementById("btn-backup-banner-open")?.addEventListener("click", () => {
        appPrefs.backupRemindedAt = new Date().toISOString();
        savePrefs();
        renderBackupBanner();
        openTransferModal();
    });
    document.getElementById("btn-backup-banner-later")?.addEventListener("click", () => {
        appPrefs.backupRemindedAt = new Date().toISOString();
        savePrefs();
        renderBackupBanner();
    });
    document.getElementById("btn-replay-onboarding")?.addEventListener("click", () => {
        document.getElementById("modal-data")?.classList.remove("open");
        if (typeof startOnboarding === "function") startOnboarding(true);
    });
    const soundToggle = document.getElementById("pref-sound");
    const hapticToggle = document.getElementById("pref-haptics");
    if (soundToggle) {
        soundToggle.checked = !!appPrefs.sound;
        soundToggle.addEventListener("change", () => {
            appPrefs.sound = soundToggle.checked;
            savePrefs();
            if (appPrefs.sound) playPop();
        });
    }
    if (hapticToggle) {
        hapticToggle.checked = !!appPrefs.haptics;
        hapticToggle.addEventListener("change", () => {
            appPrefs.haptics = hapticToggle.checked;
            savePrefs();
            if (appPrefs.haptics) vibrate(30);
        });
    }
    document.getElementById("btn-export-csv")?.addEventListener("click", markBackupDone);
    document.getElementById("btn-export-unified-csv")?.addEventListener("click", markBackupDone);
    document.getElementById("btn-export-backup")?.addEventListener("click", markBackupDone);
    document.getElementById("btn-open-account")?.addEventListener("click", openTransferModal);
    document.getElementById("btn-open-transfer")?.addEventListener("click", () => {
        document.getElementById("modal-data")?.classList.remove("open");
        openTransferModal();
    });
    document.getElementById("btn-close-transfer")?.addEventListener("click", () => {
        document.getElementById("modal-transfer")?.classList.remove("open");
    });
    document.getElementById("btn-copy-transfer-code")?.addEventListener("click", copyTransferCode);
    document.getElementById("btn-paste-transfer-code")?.addEventListener("click", pasteTransferCode);
    document.getElementById("btn-save-transfer-file")?.addEventListener("click", saveTransferCodeFile);
    document.getElementById("btn-share-transfer-code")?.addEventListener("click", shareTransferCode);
    document.getElementById("input-transfer-file")?.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) loadTransferCodeFile(file);
        e.target.value = "";
    });
    document.getElementById("btn-import-transfer-merge")?.addEventListener("click", () => importTransferCode("merge"));
    document.getElementById("btn-import-transfer-replace")?.addEventListener("click", () => importTransferCode("replace"));

    setupModalBackdropClose();
}

// ==========================================
// 7.5 品目エディタ
// ==========================================
function addItemRow(name = "", price = "", categoryId = null) {
    const list = document.getElementById("expense-items-list");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "item-row";
    if (categoryId) row.dataset.categoryId = String(categoryId);
    row.innerHTML = `
        <input type="text" class="item-name" placeholder="品目（例：牛乳）" value="${escapeHtml(name)}" maxlength="40">
        <input type="number" class="item-price" placeholder="0" min="0" step="1" value="${price === "" || price === undefined ? "" : (Number(price) || 0)}">
        <span class="item-unit">円</span>
        <button type="button" class="item-remove" data-item-remove title="この行を削除">
            <span class="material-icons-round">close</span>
        </button>
    `;
    list.appendChild(row);
    updateItemsSummary();
}

function collectItemsFromForm() {
    const list = document.getElementById("expense-items-list");
    if (!list) return [];
    const items = [];
    list.querySelectorAll(".item-row").forEach(row => {
        const nameEl = row.querySelector(".item-name");
        const priceEl = row.querySelector(".item-price");
        const name = (nameEl ? nameEl.value : "").trim();
        const price = parseFloat(priceEl ? priceEl.value : "");
        if (!name && (isNaN(price) || price === 0)) return;
        items.push(normalizeItem({
            name: name || "（名称なし）",
            price: isNaN(price) ? 0 : price,
            qty: 1,
            categoryId: row.dataset.categoryId || null
        }));
    });
    return items;
}

function sumItemPrices() {
    return collectItemsFromForm().reduce((sum, it) => sum + (Number(it.price) || 0), 0);
}

function updateItemsSummary() {
    const el = document.getElementById("items-summary");
    if (!el) return;
    const items = collectItemsFromForm();
    if (items.length === 0) {
        el.textContent = "";
        return;
    }
    el.textContent = `品目 ${items.length}点・合計 ${sumItemPrices().toLocaleString()} 円`;
}

function renderItemsEditor(items) {
    const list = document.getElementById("expense-items-list");
    if (!list) return;
    list.innerHTML = "";
    (Array.isArray(items) ? items : []).forEach(it =>
        addItemRow(it.name || "", it.price === undefined ? "" : it.price, it.categoryId || null)
    );
    updateItemsSummary();
}

// ==========================================
// 8. 支出モーダル
// ==========================================
// 日時の入力欄は「今月末」までしか選べないようにする（来月以降は画面に表示できないため）
function limitExpenseDatetime() {
    const el = document.getElementById("expense-datetime");
    if (!el) return;
    const n = new Date();
    el.max = toDatetimeLocalValue(new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59));
}

function openExpenseModal() {
    const titleEl = document.getElementById("expense-modal-title");
    const editIdEl = document.getElementById("expense-edit-id");
    const amountEl = document.getElementById("expense-amount");
    const memoEl = document.getElementById("expense-memo");
    const storeEl = document.getElementById("expense-store");
    const datetimeEl = document.getElementById("expense-datetime");
    const modal = document.getElementById("modal-expense");

    if (titleEl) titleEl.textContent = "支出を記録";
    if (editIdEl) editIdEl.value = "";
    if (amountEl) amountEl.value = "";
    if (memoEl) memoEl.value = "";
    if (storeEl) storeEl.value = "";
    if (datetimeEl) datetimeEl.value = toDatetimeLocalValue(new Date());
    limitExpenseDatetime();
    renderItemsEditor([]);
    resetReceiptUi();
    renderCategorySelect();

    validateExpenseInput();
    if (modal) modal.classList.add("open");
}

function editExpense(id) {
    const exp = appData.expenses.find(e => String(e.id) === String(id));
    if (!exp) return;

    const titleEl = document.getElementById("expense-modal-title");
    const editIdEl = document.getElementById("expense-edit-id");
    const amountEl = document.getElementById("expense-amount");
    const categoryEl = document.getElementById("expense-category");
    const memoEl = document.getElementById("expense-memo");
    const storeEl = document.getElementById("expense-store");
    const datetimeEl = document.getElementById("expense-datetime");
    const modal = document.getElementById("modal-expense");

    if (titleEl) titleEl.textContent = "支出を編集";
    if (editIdEl) editIdEl.value = exp.id;
    if (amountEl) amountEl.value = exp.amount;
    renderCategorySelect();
    if (categoryEl) categoryEl.value = exp.categoryId;
    if (memoEl) memoEl.value = exp.memo || "";
    if (storeEl) storeEl.value = exp.store || "";
    if (datetimeEl) datetimeEl.value = toDatetimeLocalValue(exp.datetime);
    limitExpenseDatetime();
    renderItemsEditor(exp.items || []);
    resetReceiptUi();
    showReceiptThumbnail(exp.receiptImageId);

    validateExpenseInput();
    if (modal) modal.classList.add("open");
}

let undoBarTimer = null;

function hideUndoBar() {
    const bar = document.getElementById("undo-bar");
    if (bar) bar.classList.remove("show");
    clearTimeout(undoBarTimer);
}

function showUndoBar(message, onUndo) {
    let bar = document.getElementById("undo-bar");
    if (!bar) {
        bar = document.createElement("div");
        bar.id = "undo-bar";
        bar.className = "undo-bar";
        bar.innerHTML = '<span class="undo-bar-text"></span><button type="button" class="undo-bar-btn">元に戻す</button>';
        document.body.appendChild(bar);
    }
    bar.querySelector(".undo-bar-text").textContent = message;
    const btn = bar.querySelector(".undo-bar-btn");
    btn.onclick = () => { hideUndoBar(); onUndo(); };
    bar.classList.add("show");
    clearTimeout(undoBarTimer);
    undoBarTimer = setTimeout(hideUndoBar, 6000);
}

function refreshAfterExpenseChange() {
    renderBudgetSummary();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
}

function deleteExpense(id) {
    const exp = appData.expenses.find(e => String(e.id) === String(id));
    if (!exp || exp.deletedAt) return;

    const now = new Date().toISOString();
    exp.deletedAt = now;
    exp.updatedAt = now;
    saveData();
    refreshAfterExpenseChange();
    vibrate(12);

    // 取り消せる間はレシート画像を残し、時間が過ぎてから片付ける
    const imageId = exp.receiptImageId;
    const cleanup = setTimeout(() => {
        if (imageId && exp.deletedAt && typeof deleteReceiptImage === "function") {
            deleteReceiptImage(imageId).catch(() => {});
        }
    }, 6500);

    showUndoBar("支出を削除しました", () => {
        clearTimeout(cleanup);
        exp.deletedAt = null;
        exp.updatedAt = new Date().toISOString();
        saveData();
        refreshAfterExpenseChange();
        playPop();
    });
}

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
    return parseDelimitedText(text, ",");
}

function exportExpensesAsCsv() {
    const header = ["日時", "カテゴリ", "金額", "メモ", "店舗", "品目"];
    const rows = [header];
    const sorted = [...activeExpenses()].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
    sorted.forEach(exp => {
        const cat = getCategoryById(exp.categoryId);
        rows.push([
            exp.datetime,
            cat ? cat.name : "不明",
            exp.amount,
            exp.memo || "",
            exp.store || "",
            (exp.items && exp.items.length) ? JSON.stringify(exp.items) : ""
        ]);
    });

    const csvContent = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const fname = `yoyu_aru_expenses_${localDateKey(now).replace(/-/g, "")}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function parseItemsCell(raw) {
    const text = String(raw || "").trim();
    if (!text) return [];

    if (text.charAt(0) === "[") {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.map(normalizeItem);
        } catch (e) { /* 下の簡易形式へフォールバック */ }
    }

    return text.split("|").map(part => {
        const bits = part.split(":");
        const name = (bits[0] || "").trim();
        const price = parseFloat((bits[1] || "").replace(/[^\d.-]/g, ""));
        if (!name) return null;
        return normalizeItem({ name, price: isNaN(price) ? 0 : price, qty: 1 });
    }).filter(Boolean);
}

// ==========================================
// CSV の読み込み（自動判別）
// ==========================================
// 1ファイルで完結する「統合CSV」と、銀行・カード・PayPay などの
// 「支出だけのCSV」を先頭行のマーカーで自動判別する。
const UNIFIED_CSV_MARKER = "yoyu-aru-export,1";

function importAnyCsvFile(file) {
    const statusEl = document.getElementById("data-import-status");
    const reader = new FileReader();

    reader.onload = (e) => {
        let text;
        try {
            text = decodeCsvBuffer(e.target.result);
        } catch (err) {
            text = String(e.target.result || "");
        }

        const firstLine = String(text).replace(/^\uFEFF/, "").split(/\r?\n/)[0].trim();
        if (firstLine === UNIFIED_CSV_MARKER) {
            if (/^#\s*ROOM\s*$/im.test(text)
                && !confirm("このCSVにはマイルーム（ポイント・家具・ペット）が含まれています。\n読み込むと、いまのマイルームはCSVの内容に置き換わります。\n（同じ月の予算も上書きされます）\n続けますか？")) {
                if (statusEl) statusEl.textContent = "読み込みをキャンセルしました。";
                return;
            }
            const result = importUnifiedCsvText(text);
            if (statusEl) {
                const notes = [];
                if (result.addedExpenses) notes.push(`支出 ${result.addedExpenses}件`);
                if (result.skippedDuplicates) notes.push(`重複 ${result.skippedDuplicates}件はスキップ`);
                if (result.addedCategories) notes.push(`カテゴリ ${result.addedCategories}件`);
                if (result.updatedBudgets) notes.push(`予算 ${result.updatedBudgets}件`);
                if (result.updatedCategoryBudgets) notes.push(`カテゴリ予算 ${result.updatedCategoryBudgets}件`);
                if (result.roomImported) notes.push("マイルーム");
                statusEl.textContent = notes.length > 0
                    ? `統合CSVを読み込みました：${notes.join(" ／ ")}`
                    : "統合CSVを読み込みましたが、追加されたデータはありません。";
            }
            return;
        }

        importExpensesFromCsvText(text, statusEl);
    };

    reader.onerror = () => {
        if (statusEl) statusEl.textContent = "ファイルの読み込みに失敗しました。";
    };

    reader.readAsArrayBuffer(file);
}

// CSV を二重に取り込んだときの重複判定に使う指紋。
// 日付・金額・店舗・メモ・品目がすべて同じなら「同じ記録」とみなす。
// ただし店舗もメモも品目も無い場合は、同日同額の別の買い物を
// 誤って消さないように重複判定しない（空文字を返す）。
function expenseFingerprint(exp) {
    if (!exp || typeof exp !== "object") return "";
    const date = exp.dateKey || localDateKey(exp.datetime);
    const amount = Number(exp.amount) || 0;
    const store = String(exp.store || "").trim().toLowerCase();
    const memo = String(exp.memo || "").trim().toLowerCase();
    const items = (Array.isArray(exp.items) ? exp.items : [])
        .map(it => [
            String((it && it.name) || "").trim().toLowerCase(),
            Number(it && it.price) || 0,
            Number(it && it.qty) || 1
        ].join(":"))
        .sort()
        .join("|");

    if (!store && !memo && !items) return "";
    return [date, amount, store, memo, items].join("\u0001");
}

function importExpensesFromCsvText(text, statusEl) {
    const delimiter = detectDelimiter(text);
    const rows = parseDelimitedText(text, delimiter);
    const parsed = buildExpensesFromRows(rows);

    if (parsed.records.length === 0 && parsed.skipped === 0 && parsed.deposits === 0) {
        if (statusEl) statusEl.textContent = "読み込めるデータがありませんでした。";
        return;
    }

    // 既存の記録と、このファイル内で先に取り込んだ記録の両方を照合する
    const known = new Set();
    appData.expenses.forEach(e => {
        const fp = expenseFingerprint(e);
        if (fp) known.add(fp);
    });

    let added = 0;
    let duplicates = 0;
    parsed.records.forEach(rec => {
        const when = rec.date;
        const fingerprint = expenseFingerprint({
            dateKey: localDateKey(when),
            amount: rec.amount,
            store: rec.store || "",
            memo: rec.memo || "",
            items: Array.isArray(rec.items) ? rec.items : []
        });
        if (fingerprint && known.has(fingerprint)) {
            duplicates++;
            return;
        }
        if (fingerprint) known.add(fingerprint);

        const categoryName = rec.categoryName || "その他";
        let category = appData.categories.find(c => c.name === categoryName);
        if (!category) {
            category = { id: newId(), name: categoryName };
            appData.categories.push(category);
        }

        const items = Array.isArray(rec.items) ? rec.items.map(normalizeItem) : [];
        appData.expenses.push({
            id: newId(),
            amount: rec.amount,
            categoryId: category.id,
            memo: rec.memo || "",
            store: rec.store || "",
            items: items,
            datetime: when.toISOString(),
            dateKey: localDateKey(when),
            monthKey: localMonthKey(when),
            source: "csv",
            deletedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        added++;
    });

    saveData();
    refreshAllViews();

    if (statusEl) {
        const notes = [describeImportResult(parsed)];
        notes.push(`${added}件を読み込みました`);
        if (duplicates > 0) notes.push(`重複 ${duplicates}件はスキップ`);
        if (parsed.deposits > 0) notes.push(`入金 ${parsed.deposits}件は支出ではないため取り込んでいません`);
        if (parsed.skipped > 0) notes.push(`${parsed.skipped}件は読み取れずスキップ`);
        statusEl.textContent = notes.join(" ／ ");
    }
}

// ==========================================
// 統合CSV（家計＋マイルームを1ファイルに）
// ==========================================
// 目的：
//   ・「見るだけ／渡すだけ」の用途で、1ファイルで全部を持ち歩けるようにする
//   ・人が Excel で開いても中身が読める（JSON と違って）
//
// 使い分け：
//   ・正確な引っ越し … JSON バックアップ（マージ規則つき）
//   ・見る／渡す     … 統合CSV
//
// 読み込みの挙動：
//   ・カテゴリ … id が同じものは尊重し、名前だけのものは既存に寄せる（追加のみ）
//   ・予算     … 同じ月は上書きする（ファイルの値が新しいとみなす）
//   ・支出     … 追加。ただし同じ内容（日付・金額・店舗・メモ・品目）はスキップ
//   ・マイルーム … 丸ごと差し替える
function buildUnifiedCsvText() {
    const lines = [];
    lines.push(UNIFIED_CSV_MARKER);

    lines.push("");
    lines.push("# CATEGORIES");
    lines.push("id,name");
    appData.categories.forEach(c => {
        lines.push([csvEscape(c.id), csvEscape(c.name)].join(","));
    });

    lines.push("");
    lines.push("# BUDGETS");
    lines.push("month,amount");
    Object.keys(appData.budget).sort().forEach(key => {
        lines.push([csvEscape(key), appData.budget[key]].join(","));
    });

    lines.push("");
    lines.push("# CATEGORY_BUDGETS");
    lines.push("month,categoryId,categoryName,amount");
    Object.keys(appData.categoryBudget || {}).sort().forEach(monthKey => {
        const map = appData.categoryBudget[monthKey] || {};
        Object.keys(map).forEach(cid => {
            const cat = getCategoryById(cid);
            lines.push([monthKey, cid, cat ? cat.name : "", map[cid]].map(csvEscape).join(","));
        });
    });

    lines.push("");
    lines.push("# EXPENSES");
    lines.push("日時,カテゴリ,金額,メモ,店舗,品目");
    const sorted = [...activeExpenses()].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
    sorted.forEach(exp => {
        const cat = getCategoryById(exp.categoryId);
        lines.push([
            exp.datetime,
            cat ? cat.name : "不明",
            exp.amount,
            exp.memo || "",
            exp.store || "",
            (exp.items && exp.items.length) ? JSON.stringify(exp.items) : ""
        ].map(csvEscape).join(","));
    });

    lines.push("");
    lines.push("# ROOM");
    lines.push("key,value");
    lines.push(["points", roomData.points].map(csvEscape).join(","));
    lines.push(["lastLoginDate", roomData.lastLoginDate || ""].map(csvEscape).join(","));
    lines.push(["petType", roomData.pet ? roomData.pet.type : ""].map(csvEscape).join(","));
    lines.push(["petName", roomData.pet ? (roomData.pet.name || "") : ""].map(csvEscape).join(","));
    lines.push(["petX", roomData.pet ? roomData.pet.x : ""].map(csvEscape).join(","));
    lines.push(["petY", roomData.pet ? roomData.pet.y : ""].map(csvEscape).join(","));
    lines.push(["petScale", roomData.pet ? roomData.pet.scale : ""].map(csvEscape).join(","));
    lines.push(["ownedItemIds", roomData.ownedItemIds.join("|")].map(csvEscape).join(","));
    roomExtraCsvPairs().forEach(pair => lines.push(pair.map(csvEscape).join(",")));
    roomData.placedItems.forEach((it, i) => {
        lines.push([`item_${i}`,
            `${it.uid},${it.itemId},${it.x},${it.y},${it.scale},${it.placed},${it.z || 1}`
        ].map(csvEscape).join(","));
    });

    return "\uFEFF" + lines.join("\r\n");
}

function exportUnifiedCsv() {
    const text = buildUnifiedCsvText();
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const fname = `yoyu_aru_all_${localDateKey(now).replace(/-/g, "")}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 統合CSVの本文を "# SECTION" 単位で分割して行配列にする
function splitUnifiedCsv(text) {
    const out = { categories: [], budgets: [], categoryBudgets: [], expenses: [], room: [] };
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    let current = null;

    for (let i = 1; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (!trimmed) continue;

        const m = trimmed.match(/^#\s*(CATEGORIES|BUDGETS|CATEGORY_BUDGETS|EXPENSES|ROOM)\s*$/i);
        if (m) {
            current = m[1].toLowerCase() === "category_budgets"
                ? "categoryBudgets"
                : m[1].toLowerCase();
            continue;
        }
        if (!current) continue;

        const parsedRow = parseDelimitedText(raw + "\n", ",")[0] || [];
        out[current].push(parsedRow);
    }
    return out;
}

function importUnifiedCsvText(text) {
    const sections = splitUnifiedCsv(text);

    let addedExpenses = 0;
    let addedCategories = 0;
    let updatedBudgets = 0;
    let updatedCategoryBudgets = 0;
    let roomImported = false;
    let skippedDuplicates = 0;

    // --- カテゴリ（追加のみ） ---
    sections.categories.slice(1).forEach(row => {
        const id = String(row[0] || "").trim();
        const name = String(row[1] || "").trim();
        if (!id || !name) return;
        if (appData.categories.some(c => String(c.id) === id)) return;
        if (appData.categories.some(c => c.name === name)) return;
        appData.categories.push({ id, name });
        addedCategories++;
    });

    // --- 予算（同じ月はファイルの値で上書き） ---
    sections.budgets.slice(1).forEach(row => {
        const month = String(row[0] || "").trim();
        const amount = parseFloat(row[1]);
        if (!/^\d{4}-\d{2}$/.test(month)) return;
        if (isNaN(amount) || amount <= 0) return;

        appData.budget[month] = amount;
        if (!appData.budgetUpdatedAt || typeof appData.budgetUpdatedAt !== "object") {
            appData.budgetUpdatedAt = {};
        }
        appData.budgetUpdatedAt[month] = new Date().toISOString();
        updatedBudgets++;
    });

    // --- カテゴリ別予算 ---
    if (sections.categoryBudgets.length > 1) {
        if (!appData.categoryBudget || typeof appData.categoryBudget !== "object" || Array.isArray(appData.categoryBudget)) {
            appData.categoryBudget = {};
        }
        if (!appData.categoryBudgetUpdatedAt || typeof appData.categoryBudgetUpdatedAt !== "object" || Array.isArray(appData.categoryBudgetUpdatedAt)) {
            appData.categoryBudgetUpdatedAt = {};
        }

        sections.categoryBudgets.slice(1).forEach(row => {
            const month = String(row[0] || "").trim();
            const id = String(row[1] || "").trim();
            const name = String(row[2] || "").trim();
            const amount = parseFloat(row[3]);
            if (!/^\d{4}-\d{2}$/.test(month)) return;
            if (isNaN(amount) || amount <= 0) return;

            let category = appData.categories.find(c => id && String(c.id) === id)
                || appData.categories.find(c => name && c.name === name);
            if (!category && (id || name)) {
                category = { id: id || newId(), name: name || "その他" };
                appData.categories.push(category);
                addedCategories++;
            }
            if (!category) return;

            if (!appData.categoryBudget[month]) appData.categoryBudget[month] = {};
            appData.categoryBudget[month][String(category.id)] = Math.round(amount);
            appData.categoryBudgetUpdatedAt[month] = new Date().toISOString();
            updatedCategoryBudgets++;
        });
    }

    // --- 支出（既存の CSV パーサを流用） ---
    if (sections.expenses.length > 1) {
        const rows = [sections.expenses[0], ...sections.expenses.slice(1)];
        const parsed = buildExpensesFromRows(rows);

        const known = new Set();
        appData.expenses.forEach(e => {
            const fp = expenseFingerprint(e);
            if (fp) known.add(fp);
        });

        parsed.records.forEach(rec => {
            const when = rec.date;
            const fingerprint = expenseFingerprint({
                dateKey: localDateKey(when),
                amount: rec.amount,
                store: rec.store || "",
                memo: rec.memo || "",
                items: Array.isArray(rec.items) ? rec.items : []
            });
            if (fingerprint && known.has(fingerprint)) {
                skippedDuplicates++;
                return;
            }
            if (fingerprint) known.add(fingerprint);

            const categoryName = rec.categoryName || "その他";
            let category = appData.categories.find(c => c.name === categoryName);
            if (!category) {
                category = { id: newId(), name: categoryName };
                appData.categories.push(category);
            }
            appData.expenses.push({
                id: newId(),
                amount: rec.amount,
                categoryId: category.id,
                memo: rec.memo || "",
                store: rec.store || "",
                items: Array.isArray(rec.items) ? rec.items.map(normalizeItem) : [],
                datetime: when.toISOString(),
                dateKey: localDateKey(when),
                monthKey: localMonthKey(when),
                source: "csv",
                deletedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            addedExpenses++;
        });
    }

    // --- マイルーム（丸ごと差し替え） ---
    if (sections.room.length > 1) {
        const map = {};
        const items = [];
        sections.room.slice(1).forEach(row => {
            const key = String(row[0] || "").trim();
            const value = String(row[1] === undefined ? "" : row[1]);
            if (!key) return;
            if (key.indexOf("item_") === 0) items.push(value);
            else map[key] = value;
        });

        const newRoom = JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA));
        newRoom.points = parseInt(map.points, 10) || 0;
        newRoom.lastLoginDate = map.lastLoginDate || null;
        if (map.petType) {
            newRoom.pet = {
                type: map.petType,
                name: map.petName || petDefaultName(map.petType),
                x: parseFloat(map.petX) || 50,
                y: parseFloat(map.petY) || 85,
                scale: parseFloat(map.petScale) || 1
            };
        }
        newRoom.ownedItemIds = map.ownedItemIds
            ? map.ownedItemIds.split("|").filter(Boolean)
            : [];
        applyRoomExtrasFromCsvMap(newRoom, map);
        newRoom.placedItems = items.map(v => {
            const [uid, itemId, x, y, scale, placed, z] = String(v).split(",");
            return {
                uid,
                itemId,
                x: parseFloat(x),
                y: parseFloat(y),
                scale: parseFloat(scale),
                placed: placed === "true",
                z: parseInt(z, 10) || 1
            };
        });

        roomData = normalizeRoomData(newRoom);
        saveRoomData();
        roomImported = true;
    }

    saveData();
    refreshAllViews();
    if (roomImported) {
        renderRoomPreview();
        renderCurrency();
    }

    return { addedExpenses, addedCategories, updatedBudgets, updatedCategoryBudgets, roomImported, skippedDuplicates };
}

function resetCurrentMonthData() {
    const monthKey = getCurrentMonthKey();
    const label = formatMonthLabel(monthKey);
    if (!confirm(`${label}の支出と予算（カテゴリ別予算を含む）をすべて削除します。よろしいですか？`)) return;

    const now = new Date().toISOString();
    const imageIds = [];
    appData.expenses.forEach(e => {
        if (e.monthKey === monthKey && !e.deletedAt) {
            e.deletedAt = now;
            e.updatedAt = now;
            if (e.receiptImageId) imageIds.push(e.receiptImageId);
        }
    });
    delete appData.budget[monthKey];
    if (appData.categoryBudget) delete appData.categoryBudget[monthKey];
    if (appData.categoryBudgetUpdatedAt) delete appData.categoryBudgetUpdatedAt[monthKey];

    if (typeof deleteReceiptImage === "function") {
        imageIds.forEach(id => deleteReceiptImage(id).catch(() => {}));
    }

    saveData();
    renderMonthNav();
    renderPeriodLabel();
    renderBudgetSummary();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
    renderBudgetInputValue();
    renderStorageInfo();
}

function resetAllData() {
    if (!confirm("すべてのデータ（予算・カテゴリ・支出履歴・マイルーム）を削除して初期状態に戻します。この操作は元に戻せません。よろしいですか？")) return;
    if (!confirm("本当によろしいですか？もう一度確認します。\n（OCR の API キー、アカウント設定、ログイン状態は残ります）")) return;

    // localStorage.clear() は使わない。リセット対象のキーだけを消す。
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ROOM_STORAGE_KEY);
    } catch (e) { /* 消せなくても次の saveData で上書きされる */ }

    if (typeof listReceiptImageIds === "function" && typeof deleteReceiptImage === "function") {
        listReceiptImageIds()
            .then(ids => Promise.all(ids.map(id => deleteReceiptImage(id).catch(() => {}))))
            .catch(() => {});
    }

    appData = cloneDefaultData();
    const monthKey = getCurrentMonthKey();
    selectedMonthKey = monthKey;
    appData.plan = null;

    roomData = normalizeRoomData(JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA)));
    roomData.points = 8888;
    petIsAsleep = Math.random() < 0.25;
    petState = "idle";
    petStateUntil = 0;
    petWasOverBudget = false;

    saveData();
    saveRoomData();

    refreshAllViews();
    centerRoomPreviewOnPet();

    if (!roomData.pet) openPetSelectModal();

    alert("初期化が完了しました！（予算は未設定です。自分で決めてください／ポイント: 8,888）");
}

function renderStorageInfo() {
    const el = document.getElementById("data-storage-info");
    if (!el) return;
    const raw = localStorage.getItem(STORAGE_KEY) || "";
    const sizeKb = (new Blob([raw]).size / 1024).toFixed(1);
    const deleted = appData.expenses.length - activeExpenses().length;
    el.textContent = `記録件数: ${activeExpenses().length}件 ／ 保存容量: 約${sizeKb}KB`
        + (deleted > 0 ? `（削除済み ${deleted}件を含む）` : "")
        + ` ／ v${APP_VERSION}`;
}

function countRecordedMonths() {
    return new Set(activeExpenses().map(e => e.monthKey)).size;
}

function refreshAllViews() {
    applyRoomMap();
    renderMonthNav();
    renderPeriodLabel();
    renderBudgetSummary();
    renderBudgetInputValue();
    renderCategorySelect();
    renderCategoryManageList();
    renderFilterCategoryOptions();
    renderExpenseTimeline();
    renderCharts();
    renderPlanCard();
    renderStorageInfo();
    renderRoomPreview();
    renderCurrency();
}

// ==========================================
// 10. グラフ
// ==========================================
function renderCharts() {
    const monthKey = getViewMonthKey();
    const monthExpenses = expensesOfMonth(monthKey);
    const stats = getMonthStats(monthExpenses, monthKey);

    const titleEl = document.getElementById("charts-title-text");
    if (titleEl) titleEl.textContent = `${formatMonthLabel(monthKey)}のグラフ`;

    const noteEl = document.getElementById("daily-chart-note");
    if (noteEl) {
        noteEl.textContent = stats.total > 0 ? `合計 ${stats.total.toLocaleString()}円` : "";
    }

    const summaryEl = document.getElementById("chart-summary");
    if (summaryEl) {
        if (stats.total <= 0) {
            summaryEl.textContent = "";
        } else {
            const parts = [`1日あたり 約${stats.averagePerDay.toLocaleString()}円`];
            if (stats.averagePerActiveDay > 0) parts.push(`記録した日は 約${stats.averagePerActiveDay.toLocaleString()}円`);
            if (stats.maxTotal > 0) parts.push(`最大は${stats.maxDay}日（${stats.maxTotal.toLocaleString()}円）`);
            summaryEl.textContent = parts.join(" ／ ");
        }
    }

    const chartEl = document.getElementById("daily-chart");
    if (chartEl) {
        chartEl.innerHTML = stats.total > 0
            ? buildDailyBarSvg(stats.daily, { averageOverDays: stats.elapsedDays })
            : `<div class="chart-empty">この月の支出はまだありません</div>`;
    }

    const weeklyEl = document.getElementById("weekly-list");
    if (weeklyEl) {
        weeklyEl.innerHTML = stats.total > 0
            ? buildWeeklyListHtml(getWeeklyTotals(monthExpenses, monthKey))
            : `<p class="breakdown-empty">週別のデータがありません</p>`;
    }

    const compareEl = document.getElementById("compare-list");
    if (compareEl) {
        compareEl.innerHTML = buildComparisonHtml(
            getCategoryComparison(appData.expenses, appData.categories, monthKey)
        );
    }
}
// ==========================================
// 11. AIプランナー
// ==========================================
let plannerDifficulty = "normal";

function openPlannerModal() {
    const plan = appData.plan;
    const incomeEl = document.getElementById("planner-income");
    const targetEl = document.getElementById("planner-target");
    const expenseEl = document.getElementById("planner-expense");
    const resultEl = document.getElementById("planner-result");
    const hintEl = document.getElementById("planner-expense-hint");

    const estimated = estimateMonthlyExpense(appData.expenses, 3, getCurrentMonthKey());

    if (incomeEl) incomeEl.value = plan && plan.monthlyIncome ? plan.monthlyIncome : "";
    if (targetEl) targetEl.value = plan && plan.targetAmount ? plan.targetAmount : "";
    if (expenseEl) expenseEl.value = plan && plan.monthlyExpense ? plan.monthlyExpense : (estimated || "");
    if (resultEl) resultEl.innerHTML = "";

    plannerDifficulty = (plan && plan.difficulty) ? plan.difficulty : "normal";
    updateDifficultyButtons();

    if (hintEl) {
        hintEl.textContent = estimated
            ? `空欄なら、直近3か月の記録から ${estimated.toLocaleString()} 円 を使います。`
            : "まだ支出の記録が少ないので、実際の金額を入れてください。";
    }

    const modal = document.getElementById("modal-planner");
    if (modal) modal.classList.add("open");
}

function updateDifficultyButtons() {
    document.querySelectorAll("#planner-difficulty .difficulty-card").forEach(btn => {
        btn.classList.toggle("is-active", btn.dataset.difficulty === plannerDifficulty);
    });
}

function runPlanner() {
    const incomeEl = document.getElementById("planner-income");
    const targetEl = document.getElementById("planner-target");
    const expenseEl = document.getElementById("planner-expense");

    const income = parseFloat(incomeEl ? incomeEl.value : "");
    const target = parseFloat(targetEl ? targetEl.value : "");
    const rawExpense = expenseEl ? String(expenseEl.value).trim() : "";
    const estimated = estimateMonthlyExpense(appData.expenses, 3, getCurrentMonthKey());

    const expense = rawExpense === "" ? (estimated || 0) : parseFloat(rawExpense);

    const plan = calculatePlan({
        monthlyIncome: income,
        targetAmount: target,
        monthlyExpense: isNaN(expense) ? 0 : expense,
        difficulty: plannerDifficulty
    });

    const suggestions = plan.ok
        ? getReductionSuggestions(appData.expenses, appData.categories, getCurrentMonthKey(), plan)
        : [];
    const advice = buildPlannerAdvice(plan, suggestions, { recordedMonths: countRecordedMonths() });

    renderPlannerResult(plan, suggestions, advice);

    if (plan.ok) {
        plan.createdAt = new Date().toISOString();
        plan.updatedAt = plan.createdAt;
        appData.plan = plan;
        saveData();
        renderPlanCard();
    }
}

function renderPlannerResult(plan, suggestions, advice) {
    const el = document.getElementById("planner-result");
    if (!el) return;

    if (!plan.ok) {
        el.innerHTML = `
            <div class="planner-error">${escapeHtml(plan.reason)}</div>
            ${advice.length ? `<ul class="planner-advice">${advice.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : ""}
        `;
        return;
    }

    const suggestionsHtml = suggestions.length > 0
        ? `<div class="planner-block">
               <p class="planner-sub-title">節約できるところ</p>
               ${suggestions.map(s => `
                   <div class="planner-suggestion">
                       <div class="planner-suggestion-head">
                           <span class="planner-suggestion-name">${escapeHtml(s.name)}</span>
                           <span class="planner-suggestion-save">-${s.cutAmount.toLocaleString()} 円/月</span>
                       </div>
                       <span class="planner-suggestion-desc">
                           いまの支出の${Math.round(s.share * 100)}%。1割減らすと ${s.savedDays} 日 早まります。
                       </span>
                   </div>
               `).join("")}
           </div>`
        : "";

    el.innerHTML = `
        <div class="planner-result-card">
            <p class="planner-result-kicker">シミュレーション結果</p>
            <p class="planner-result-goal">目標金額 ${plan.targetAmount.toLocaleString()} 円を貯めるには…</p>
            <div class="planner-period">
                <span class="planner-period-value">約 ${escapeHtml(plan.periodLabel)}</span>
                <span class="planner-period-unit">で達成できます！</span>
            </div>
            <div class="planner-figures">
                <div class="planner-figure">
                    <span class="planner-figure-label">毎月の貯金額</span>
                    <span class="planner-figure-value">${plan.monthlySaving.toLocaleString()} 円</span>
                </div>
                <div class="planner-figure">
                    <span class="planner-figure-label">自由に使えるお金</span>
                    <span class="planner-figure-value">${plan.spendablePerMonth.toLocaleString()} 円</span>
                </div>
                <div class="planner-figure">
                    <span class="planner-figure-label">達成予定日</span>
                    <span class="planner-figure-value">${escapeHtml(plan.targetDateLabel)}</span>
                </div>
            </div>
        </div>
        ${suggestionsHtml}
        <div class="planner-block">
            <p class="planner-sub-title"><span class="material-icons-round">lightbulb</span>アドバイス</p>
            <ul class="planner-advice">${advice.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
        </div>
    `;
}

function renderPlanCard() {
    const el = document.getElementById("plan-card");
    if (!el) return;

    const plan = appData.plan;
    if (!plan || !plan.ok) {
        el.style.display = "none";
        el.innerHTML = "";
        return;
    }

    const progress = getPlanProgress(plan, appData.expenses);
    el.style.display = "block";
    el.innerHTML = `
        <div class="plan-card-head">
            <span class="plan-card-title">
                <span class="material-icons-round">auto_awesome</span>貯金プラン
            </span>
            <button class="plan-card-clear" id="btn-clear-plan" type="button">解除</button>
        </div>
        <div class="plan-card-goal">
            ${plan.targetAmount.toLocaleString()} 円 ／ ${escapeHtml(plan.difficultyLabel)}
        </div>
        <div class="plan-progress-track">
            <div class="plan-progress-fill" style="width:${progress.percent}%"></div>
        </div>
        <p class="plan-card-progress">
            ${progress.achieved
                ? "目標達成！おめでとう！"
                : `あと ${progress.remaining.toLocaleString()} 円（${progress.percent}%）・予定日 ${escapeHtml(plan.targetDateLabel)}`}
        </p>
    `;
}

function clearPlan() {
    appData.plan = null;
    saveData();
    renderPlanCard();
}

// ==========================================
// 12. レシート読み取り（OCR）
// ==========================================
let pendingReceipt = null;

function resetReceiptUi() {
    pendingReceipt = null;

    const statusEl = document.getElementById("receipt-status");
    if (statusEl) statusEl.textContent = "";

    const preview = document.getElementById("receipt-preview");
    if (preview) preview.style.display = "none";

    const img = document.getElementById("receipt-preview-img");
    if (img) img.removeAttribute("src");

    const warnings = document.getElementById("receipt-warnings");
    if (warnings) warnings.innerHTML = "";

    const input = document.getElementById("input-receipt-image");
    if (input) input.value = "";
}

async function showReceiptThumbnail(imageId) {
    if (!imageId) return;
    try {
        const blob = await getReceiptImage(imageId);
        if (!blob) return;
        const img = document.getElementById("receipt-preview-img");
        const preview = document.getElementById("receipt-preview");
        if (img) img.src = URL.createObjectURL(blob);
        if (preview) preview.style.display = "flex";
    } catch (e) { /* 画像が無くても記録の表示には影響しない */ }
}

async function handleReceiptFile(file) {
    const statusEl = document.getElementById("receipt-status");
    const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

    if (!file) return;

    if (!isOcrConfigured()) {
        setStatus("先に「データ管理」でAPIキーを設定してください。手入力はそのまま使えます。");
        return;
    }

    try {
        setStatus("画像を準備しています…");
        const img = await loadImageFromFile(file);
        const resized = resizeImageToDataUrl(img, RECEIPT_MAX_EDGE, RECEIPT_JPEG_QUALITY);

        setStatus("レシートを読み取っています…");
        const result = await recognizeReceipt(resized.dataUrl, getOcrSettings());

        if (!result.ok) {
            setStatus(`${result.error}（手入力はそのまま使えます）`);
            return;
        }

        applyReceiptToForm(result.receipt, resized.dataUrl);
        setStatus("読み取り結果を反映しました。内容を確認してください。");
        playCoin();
        vibrate(20);
    } catch (e) {
        setStatus(`${(e && e.message) || "読み取りに失敗しました。"}（手入力はそのまま使えます）`);
    }
}

function applyReceiptToForm(receipt, dataUrl) {
    const r = normalizeReceipt(receipt);

    if (r.total > 0) {
        const amountEl = document.getElementById("expense-amount");
        if (amountEl) amountEl.value = r.total;
    }

    const storeEl = document.getElementById("expense-store");
    if (storeEl && r.store) storeEl.value = r.store;

    if (r.date) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const parsed = parseDatetimeLocalValue(`${r.date}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
        if (parsed) {
            const dtEl = document.getElementById("expense-datetime");
            if (dtEl) dtEl.value = toDatetimeLocalValue(parsed);
        }
    }

    const items = assignCategoriesToItems(r.items, appData.categories, null);
    renderItemsEditor(items);

    const categoryEl = document.getElementById("expense-category");
    if (categoryEl && items.length > 0 && items[0].categoryId) {
        categoryEl.value = items[0].categoryId;
    }

    pendingReceipt = { dataUrl: dataUrl, receipt: r };
    renderReceiptPreview(dataUrl, r);
    validateExpenseInput();
}

function renderReceiptPreview(dataUrl, receipt) {
    const preview = document.getElementById("receipt-preview");
    const img = document.getElementById("receipt-preview-img");
    const warnEl = document.getElementById("receipt-warnings");

    if (img && dataUrl) img.src = dataUrl;
    if (preview) preview.style.display = "flex";

    if (warnEl) {
        const check = validateReceipt(receipt);
        warnEl.innerHTML = check.warnings.length > 0
            ? check.warnings.map(w => `<p class="receipt-warning">${escapeHtml(w)}</p>`).join("")
            : `<p class="receipt-ok">品目の合計とレシートの合計が一致しました</p>`;
    }
}

function renderOcrSettingsForm() {
    const s = getOcrSettings();
    const providerEl = document.getElementById("ocr-provider");
    const keyEl = document.getElementById("ocr-api-key");
    const modelEl = document.getElementById("ocr-model");
    const endpointEl = document.getElementById("ocr-endpoint");

    if (providerEl) providerEl.value = s.provider;
    if (keyEl) keyEl.value = s.apiKey;
    if (modelEl) modelEl.value = s.model;
    if (endpointEl) endpointEl.value = s.endpoint;

    updateOcrEndpointVisibility();
    updateOcrStatus();
}

function updateOcrEndpointVisibility() {
    const providerEl = document.getElementById("ocr-provider");
    const group = document.getElementById("ocr-endpoint-group");
    if (!providerEl || !group) return;
    group.style.display = providerEl.value === "custom" ? "block" : "none";
}

function readOcrSettingsForm() {
    const providerEl = document.getElementById("ocr-provider");
    const keyEl = document.getElementById("ocr-api-key");
    const modelEl = document.getElementById("ocr-model");
    const endpointEl = document.getElementById("ocr-endpoint");
    return {
        provider: providerEl ? providerEl.value : "gemini",
        apiKey: keyEl ? keyEl.value.trim() : "",
        model: modelEl ? modelEl.value.trim() : "",
        endpoint: endpointEl ? endpointEl.value.trim() : ""
    };
}

function updateOcrStatus(message) {
    const el = document.getElementById("ocr-status");
    if (!el) return;
    if (message) { el.textContent = message; return; }
    el.textContent = isOcrConfigured()
        ? "設定済み：レシートから読み取れます"
        : "未設定：手入力のみ使えます";
}

function saveOcrSettingsFromForm() {
    const ok = saveOcrSettings(readOcrSettingsForm());
    updateOcrStatus(ok ? "設定を保存しました" : "保存できませんでした");
}

// 接続テスト用の画像。1×1 の JPEG だとモデル側で弾かれることがあるので、
// 実際に文字が写っている小さな画像をその場で作る。
function buildOcrTestImage() {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = 360;
        canvas.height = 140;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#111111";
        ctx.font = "bold 36px sans-serif";
        ctx.fillText("テスト 100円", 24, 62);
        ctx.font = "22px sans-serif";
        ctx.fillText("2026-10-20", 24, 104);
        return canvas.toDataURL("image/jpeg", 0.9);
    } catch (e) {
        return "";
    }
}

async function testOcrConnection() {
    const s = readOcrSettingsForm();
    if (!s.apiKey) {
        updateOcrStatus("APIキーを入力してください。");
        return;
    }
    saveOcrSettings(s);
    updateOcrStatus("接続を確認しています…");

    const fallback = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
    const image = buildOcrTestImage() || fallback;
    const res = await recognizeReceipt(image, s);

    if (res.httpOk) {
        updateOcrStatus("接続できました！レシートを読み取れます。");
        return;
    }
    updateOcrStatus(`接続できませんでした：${res.error || "原因不明のエラー"}`);
}

// ==========================================
// 13. バックアップ
// ==========================================
function setBackupStatus(message) {
    const el = document.getElementById("data-backup-status");
    if (el) el.textContent = message;
}

function exportBackupFile() {
    const text = serializeBackup(appData, roomData);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yoyu_aru_backup_${localDateKey(new Date()).replace(/-/g, "")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupStatus("バックアップを書き出しました。新しい端末で読み込んでください。");
}

function describeMergeStats(stats) {
    const s = stats || {};
    const byType = s.byType || null;

    if (!byType) {
        const parts = [];
        if (s.pulled) parts.push(`追加 ${s.pulled}件`);
        if (s.updated) parts.push(`更新 ${s.updated}件`);
        if (s.keptLocal) parts.push(`手元を優先 ${s.keptLocal}件`);
        if (parts.length === 0) parts.push("変更なし");
        return parts.join(" ／ ");
    }

    const exp = byType.expenses || {};
    const cat = byType.categories || {};
    const bud = byType.budget || {};

    const parts = [];
    if (exp.pulled) parts.push(`支出 ${exp.pulled}件`);
    if (exp.updated) parts.push(`支出の更新 ${exp.updated}件`);
    if (cat.pulled) parts.push(`カテゴリ ${cat.pulled}件`);
    if (bud.pulled) parts.push(`予算 ${bud.pulled}件`);
    if (bud.updated) parts.push(`予算の更新 ${bud.updated}件`);
    if (parts.length === 0) parts.push("変更なし");

    if (s.conflicts > 0) parts.push(`食い違い ${s.conflicts}件は新しい方を採用`);
    return parts.join(" ／ ");
}

function importBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = (e) => {
        const parsed = parseBackup(String(e.target.result));
        if (!parsed.ok) {
            setBackupStatus(parsed.error);
            return;
        }

        const remoteApp = migrateData(parsed.data);
        const appResult = mergeAppData(appData, remoteApp);
        const roomResult = mergeRoomData(roomData, parsed.room);

        appData = appResult.merged;
        if (roomResult.merged) roomData = normalizeRoomData(roomResult.merged);

        saveData();
        saveRoomData();
        refreshAllViews();

        setBackupStatus(`統合しました：${describeMergeStats(appResult.stats)}`);
    };

    reader.onerror = () => setBackupStatus("ファイルを読み込めませんでした。");
    reader.readAsText(file, "utf-8");
}

// ==========================================
// 14. データ移行（コードをコピー／貼り付け）
// ==========================================
function setTransferStatus(message, isError) {
    const el = document.getElementById("transfer-status");
    if (!el) return;
    el.textContent = message || "";
    el.style.color = isError ? "var(--danger)" : "var(--accent-soft)";
}

// コードを軽くするため、30日より前に削除した記録は含めない。
// （30日以内の削除は、統合したときに相手の端末へ伝わるよう残す）
function buildTransferAppData() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const copy = Object.assign({}, appData);
    copy.expenses = (appData.expenses || []).filter(e => !e || !e.deletedAt || String(e.deletedAt) >= cutoff);
    return copy;
}

async function refreshTransferCode() {
    const out = document.getElementById("transfer-code-out");
    const sizeEl = document.getElementById("transfer-code-size");
    if (!out) return "";
    try {
        const code = await encodeTransferCode(buildTransferAppData(), roomData);
        out.value = code;
        if (sizeEl) sizeEl.textContent = `${code.length.toLocaleString()} 文字（約${(code.length / 1024).toFixed(1)}KB）`;
        return code;
    } catch (e) {
        out.value = "";
        setTransferStatus("コードを作れませんでした。", true);
        return "";
    }
}

async function openTransferModal() {
    setTransferStatus("");
    const inp = document.getElementById("transfer-code-in");
    if (inp) inp.value = "";
    document.getElementById("modal-transfer")?.classList.add("open");
    const shareBtn = document.getElementById("btn-share-transfer-code");
    if (shareBtn) shareBtn.style.display = (typeof navigator.share === "function") ? "" : "none";
    await refreshTransferCode();
}

async function copyTransferCode() {
    const out = document.getElementById("transfer-code-out");
    if (!out) return;
    // 開いたあとに記録を足していても最新になるよう、コピーの直前に作り直す
    const code = await refreshTransferCode();
    if (!code) return;

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
            setTransferStatus("コピーしました。新しい端末の「データ移行」に貼り付けてください。");
            markBackupDone();
            return;
        }
    } catch (e) { /* 下の手動選択へ */ }

    out.focus();
    out.select();
    out.setSelectionRange(0, code.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    setTransferStatus(ok
        ? "コピーしました。新しい端末の「データ移行」に貼り付けてください。"
        : "自動でコピーできませんでした。選択された文字を長押しして「コピー」してください。", !ok);
}

async function pasteTransferCode() {
    const inp = document.getElementById("transfer-code-in");
    if (!inp) return;
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            inp.value = await navigator.clipboard.readText();
            setTransferStatus(inp.value ? "貼り付けました。下のボタンで読み込んでください。" : "クリップボードが空です。", !inp.value);
            return;
        }
    } catch (e) { /* 許可されなかった */ }
    inp.focus();
    setTransferStatus("自動で貼り付けられませんでした。枠を長押しして「貼り付け」を選んでください。", true);
}

async function saveTransferCodeFile() {
    const code = await refreshTransferCode();
    if (!code) return;
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yoyu_aru_code_${localDateKey(new Date()).replace(/-/g, "")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setTransferStatus("ファイルに保存しました。新しい端末の「ファイルから読み込む」で選んでください。");
    markBackupDone();
}

async function shareTransferCode() {
    const code = await refreshTransferCode();
    if (!code || typeof navigator.share !== "function") return;
    try {
        await navigator.share({ title: "余裕、ある？ データコード", text: code });
        setTransferStatus("共有しました。");
        markBackupDone();
    } catch (e) {
        if (e && e.name === "AbortError") return;
        setTransferStatus("共有できませんでした。コピーかファイル保存を使ってください。", true);
    }
}

function loadTransferCodeFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        const inp = document.getElementById("transfer-code-in");
        if (inp) inp.value = String(reader.result || "").trim();
        setTransferStatus("ファイルを読み込みました。下のボタンで取り込んでください。");
    };
    reader.onerror = () => setTransferStatus("ファイルを読み込めませんでした。", true);
    reader.readAsText(file, "utf-8");
}

// mode: "merge" = いまのデータと統合 / "replace" = コードの内容で置き換え
async function importTransferCode(mode) {
    const inp = document.getElementById("transfer-code-in");
    const raw = inp ? inp.value.trim() : "";
    if (!raw) {
        setTransferStatus("先にコードを貼り付けてください。", true);
        return;
    }

    setTransferStatus("読み込んでいます…");
    const parsed = await decodeTransferCode(raw);
    if (!parsed.ok) {
        setTransferStatus(parsed.error, true);
        return;
    }
    const incoming = migrateData(parsed.data);

    let message;
    if (mode === "replace") {
        if (!confirm("この端末のデータ（支出・予算・カテゴリ・マイルーム）を、コードの内容で置き換えます。\nこの端末にある記録は消えます。よろしいですか？")) {
            setTransferStatus("");
            return;
        }
        appData = incoming;
        roomData = normalizeRoomData(parsed.room || JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA)));
        message = `置き換えました：支出 ${activeExpenses().length}件`;
    } else {
        const appResult = mergeAppData(appData, incoming);
        const roomResult = mergeRoomData(roomData, parsed.room);
        appData = appResult.merged;
        if (roomResult.merged) roomData = normalizeRoomData(roomResult.merged);
        message = `統合しました：${describeMergeStats(appResult.stats)}`;
    }

    saveData();
    saveRoomData();
    if (inp) inp.value = "";
    refreshAllViews();
    centerRoomPreviewOnPet();
    if (!roomData.pet) openPetSelectModal();

    setTransferStatus(message);
    playCoin();
    refreshTransferCode();
    // 記録が入ったら、初回ガイドはもう不要
    if (activeExpenses().length > 0 && typeof finishOnboarding === "function") finishOnboarding();
}

// ==========================================
// マイルーム（ペット・部屋・ショップ）
// ==========================================
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

const PET_Z = 25;

const ANIMATED_FURNITURE_GIF = {};
const APP_VERSION = "2.18";

const PET_AWAKE_IMG = {
    neko: "assets/neko_awake.png",
    usagi: "assets/usagi_awake.png",
    shiba: "assets/shiba_awake.png",
    hamster: "assets/hamster_awake.png",
    panda: "assets/panda_awake.png"
};
const PET_SLEEP_IMG = {
    neko: "assets/neko_sleep.png",
    usagi: "assets/usagi_sleep.png",
    shiba: "assets/shiba_sleep.png",
    hamster: "assets/hamster_sleep.png",
    panda: "assets/panda_sleep.png"
};

// ペットの種類（ガチャで増える）。gobi は話すときの語尾。
const PET_CATALOG = {
    neko:    { label: "ねこ",       gobi: "にゃ～", defaultName: "ねこ" },
    usagi:   { label: "うさぎ",     gobi: "ぴょん", defaultName: "ぴょん" },
    shiba:   { label: "しばいぬ",   gobi: "わん",   defaultName: "まる" },
    hamster: { label: "ハムスター", gobi: "ちゅー", defaultName: "むぎ" },
    panda:   { label: "パンダ",     gobi: "もふ",   defaultName: "たけ" }
};

// 部屋（マップ）。default は最初から持っている部屋。
const MAP_CATALOG = {
    default:   { label: "はじまりの部屋", img: "assets/wallpaper.jpg" },
    washitsu:  { label: "さくらの和室",   img: "assets/map_washitsu.png" },
    seaside:   { label: "うみべの部屋",   img: "assets/map_seaside.png" },
    nightloft: { label: "ほしぞらロフト", img: "assets/map_nightloft.png" }
};

function petDefaultName(type) {
    return (PET_CATALOG[type] || PET_CATALOG.neko).defaultName;
}

// 背景画像は CSS 変数で切り替える（部屋の表示と編集画面の両方に効く）
function applyRoomMap() {
    const id = (roomData && roomData.mapId) || "default";
    const m = MAP_CATALOG[id] || MAP_CATALOG.default;
    document.documentElement.style.setProperty("--room-wallpaper", `url("${m.img}")`);
}

// マイルーム CSV にガチャで増えた情報を入れる／戻す
function roomExtraCsvPairs() {
    const names = Object.keys(roomData.petNames || {}).map(k => `${k}:${roomData.petNames[k]}`).join("|");
    return [
        ["ownedPets", (roomData.ownedPets || []).join("|")],
        ["ownedMaps", (roomData.ownedMaps || []).join("|")],
        ["mapId", roomData.mapId || "default"],
        ["petNames", names],
        ["gachaPulls", (roomData.gacha && roomData.gacha.pulls) || 0]
    ];
}

function applyRoomExtrasFromCsvMap(room, map) {
    room.ownedPets = map.ownedPets ? map.ownedPets.split("|").filter(Boolean) : [];
    room.ownedMaps = map.ownedMaps ? map.ownedMaps.split("|").filter(Boolean) : [];
    room.mapId = map.mapId || "default";
    room.petNames = {};
    String(map.petNames || "").split("|").filter(Boolean).forEach(pair => {
        const i = pair.indexOf(":");
        if (i > 0) room.petNames[pair.slice(0, i)] = pair.slice(i + 1);
    });
    room.gacha = { pulls: parseInt(map.gachaPulls, 10) || 0 };
}

const PET_FLOOR_Y = 82;
const TOY_ITEM_IDS = ["nezumi_karakuri", "toy_car_red", "wool_red", "toy_car", "toy_ball", "neko_toy"];

const PET_CHAT = {
    idle: ["ゆとり、ある？", "今日も一緒にがんばろう", "おかえり！今日もおつかれさま", "記録できてえらい", "小さな節約も未来の余裕につながる"],
    under: ["まだ予算に余裕がある", "この調子、いい感じ", "目標に向かってコツコツいこう", "無理しない節約がいちばん"],
    warn: ["そろそろ予算が心配", "使いすぎに気をつけよう", "ちょっとだけブレーキかけよう", "目標を思い出して、今日はゆっくり考えてから買おう"],
    over: ["予算オーバーだ", "いったん深呼吸して、次の記録から整えていこう", "大丈夫、ここから立て直せばいい"]
};

let roomDragMoved = false;

const DEFAULT_AFFINITY = {
    score: 0,
    total: 0,
    todayDate: null,
    todayGain: 0,
    streakBonusDate: null
};

const AFFINITY_DAILY_CAP = 5;

const DEFAULT_ROOM_DATA = {
    points: 8888,
    lastLoginDate: null,
    pet: null,
    ownedItemIds: [],
    placedItems: [],
    ownedPets: [],
    petNames: {},
    ownedMaps: ["default"],
    mapId: "default",
    gacha: { pulls: 0 },
    affinity: null,
    mini: null
};

let roomData = loadRoomData();
let petIsAsleep = Math.random() < 0.25;
let roomEditorSelectedUid = null;

function normalizeRoomData(raw) {
    const d = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};

    if (typeof d.points !== "number" || !isFinite(d.points)) d.points = DEFAULT_ROOM_DATA.points;
    if (!Array.isArray(d.ownedItemIds)) d.ownedItemIds = [];
    if (!Array.isArray(d.placedItems)) d.placedItems = [];
    if (d.lastLoginDate === undefined) d.lastLoginDate = null;

    if (d.pet && typeof d.pet === "object") {
        if (!PET_CATALOG[d.pet.type]) d.pet.type = "neko";
        if (!d.pet.name) d.pet.name = petDefaultName(d.pet.type);
        if (typeof d.pet.x !== "number") d.pet.x = 50;
        if (typeof d.pet.scale !== "number") d.pet.scale = 1;
        d.pet.y = PET_FLOOR_Y;
    } else {
        d.pet = null;
    }

    // ガチャで増えるもの：持っているペット／部屋、ペットごとの名前、使っている部屋
    const knownOnly = (list, catalog) => [...new Set((Array.isArray(list) ? list : []).map(String).filter(id => catalog[id]))];
    d.ownedPets = knownOnly(d.ownedPets, PET_CATALOG);
    if (d.pet && !d.ownedPets.includes(d.pet.type)) d.ownedPets.push(d.pet.type);
    if (!d.petNames || typeof d.petNames !== "object" || Array.isArray(d.petNames)) d.petNames = {};
    Object.keys(d.petNames).forEach(k => {
        if (!PET_CATALOG[k] || typeof d.petNames[k] !== "string" || !d.petNames[k].trim()) delete d.petNames[k];
        else d.petNames[k] = d.petNames[k].trim().slice(0, 12);
    });
    d.ownedMaps = knownOnly(d.ownedMaps, MAP_CATALOG);
    if (!d.ownedMaps.includes("default")) d.ownedMaps.unshift("default");
    if (!MAP_CATALOG[d.mapId] || !d.ownedMaps.includes(d.mapId)) d.mapId = "default";
    d.gacha = { pulls: Math.max(0, Math.floor(Number(d.gacha && d.gacha.pulls) || 0)) };

    d.placedItems = d.placedItems
        .filter(it => it && typeof it === "object")
        .map((it, i) => ({
            uid: it.uid || `item_${Date.now()}_${i}`,
            itemId: String(it.itemId || ""),
            x: typeof it.x === "number" ? it.x : 50,
            y: typeof it.y === "number" ? it.y : 50,
            scale: typeof it.scale === "number" ? it.scale : 1,
            z: typeof it.z === "number" ? it.z : 1,
            placed: !!it.placed
        }));

    if (d.pet && d.pet.x > 100) d.pet.x = d.pet.x / 2;
    d.placedItems.forEach(it => { if (it.x > 100) it.x = it.x / 2; });

    if (!d.affinity || typeof d.affinity !== "object" || Array.isArray(d.affinity)) {
        d.affinity = JSON.parse(JSON.stringify(DEFAULT_AFFINITY));
    } else {
        const a = d.affinity;
        d.affinity = {
            score: Math.max(0, Math.min(100, Number(a.score) || 0)),
            total: Math.max(0, Number(a.total) || 0),
            todayDate: a.todayDate || null,
            todayGain: Math.max(0, Number(a.todayGain) || 0),
            streakBonusDate: a.streakBonusDate || null
        };
    }

    delete d.mini;
    delete d.floating;

    return d;
}

function loadRoomData() {
    let data;
    try {
        data = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY));
    } catch (e) {
        data = null;
    }
    if (!data) data = JSON.parse(JSON.stringify(DEFAULT_ROOM_DATA));
    return normalizeRoomData(data);
}

function saveRoomData(touch) {
    if (touch !== false) roomData.updatedAt = new Date().toISOString();
    try {
        localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(roomData));
        return true;
    } catch (e) {
        warnSaveFailed();
        return false;
    }
}

function todayDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getFurnitureById(id) {
    return FURNITURE_CATALOG.find(f => f.id === id);
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

const PET_STATES = {
    idle:    { dur: [4000, 10000],   weight: 30, cls: "" },
    walk:    { dur: [5000, 13000],   weight: 24, cls: "is-walking" },
    sit:     { dur: [6000, 15000],   weight: 15, cls: "is-sitting" },
    nap:     { dur: [14000, 38000],  weight: 9,  cls: "is-sleeping" },
    sleep:   { dur: [90000, 240000], weight: 0, nightWeight: 22, cls: "is-sleeping" },
    play:    { dur: [5000, 10000],   weight: 8,  cls: "is-playing", needsToy: true },
    stretch: { dur: [1800, 2600],    weight: 6,  cls: "stretching" },
    happy:   { dur: [2400, 3400],    weight: 0,  cls: "is-happy" },
    sad:     { dur: [5000, 9000],    weight: 0,  cls: "is-sad" },
    petted:  { dur: [2000, 3000],    weight: 0,  cls: "is-petted" }
};

const PET_ONESHOT_STATES = ["stretch", "happy", "sad", "petted"];

let petState = "idle";
let petStateUntil = 0;
let petNextMoveAt = 0;
let petTickerHandle = null;
let petWasOverBudget = false;

function isSleepingState(state) {
    return state === "sleep" || state === "nap";
}

function getPetContext(now) {
    const when = now instanceof Date ? now : new Date();
    const hour = when.getHours();
    const ratio = getCurrentBudgetRatioOrNull();

    const placed = (roomData && Array.isArray(roomData.placedItems)) ? roomData.placedItems : [];
    const toys = placed.filter(it => it.placed && TOY_ITEM_IDS.indexOf(it.itemId) !== -1);

    const petX = (roomData && roomData.pet) ? (Number(roomData.pet.x) || 50) : 50;
    let nearestToyX = null;
    toys.forEach(it => {
        const d = Math.abs((Number(it.x) || 50) - petX);
        if (nearestToyX === null || d < nearestToyX.d) nearestToyX = { x: Number(it.x) || 50, d: d };
    });

    const editorOpen = !!document.getElementById("room-editor")?.classList.contains("open");

    return {
        hour: hour,
        isMorning: hour >= 5 && hour < 11,
        isNight: hour >= 19 || hour < 6,
        isLateNight: hour >= 1 && hour < 5,
        moodOver: ratio !== null && ratio >= 1,
        moodWarn: ratio !== null && ratio >= 0.8 && ratio < 1,
        hasToy: toys.length > 0,
        nearestToyX: nearestToyX,
        canWalk: !editorOpen,
        affinity: getAffinityScore()
    };
}

function chooseNextPetState(current, ctx, random) {
    const rnd = typeof random === "function" ? random : Math.random;
    const c = ctx || {};

    if (PET_ONESHOT_STATES.indexOf(current) !== -1) return "idle";

    if (current === "sleep") {
        const wakeChance = c.isLateNight ? 0.04 : (c.isMorning ? 0.28 : 0.14);
        return rnd() < wakeChance ? "idle" : "sleep";
    }

    const candidates = [];
    Object.keys(PET_STATES).forEach(name => {
        const def = PET_STATES[name];
        let weight;

        if (name === "sleep") {
            if (!c.isNight) return;
            weight = def.nightWeight * (c.isLateNight ? 2.2 : 1);
        } else {
            if (def.weight <= 0) return;
            weight = def.weight;
        }

        if (def.needsToy && !c.hasToy) return;
        if (name === "walk" && c.canWalk === false) return;

        if (name === current) weight *= 0.25;

        if (name === "walk") {
            if (c.moodOver) weight *= 0.3;
            else if (c.moodWarn) weight *= 0.7;
        }
        if (name === "idle" && c.moodOver) weight *= 1.6;
        if (name === "sit" && c.moodOver) weight *= 1.8;
        if (name === "nap" && c.isNight) weight *= 2.4;
        if (name === "stretch" && c.isMorning) weight *= 2.2;
        if (name === "play" && c.affinity >= 60) weight *= 1.4;

        candidates.push({ name: name, weight: weight });
    });

    if (candidates.length === 0) return "idle";

    const total = candidates.reduce((s, x) => s + x.weight, 0);
    let pick = rnd() * total;
    for (let i = 0; i < candidates.length; i++) {
        pick -= candidates[i].weight;
        if (pick <= 0) return candidates[i].name;
    }
    return candidates[candidates.length - 1].name;
}

function applyPetState(state) {
    const def = PET_STATES[state] || PET_STATES.idle;
    const sleeping = isSleepingState(state);

    petIsAsleep = sleeping;

    if (roomData.pet) {
        document.querySelectorAll(".pet-item").forEach(el => {
            Object.keys(PET_STATES).forEach(name => {
                if (PET_STATES[name].cls) el.classList.remove(PET_STATES[name].cls);
            });
            if (def.cls) el.classList.add(def.cls);
            el.classList.toggle("is-sleeping", sleeping);

            const img = el.querySelector("img");
            if (img) {
                img.dataset.retried = "0";
                img.src = sleeping
                    ? (PET_SLEEP_IMG[roomData.pet.type] || PET_SLEEP_IMG.neko)
                    : (PET_AWAKE_IMG[roomData.pet.type] || PET_AWAKE_IMG.neko);
            }
        });
    }

    if (state === "stretch") triggerPetStretch();
    if (state === "happy") { petFaceCamera(); spawnPetReaction("favorite"); }
    if (state === "sad") spawnPetReaction("sentiment_dissatisfied");
    if (state === "sleep") spawnPetReaction("bedtime");
}

function petFaceCamera() {
    document.querySelectorAll(".pet-item").forEach(el => el.style.setProperty("--flip", 1));
}

function triggerPetStretch() {
    document.querySelectorAll(".pet-item").forEach(el => {
        el.classList.remove("stretching");
        void el.offsetWidth;
        el.classList.add("stretching");
    });
}

function triggerPetHop(silent) {
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

function setPetState(state, options) {
    const opts = options || {};
    const def = PET_STATES[state] || PET_STATES.idle;
    const now = Date.now();
    const duration = opts.duration !== undefined
        ? opts.duration
        : randomBetween(def.dur[0], def.dur[1]);

    petState = state;
    petStateUntil = now + duration;
    petNextMoveAt = now;

    applyPetState(state);

    if (!opts.silent) onPetStateChanged(state);
    return state;
}

function onPetStateChanged(state) {
    if (["sleep", "happy", "sad", "petted"].indexOf(state) !== -1) return;
    if (Math.random() < 0.18) petSay(pickPetLine(getCurrentBudgetRatioOrNull()));
}

function petInterrupt(state, options) {
    if (!roomData.pet) return null;
    if (!PET_STATES[state]) return null;
    const opts = Object.assign({ silent: true }, options || {});
    return setPetState(state, opts);
}

function petMoveTo(targetX) {
    const el = document.querySelector("#room-scene-preview .pet-item");
    if (!el || !roomData.pet) return;

    const curX = Number(roomData.pet.x) || 50;
    const clamped = Math.max(10, Math.min(90, targetX));
    el.style.setProperty("--flip", clamped < curX ? -1 : 1);
    el.style.left = clamped + "%";
    el.style.top = PET_FLOOR_Y + "%";

    roomData.pet.x = clamped;
    roomData.pet.y = PET_FLOOR_Y;
    saveRoomData(false);
}

function petWalkStep() {
    petMoveTo(randomBetween(12, 88));
}

function petPlayWithNearestToy(ctx) {
    const target = ctx && ctx.nearestToyX;
    if (!target) return false;
    petMoveTo(target.x);
    setTimeout(() => {
        triggerPetHop(true);
        spawnPetReaction("sports_esports");
    }, 1700);
    return true;
}

function startPetLifeLoops() {
    if (petTickerHandle !== null) return;

    setPetState(chooseNextPetState("idle", getPetContext(), Math.random), { silent: true });

    petTickerHandle = setInterval(petTick, 1000);
    document.addEventListener("visibilitychange", onPetVisibilityChange);

    scheduleNextPetComment();
}

function onPetVisibilityChange() {
    if (!document.hidden) petStateUntil = Date.now() + 500;
}

function petTick() {
    if (!roomData.pet) return;
    if (document.hidden) return;

    const now = Date.now();
    const ctx = getPetContext();

    if (petState === "walk" && now >= petNextMoveAt) {
        petWalkStep();
        petNextMoveAt = now + randomBetween(2600, 4300);
    }

    if (now >= petStateUntil) {
        const next = chooseNextPetState(petState, ctx, Math.random);
        const interesting = (next === "sleep" || next === "play" || next === "walk");
        setPetState(next, { silent: !interesting });

        if (next === "play") petPlayWithNearestToy(ctx);
    }
}

function petCelebrate() {
    if (!roomData.pet) return;
    petInterrupt("happy", { duration: 3200 });
    setTimeout(() => {
        if (petState === "happy") setPetState("walk", { silent: true });
    }, 3400);
}

function petFeelDown() {
    if (!roomData.pet) return;
    petInterrupt("sad", { duration: 6000 });
}

function petStroke() {
    if (!roomData.pet) return;
    if (isSleepingState(petState)) {
        setPetState("petted", { silent: true });
        petSay(getPetLine("idle", "ん…むにゃ"));
        return;
    }
    setPetState("petted", { silent: true });
    addAffinity(1, "stroke");
}

function petWakeUp() {
    if (!roomData.pet) return false;
    if (!isSleepingState(petState)) return false;
    setPetState("stretch", { silent: true });
    petSay(getPetLine("idle", "ふぁ…おきた"));
    return true;
}

// ==========================================
// 親密度
// ==========================================
function getAffinity() {
    if (!roomData.affinity || typeof roomData.affinity !== "object") {
        roomData.affinity = JSON.parse(JSON.stringify(DEFAULT_AFFINITY));
    }
    return roomData.affinity;
}

function getAffinityScore() {
    return getAffinity().score;
}

function getAffinityRank(score) {
    const s = score === undefined ? getAffinityScore() : Number(score) || 0;
    if (s >= 80) return { level: 5, label: "ベストフレンド" };
    if (s >= 60) return { level: 4, label: "なかよし" };
    if (s >= 40) return { level: 3, label: "ともだち" };
    if (s >= 20) return { level: 2, label: "なれてきた" };
    if (s >= 5)  return { level: 1, label: "かおなじみ" };
    return { level: 0, label: "はじめまして" };
}

function addAffinity(amount, reason) {
    const a = getAffinity();
    const today = localDateKey(new Date());
    if (a.todayDate !== today) {
        a.todayDate = today;
        a.todayGain = 0;
    }

    let gain = Math.max(0, Number(amount) || 0);

    if (reason === "record" || reason === "stroke") {
        const rest = Math.max(0, AFFINITY_DAILY_CAP - a.todayGain);
        gain = Math.min(gain, rest);
    }
    if (gain <= 0) return 0;

    a.todayGain += gain;
    a.total += gain;
    const before = a.score;
    a.score = Math.min(100, a.score + gain);

    saveRoomData(false);
    renderAffinity();
    return a.score - before;
}

function addAffinityForRecord() {
    const gained = addAffinity(1, "record");

    let bonus = 0;
    const a = getAffinity();
    const today = localDateKey(new Date());
    const streak = getRecordingStreak();
    if (streak > 0 && streak % 3 === 0 && a.streakBonusDate !== today) {
        a.streakBonusDate = today;
        bonus = addAffinity(2, "streak");
    }

    if (gained + bonus > 0) petCelebrate();
    return { gained: gained, bonus: bonus };
}

function renderAffinity() {
    const a = getAffinity();
    const rank = getAffinityRank(a.score);

    const fillEl = document.getElementById("affinity-fill");
    if (fillEl) fillEl.style.width = `${a.score}%`;

    const scoreEl = document.getElementById("affinity-score");
    if (scoreEl) scoreEl.textContent = String(a.score);

    const labelEl = document.getElementById("affinity-label");
    if (labelEl) labelEl.textContent = rank.label;

    const box = document.getElementById("affinity-box");
    if (box) box.dataset.level = String(rank.level);
}

// ==========================================
// マイルームの縮小表示
// ==========================================
const COMPACT_ROOM_H = 96;
const PULL_TRIGGER_PX = 60;
const PULL_FULL_PX = 150;

let roomCompactBase = null;
// 縮小する直前の横スクロール位置（元に戻すときに復元する）
let roomScrollBeforeCompact = 0;

function getRoomCompactBase() {
    if (roomCompactBase) return roomCompactBase;

    const preview = document.getElementById("pet-room-preview");
    const scene = document.getElementById("room-scene-preview");
    if (!preview || !scene) return null;

    const w = preview.clientWidth || 316;
    const h = preview.clientHeight || Math.round(w / 1.794);
    const sceneW = scene.offsetWidth || Math.round(w * 1.43);
    const sceneH = scene.offsetHeight || h;

    roomCompactBase = {
        w: w,
        h: h,
        sceneW: sceneW,
        sceneH: sceneH,
        aspect: (sceneH > 0) ? (sceneW / sceneH) : 1.43
    };
    return roomCompactBase;
}

function compactRoomSize(base, progress) {
    const p = Math.max(0, Math.min(1, progress));
    const h = base.h - (base.h - COMPACT_ROOM_H) * p;
    const w = Math.min(base.w, h * base.aspect);
    return { w: w, h: h, p: p };
}

function isRoomCompact() {
    const preview = document.getElementById("pet-room-preview");
    return !!preview && preview.classList.contains("is-compact");
}

// 見た目に反映する。引いている最中もこれを呼ぶ。
//
// 【重要】この関数は「クリックしただけ（ドラッグしていない）」のときにも
// pointerdown→pointerup の流れで呼ばれる（progress = 0）。
// そのため、通常状態に戻すときの scrollLeft のリセットは
// 「実際に縮小状態から復帰したとき」だけに限定する。
// 無条件に scrollLeft = 0 にすると、部屋を右端までスクロールした状態で
// 軽くタップしただけで左端へ飛んでしまう（不具合として報告された）。
function applyRoomCompact(progress) {
    const base = getRoomCompactBase();
    const preview = document.getElementById("pet-room-preview");
    const scene = document.getElementById("room-scene-preview");
    const wrap = document.querySelector(".room-scroll-wrapper");
    if (!base || !preview || !scene) return 0;

    const size = compactRoomSize(base, progress);
    const wasCompact = preview.classList.contains("is-compact");

    const section = document.querySelector(".room-section");
    if (section) section.classList.toggle("is-compact", size.p > 0);
    const gripText = document.querySelector(".pet-float-grip-text");
    if (gripText) {
        gripText.textContent = size.p > 0 ? "ここをタップ／部屋を上にスワイプで元に戻す" : "下に引いて小さくする";
    }

    if (size.p <= 0) {
        preview.classList.remove("is-compact");
        preview.style.width = "";
        preview.style.height = "";
        scene.style.width = "";
        scene.style.height = "";
        scene.style.transform = "";
        // 縮小から復帰したときだけ、縮小前のスクロール位置に戻す。
        if (wasCompact && wrap) wrap.scrollLeft = roomScrollBeforeCompact;
        return 0;
    }

    const scale = size.w / base.sceneW;

    // 縮小前の位置を覚えておく（縮小中は部屋全体を見せるので 0 に固定する）
    if (!wasCompact && wrap) roomScrollBeforeCompact = wrap.scrollLeft;
    preview.classList.add("is-compact");
    preview.style.width = Math.round(size.w) + "px";
    preview.style.height = Math.round(size.h) + "px";

    scene.style.width = base.sceneW + "px";
    scene.style.height = base.sceneH + "px";
    scene.style.transform = `scale(${scale.toFixed(4)})`;

    // 縮小前に右へスクロールしていても、部屋の全体が見えるように左端へ戻す
    if (wrap) wrap.scrollLeft = 0;

    return size.p;
}

function setRoomCompact(active) {
    const preview = document.getElementById("pet-room-preview");
    if (!preview) return false;

    if (active && !isRoomCompact()) {
        preview.classList.add("is-room-animating");
        applyRoomCompact(1);
        return true;
    }
    if (!active && isRoomCompact()) {
        preview.classList.remove("is-room-animating");
        applyRoomCompact(0);
        return true;
    }
    return false;
}

function toggleRoomCompact() {
    return setRoomCompact(!isRoomCompact());
}

function beginRoomPull() {
    const preview = document.getElementById("pet-room-preview");
    if (!preview) return;
    getRoomCompactBase();
    preview.classList.remove("is-room-animating");
}

function endRoomPull(settleCompact) {
    const preview = document.getElementById("pet-room-preview");
    if (!preview) return;
    preview.classList.add("is-room-animating");
    applyRoomCompact(settleCompact ? 1 : 0);
}

function setupRoomPullToCompact() {
    const preview = document.getElementById("pet-room-preview");
    if (!preview) return;

    // 指のわずかなブレ（タップ）では縮小を始めない。
    // 下へ PULL_DEADZONE_PX 以上、ほぼ垂直に動いたときだけ「引っ張り」とみなす。
    const PULL_DEADZONE_PX = 14;
    let pulling = false;
    let began = false;
    let startX = 0, startY = 0;
    let progress = 0;

    const cancelPull = () => {
        if (began) endRoomPull(false);
        pulling = false;
        began = false;
        progress = 0;
    };

    preview.addEventListener("pointerdown", (e) => {
        if (isRoomCompact()) return;
        if (e.target.closest("[data-no-pull]")) return;
        pulling = true;
        began = false;
        startX = e.clientX;
        startY = e.clientY;
        progress = 0;
    });

    // 縮小すると枠が小さくなり、マウスの位置が枠の外に出てしまうので、
    // 移動・離す操作は document 全体で受ける（pointerleave では取り消さない）
    document.addEventListener("pointermove", (e) => {
        if (!pulling) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!began) {
            // 横にずれた／上に動いた → 引っ張りではない
            if (dy < -PULL_DEADZONE_PX || Math.abs(dx) > PULL_DEADZONE_PX * 2) { cancelPull(); return; }
            if (dy < PULL_DEADZONE_PX || Math.abs(dx) > Math.abs(dy) * 1.2) return;   // まだ判断しない
            began = true;
            beginRoomPull();
        }

        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 1.2) { cancelPull(); return; }

        progress = applyRoomCompact((dy - PULL_DEADZONE_PX) / PULL_FULL_PX);
    });

    const finish = () => {
        if (!pulling) return;
        const wasBegan = began;
        const done = progress >= 0.5;
        pulling = false;
        began = false;

        if (!wasBegan) { progress = 0; return; }       // ただのタップ：何もしない

        if (done) {
            endRoomPull(true);
            roomDragMoved = true;
            playPop();
            vibrate(20);
        } else {
            endRoomPull(false);
        }
        progress = 0;
    };

    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", () => {
        if (pulling) cancelPull();
    });

    // 縮小中：触っただけでは大きくならない。
    // 元に戻すのは「上へスワイプ」か、下の「元に戻す」バーをタップしたときだけ。
    let pushing = false;
    let pushStartX = 0, pushStartY = 0;

    preview.addEventListener("pointerdown", (e) => {
        if (!isRoomCompact()) return;
        pushing = true;
        pushStartX = e.clientX;
        pushStartY = e.clientY;
    });

    document.addEventListener("pointermove", (e) => {
        if (!pushing) return;
        const dx = e.clientX - pushStartX;
        const dy = e.clientY - pushStartY;
        if (dy < -30 && Math.abs(dx) < Math.abs(dy)) {
            pushing = false;
            roomDragMoved = true;
            setRoomCompact(false);
            playPop();
            vibrate(15);
        }
    });

    const endPush = () => { pushing = false; };
    document.addEventListener("pointerup", endPush);
    document.addEventListener("pointercancel", endPush);
}

function resetRoomCompactBase() {
    const wasCompact = isRoomCompact();
    const preview = document.getElementById("pet-room-preview");

    roomCompactBase = null;
    if (preview) preview.classList.remove("is-room-animating");
    applyRoomCompact(0);
    getRoomCompactBase();
    if (wasCompact) applyRoomCompact(1);
    if (preview) preview.classList.add("is-room-animating");
}

function getCurrentBudgetRatioOrNull() {
    const monthKey = getCurrentMonthKey();
    const budget = appData.budget[monthKey] || 0;
    if (budget <= 0) return null;
    const spent = expensesOfMonth(monthKey).reduce((sum, e) => sum + e.amount, 0);
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

function getPetGobi() { return (PET_CATALOG[roomData.pet?.type] || PET_CATALOG.neko).gobi; }
function getPetLine(kind, text) {
    const clean = String(text || "").replace(/(にゃ～|にゃ|ぴょん|わん|ちゅー|もふ)[！!。．]?$/u, "");
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
    activeExpenses().forEach(e => {
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
    if (/こんにちは|こんばんは|おはよう|やあ|\bhello\b|\bhi\b/i.test(t)) return getPetLine("idle", "こんにちは！今日も一緒にがんばろう");
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
    setupRoomPullToCompact();

    if (!roomData.pet) {
        openPetSelectModal();
    } else {
        maybeShowDailyLoginBonus();
    }

    renderRoomPreview();
    centerRoomPreviewOnPet();
    preloadPetSleepGif();
    renderAffinity();
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
// ペット選択
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
    if (!roomData.ownedPets.includes(pendingPetType)) roomData.ownedPets.push(pendingPetType);
    roomData.petNames[pendingPetType] = name;
    pendingPetType = null;
    saveRoomData();
    document.getElementById("modal-pet-name")?.classList.remove("open");
    renderRoomPreview(); centerRoomPreviewOnPet(); preloadPetSleepGif();
    petSay(getPetLine("idle", `${name}、今日からよろしく`));
    maybeShowDailyLoginBonus();
    if (typeof startOnboarding === "function") startOnboarding(false);
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
    const points = (roomData && typeof roomData.points === "number") ? roomData.points : 0;
    const el = document.getElementById("currency-amount");
    if (el) el.textContent = points.toLocaleString();
    const shopEl = document.getElementById("shop-currency-amount");
    if (shopEl) shopEl.textContent = points.toLocaleString();
    const gachaEl = document.getElementById("gacha-currency-amount");
    if (gachaEl) gachaEl.textContent = points.toLocaleString();
}

// ==========================================
// ルームプレビュー
// ==========================================
function renderRoomScene(container, interactive, opts) {
    if (!container) return;
    const options = opts || {};
    container.innerHTML = "";

    if (!roomData || typeof roomData !== "object") return;
    const placed = Array.isArray(roomData.placedItems) ? roomData.placedItems : [];

    if (roomData.pet) {
        const petEl = createPetElement(interactive, container);
        container.appendChild(petEl);
        refreshPetMood();
    }

    placed.filter(it => it.placed).forEach(it => {
        const el = createFurnitureElement(it, interactive, container);
        container.appendChild(el);
    });
}

function renderRoomPreview() {
    applyRoomMap();
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
    const sleeping = isSleepingState(petState);
    const img = sleeping
        ? (PET_SLEEP_IMG[type] || PET_SLEEP_IMG.neko)
        : (PET_AWAKE_IMG[type] || PET_AWAKE_IMG.neko);

    const el = document.createElement("div");
    const stateCls = (PET_STATES[petState] && PET_STATES[petState].cls) || "";
    el.className = "room-item pet-item" + (stateCls ? " " + stateCls : "") + (sleeping ? " is-sleeping" : "");
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
        let strokeCount = 0;
        let strokeTimer = null;
        let pettedRecently = false;

        // なぞると「なでられた」とみなす。
        // 縮小表示中は、タップで部屋を元に戻す操作の邪魔をしないよう何もしない。
        el.addEventListener("pointermove", (e) => {
            if (isRoomCompact()) return;
            if (e.pointerType === "mouse" && e.buttons === 0) return;
            strokeCount++;
            if (strokeTimer) return;
            strokeTimer = setTimeout(() => {
                strokeTimer = null;
                if (strokeCount >= 6) {
                    pettedRecently = true;
                    petStroke();
                    setTimeout(() => { pettedRecently = false; }, 500);
                }
                strokeCount = 0;
            }, 350);
        });

        el.addEventListener("click", (e) => {
            // 縮小表示中のタップは「部屋を元に戻す」を優先したいので、
            // ここで stopPropagation せず親（プレビュー）に流す。
            if (isRoomCompact()) return;

            e.stopPropagation();
            if (!roomData.pet) return;
            if (pettedRecently) return;

            if (petWakeUp()) { vibrate(15); return; }

            triggerPetHop();
            spawnPetReaction("favorite");
            petSay(pickPetLine(getCurrentBudgetRatioOrNull()));
            vibrate(15);
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
    playCoin();
    vibrate(25);
}

// ==========================================
// マイルームCSV
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
    roomExtraCsvPairs().forEach(pair => rows.push(pair));
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
    if (!confirm("いまのマイルーム（ポイント・家具・ペット）を、CSVの内容で置き換えます。よろしいですか？")) {
        if (statusEl) statusEl.textContent = "読み込みをキャンセルしました。";
        return;
    }
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
                name: map.petName || petDefaultName(map.petType),
                x: parseFloat(map.petX) || 50,
                y: parseFloat(map.petY) || 85,
                scale: parseFloat(map.petScale) || 1
            };
        }
        newData.ownedItemIds = map.ownedItemIds ? map.ownedItemIds.split("|").filter(Boolean) : [];
        applyRoomExtrasFromCsvMap(newData, map);
        newData.placedItems = items.map(v => {
            const [uid, itemId, x, y, scale, placed, z] = v.split(",");
            return { uid, itemId, x: parseFloat(x), y: parseFloat(y), scale: parseFloat(scale), placed: placed === "true", z: parseInt(z) || 1 };
        });

        roomData = normalizeRoomData(newData);
        saveRoomData();
        renderCurrency();
        renderRoomPreview();
        if (statusEl) statusEl.textContent = "マイルームのデータを読み込みました";
    };
    reader.onerror = () => { if (statusEl) statusEl.textContent = "ファイルの読み込みに失敗しました。"; };
    reader.readAsText(file, "utf-8");
}

// ==========================================
// イベント登録（ルーム）
// ==========================================
function setupRoomEventListeners() {
    document.getElementById("choose-neko")?.addEventListener("click", () => choosePet("neko"));
    document.getElementById("choose-usagi")?.addEventListener("click", () => choosePet("usagi"));
    document.getElementById("btn-confirm-pet-name")?.addEventListener("click", confirmPetName);
    document.getElementById("pet-name-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmPetName(); });

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
        if (!roomData.pet) return;
        if (petWakeUp()) { petSay(getPetLine("idle", "ん…なあに？")); vibrate(15); return; }
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
        if (isRoomCompact()) return;
        if (!roomData.pet) return;
        if (petWakeUp()) return;
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

    document.getElementById("pet-float-grip")?.addEventListener("click", () => {
        if (toggleRoomCompact()) {
            playPop();
            vibrate(15);
        }
    });

    window.addEventListener("resize", resetRoomCompactBase);
}

// ================================================================
// ▼ csv.js
// ================================================================
function decodeCsvBuffer(buffer) {
    if (!buffer) return "";

    let bytes;
    if (buffer instanceof Uint8Array) bytes = buffer;
    else if (typeof ArrayBuffer !== "undefined" && buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
    else return String(buffer);

    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return new TextDecoder("utf-8").decode(bytes.subarray(3));
    }

    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
        // UTF-8 ではない
    }

    const candidates = ["shift-jis", "euc-jp", "iso-2022-jp"];
    for (const enc of candidates) {
        try {
            const decoded = new TextDecoder(enc).decode(bytes);
            if (decoded && decoded.indexOf("\uFFFD") === -1) return decoded;
        } catch (e) { /* 未対応の文字コードは次へ */ }
    }

    let best = "";
    let bestBad = Infinity;
    ["shift-jis", "utf-8"].forEach(enc => {
        try {
            const decoded = new TextDecoder(enc).decode(bytes);
            const bad = (decoded.match(/\uFFFD/g) || []).length;
            if (bad < bestBad) { bestBad = bad; best = decoded; }
        } catch (e) { /* ignore */ }
    });
    return best;
}

function detectDelimiter(text) {
    const firstLine = String(text || "").split(/\r?\n/).find(l => l.trim() !== "") || "";
    const tabs = (firstLine.match(/\t/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    return tabs > commas ? "\t" : ",";
}

function parseDelimitedText(text, delimiter) {
    const sep = delimiter || ",";
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const src = String(text || "");

    for (let i = 0; i < src.length; i++) {
        const char = src[i];
        if (inQuotes) {
            if (char === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === sep) {
            row.push(field); field = "";
        } else if (char === "\n") {
            row.push(field); field = "";
            rows.push(row); row = [];
        } else if (char === "\r") {
            if (src[i + 1] !== "\n") {
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
    return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function parseAnyDate(value) {
    const s = String(value === undefined || value === null ? "" : value).trim();
    if (!s) return null;

    // 書き出した CSV の日時は UTC(Z) 付きの ISO 形式。下の「数字を拾う」処理だと
    // UTC の時刻をそのままローカル時刻として読んでしまい、9時間ずれて日付も変わる。
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
        const iso = new Date(s);
        if (!isNaN(iso.getTime())) return iso;
    }

    let m = s.match(/(\d{4})[\/\-年.]\s*(\d{1,2})[\/\-月.]\s*(\d{1,2})/);
    if (m) {
        const t = s.match(/(\d{1,2}):(\d{2})/);
        return new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0, 0, 0);
    }

    m = s.match(/(令和|平成|昭和)\s*(\d{1,2})\s*[\/\-年.]\s*(\d{1,2})\s*[\/\-月.]\s*(\d{1,2})/);
    if (m) {
        const base = m[1] === "令和" ? 2018 : (m[1] === "平成" ? 1988 : 1925);
        return new Date(base + +m[2], +m[3] - 1, +m[4]);
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function parseAmount(value) {
    let s = String(value === undefined || value === null ? "" : value).trim();
    if (!s) return null;

    let negative = false;
    if (/^[(（].*[)）]$/.test(s)) { negative = true; s = s.slice(1, -1); }

    s = s.replace(/[,\s円￥\\¥]/g, "");
    if (s === "" || s === "-" || s === "+") return null;

    const n = parseFloat(s);
    if (isNaN(n)) return null;
    const rounded = Math.round(Math.abs(n));
    if (rounded === 0) return 0;
    return (negative || n < 0) ? -rounded : rounded;
}

const COLUMN_KEYWORDS = {
    date: ["ご利用日", "お取引日", "利用日", "取引日", "処理日", "発生日", "計上日", "受付日", "年月日", "日付", "日時", "date"],
    withdraw: ["お引出し金額", "お引出し", "出金額", "引出金額", "支払金額", "ご利用金額", "利用金額", "出金", "amount"],
    deposit: ["お預入れ金額", "お預入れ", "入金額", "預入金額", "入金"],
    amount: ["入出金額", "取引金額", "金額"],
    category: ["カテゴリ", "分類", "費目"],
    memo: ["摘要内容", "ご利用内容", "取引内容", "摘要", "内容", "備考", "メモ", "description", "memo"],
    store: ["ご利用店舗", "利用店舗", "加盟店", "相手先", "支払先", "取引先", "店舗"],
    items: ["品目", "明細", "商品名", "商品"]
};

function detectColumns(headerRow) {
    const cells = (Array.isArray(headerRow) ? headerRow : []).map(c => String(c || "").trim().toLowerCase());
    const found = {};
    const claimed = new Set();

    const candidates = [];
    cells.forEach((cell, colIndex) => {
        if (!cell) return;
        Object.keys(COLUMN_KEYWORDS).forEach(field => {
            COLUMN_KEYWORDS[field].forEach(keyword => {
                const k = keyword.toLowerCase();
                if (cell.indexOf(k) !== -1) {
                    candidates.push({ field, colIndex, length: k.length });
                }
            });
        });
    });

    candidates.sort((a, b) => b.length - a.length);
    candidates.forEach(c => {
        if (found[c.field] !== undefined) return;
        if (claimed.has(c.colIndex)) return;
        found[c.field] = c.colIndex;
        claimed.add(c.colIndex);
    });

    if (found.date === undefined) {
        const idx = cells.findIndex((cell, i) => !claimed.has(i) && cell.indexOf("日") !== -1);
        if (idx !== -1) {
            found.date = idx;
            claimed.add(idx);
        }
    }

    return found;
}

function findHeaderRow(rows) {
    const limit = Math.min(rows.length, 10);
    for (let i = 0; i < limit; i++) {
        const cols = detectColumns(rows[i]);
        const hasDate = cols.date !== undefined;
        const hasMoney = cols.withdraw !== undefined || cols.amount !== undefined;
        if (hasDate && hasMoney) return { index: i, columns: cols };
    }
    return null;
}

function buildExpensesFromRows(rows) {
    const result = { records: [], skipped: 0, deposits: 0, detected: null, headerFound: false };
    if (!Array.isArray(rows) || rows.length === 0) return result;

    const header = findHeaderRow(rows);
    let startIndex;
    let col;

    if (header) {
        result.headerFound = true;
        result.detected = header.columns;
        startIndex = header.index + 1;
        col = header.columns;
    } else {
        col = { date: 0, category: 1, amount: 2, memo: 3, store: 4, items: 5 };
        startIndex = 0;
        result.detected = col;
    }

    const pick = (row, index) => (index === undefined || index === null ? "" : String(row[index] === undefined ? "" : row[index]));

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row)) { result.skipped++; continue; }

        const date = parseAnyDate(pick(row, col.date));

        let amount = null;
        if (col.withdraw !== undefined) amount = parseAmount(pick(row, col.withdraw));
        if ((amount === null || amount === 0) && col.amount !== undefined) {
            amount = parseAmount(pick(row, col.amount));
        }

        if ((amount === null || amount <= 0) && col.deposit !== undefined) {
            const dep = parseAmount(pick(row, col.deposit));
            if (dep !== null && dep > 0) { result.deposits++; continue; }
        }

        if (!date || amount === null || amount <= 0) { result.skipped++; continue; }

        const itemsText = pick(row, col.items).trim();
        let items = [];
        if (itemsText) {
            try {
                const parsed = JSON.parse(itemsText);
                if (Array.isArray(parsed)) items = parsed;
            } catch (e) {
                items = itemsText.split("|").map(part => {
                    const bits = part.split(":");
                    const name = (bits[0] || "").trim();
                    const price = parseAmount(bits[1]);
                    if (!name) return null;
                    return { name, price: price || 0, qty: 1 };
                }).filter(Boolean);
            }
        }

        result.records.push({
            date,
            amount,
            categoryName: pick(row, col.category).trim(),
            memo: pick(row, col.memo).trim(),
            store: pick(row, col.store).trim(),
            items
        });
    }

    return result;
}

function describeImportResult(result) {
    if (!result) return "";
    if (!result.headerFound) {
        return "見出し行が見つからなかったため、1列目=日付 / 2列目=カテゴリ / 3列目=金額 として読み取りました。";
    }
    const names = {
        date: "日付", withdraw: "出金額", deposit: "入金額", amount: "金額",
        category: "カテゴリ", memo: "摘要", store: "店舗", items: "品目"
    };
    const found = Object.keys(result.detected || {})
        .filter(k => result.detected[k] !== undefined)
        .map(k => names[k] || k);
    return `列を自動判定しました（${found.join("・")}）。`;
}

// ================================================================
// ▼ charts.js
// ================================================================
function daysInMonth(monthKey) {
    const parts = String(monthKey || "").split("-").map(n => parseInt(n, 10));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
    return new Date(parts[0], parts[1], 0).getDate();
}

function elapsedDaysInMonth(monthKey) {
    const parts = String(monthKey || "").split("-").map(n => parseInt(n, 10));
    if (parts.length < 2) return 0;
    const total = daysInMonth(monthKey);
    const now = new Date();
    const currentKey = localMonthKey(now);
    if (monthKey === currentKey) return now.getDate();
    if (monthKey < currentKey) return total;
    return 0;
}

function getDailyTotals(expenses, monthKey) {
    const total = daysInMonth(monthKey);
    if (total === 0) return [];
    const buckets = new Array(total + 1).fill(0);

    (expenses || []).forEach(e => {
        if (!e || e.deletedAt) return;
        if (e.monthKey !== monthKey) return;
        const day = parseInt(String(e.dateKey || "").slice(8, 10), 10);
        if (isNaN(day) || day < 1 || day > total) return;
        buckets[day] += Number(e.amount) || 0;
    });

    const out = [];
    for (let d = 1; d <= total; d++) out.push({ day: d, total: buckets[d] });
    return out;
}

function getWeeklyTotals(expenses, monthKey) {
    const daily = getDailyTotals(expenses, monthKey);
    const weeks = [];
    for (let i = 0; i < daily.length; i += 7) {
        const chunk = daily.slice(i, i + 7);
        weeks.push({
            index: weeks.length + 1,
            startDay: chunk[0].day,
            endDay: chunk[chunk.length - 1].day,
            total: chunk.reduce((s, d) => s + d.total, 0)
        });
    }
    return weeks;
}

function getMonthStats(expenses, monthKey) {
    const daily = getDailyTotals(expenses, monthKey);
    const total = daily.reduce((s, d) => s + d.total, 0);
    const activeDays = daily.filter(d => d.total > 0).length;
    const elapsed = elapsedDaysInMonth(monthKey);

    let maxDay = 0;
    let maxTotal = 0;
    daily.forEach(d => {
        if (d.total > maxTotal) { maxTotal = d.total; maxDay = d.day; }
    });

    return {
        total,
        activeDays,
        maxDay,
        maxTotal,
        elapsedDays: elapsed,
        averagePerDay: elapsed > 0 ? Math.round(total / elapsed) : 0,
        averagePerActiveDay: activeDays > 0 ? Math.round(total / activeDays) : 0,
        daily
    };
}

function getCategoryComparison(expenses, categories, monthKey) {
    const prevMonth = addMonths(monthKey, -1);
    const sumOf = (key) => {
        const totals = {};
        (expenses || []).forEach(e => {
            if (!e || e.deletedAt || e.monthKey !== key) return;
            const cid = String(e.categoryId);
            totals[cid] = (totals[cid] || 0) + (Number(e.amount) || 0);
        });
        return totals;
    };

    const current = sumOf(monthKey);
    const previous = sumOf(prevMonth);
    const ids = new Set([...Object.keys(current), ...Object.keys(previous)]);

    return [...ids].map(cid => {
        const cat = (categories || []).find(c => String(c.id) === cid);
        const cur = current[cid] || 0;
        const prev = previous[cid] || 0;
        return {
            categoryId: cid,
            name: cat ? cat.name : "不明",
            current: cur,
            previous: prev,
            diff: cur - prev,
            ratio: prev > 0 ? cur / prev : null
        };
    }).sort((a, b) => b.current - a.current);
}

function svgEscape(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildDailyBarSvg(daily, options) {
    const opts = Object.assign({ width: 320, height: 120, showAverage: true, averageOverDays: 0 }, options || {});

    if (!Array.isArray(daily) || daily.length === 0) {
        return `<div class="chart-empty">この月のデータがありません</div>`;
    }

    const W = opts.width;
    const H = opts.height;
    const padTop = 8;
    const padBottom = 18;
    const plotH = H - padTop - padBottom;

    const values = daily.map(d => Number(d.total) || 0);
    const max = Math.max(1, ...values);
    const n = daily.length;
    const gap = n > 20 ? 1 : 2;
    const barW = Math.max(1.5, (W - gap * (n - 1)) / n);

    const total = values.reduce((s, v) => s + v, 0);
    const divisor = opts.averageOverDays > 0 ? Math.min(opts.averageOverDays, n) : n;
    const average = divisor > 0 ? total / divisor : 0;

    const bars = daily.map((d, i) => {
        const v = Number(d.total) || 0;
        const h = v > 0 ? Math.max(1.5, (v / max) * plotH) : 0;
        const x = i * (barW + gap);
        const y = padTop + plotH - h;
        const isMax = v > 0 && v === max;
        const fill = isMax ? "var(--danger)" : "var(--accent)";
        const title = `${d.day}日: ${v.toLocaleString()}円`;
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="${fill}" rx="1"><title>${svgEscape(title)}</title></rect>`;
    }).join("");

    let avgLine = "";
    if (opts.showAverage && average > 0) {
        const y = padTop + plotH - (Math.min(average, max) / max) * plotH;
        avgLine = `<line x1="0" y1="${y.toFixed(2)}" x2="${W}" y2="${y.toFixed(2)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0.8"/>`;
    }

    const ticks = daily.filter(d => d.day === 1 || d.day % 7 === 1).map(d => {
        const i = d.day - 1;
        const x = i * (barW + gap) + barW / 2;
        return `<text x="${x.toFixed(2)}" y="${H - 5}" font-size="11" fill="var(--muted)" text-anchor="middle">${d.day}</text>`;
    }).join("");

    return `<svg class="daily-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="日別の支出グラフ">
        ${bars}${avgLine}
        <line x1="0" y1="${padTop + plotH}" x2="${W}" y2="${padTop + plotH}" stroke="var(--line-strong)" stroke-width="1"/>
        ${ticks}
    </svg>`;
}

function buildWeeklyListHtml(weekly, options) {
    const opts = Object.assign({ unit: "円" }, options || {});
    if (!Array.isArray(weekly) || weekly.length === 0) {
        return `<p class="breakdown-empty">週別のデータがありません</p>`;
    }
    const max = Math.max(1, ...weekly.map(w => Number(w.total) || 0));

    return weekly.map(w => {
        const pct = Math.max(2, Math.round(((Number(w.total) || 0) / max) * 100));
        return `<div class="weekly-row">
            <span class="weekly-label">${w.startDay}〜${w.endDay}日</span>
            <span class="weekly-track"><span class="weekly-fill" style="width:${pct}%"></span></span>
            <span class="weekly-value">${(Number(w.total) || 0).toLocaleString()} ${opts.unit}</span>
        </div>`;
    }).join("");
}

function buildComparisonHtml(comparison, options) {
    const opts = Object.assign({ limit: 6 }, options || {});
    const rows = (comparison || []).filter(c => c.current > 0 || c.previous > 0).slice(0, opts.limit);

    if (rows.length === 0) {
        return `<p class="breakdown-empty">前月と比べられるデータがありません</p>`;
    }

    return rows.map(c => {
        let tag;
        if (c.ratio === null) {
            tag = `<span class="compare-tag is-new">新規</span>`;
        } else {
            const percent = Math.round((c.ratio - 1) * 100);
            if (percent > 0) {
                tag = `<span class="compare-tag is-up">+${percent}%</span>`;
            } else if (percent < 0) {
                tag = `<span class="compare-tag is-down">${percent}%</span>`;
            } else {
                tag = `<span class="compare-tag is-flat">±0%</span>`;
            }
        }
        return `<div class="compare-row">
            <span class="compare-name">${escapeHtml(c.name)}</span>
            ${tag}
            <span class="compare-value">${c.current.toLocaleString()} 円</span>
        </div>`;
    }).join("");
}

// ================================================================
// ▼ planner.js
// ================================================================
const PLANNER_DIFFICULTY = {
    easy: { key: "easy", label: "かんたん", desc: "ゆるく節約して貯める", coefficient: 0.75 },
    normal: { key: "normal", label: "ふつう", desc: "バランスよく節約する", coefficient: 1.0 },
    hard: { key: "hard", label: "むずかしい", desc: "しっかり節約して貯める", coefficient: 1.25 }
};

const DAYS_PER_MONTH = 30;

function getDifficulty(key) {
    return PLANNER_DIFFICULTY[key] || PLANNER_DIFFICULTY.normal;
}

function estimateMonthlyExpense(expenses, monthsBack, fromMonthKey) {
    const base = fromMonthKey || localMonthKey(new Date());
    const keys = [];
    for (let i = 1; i <= monthsBack; i++) keys.push(addMonths(base, -i));

    const totals = [];
    keys.forEach(k => {
        const total = (expenses || [])
            .filter(e => e && !e.deletedAt && e.monthKey === k)
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        if (total > 0) totals.push(total);
    });

    if (totals.length === 0) return null;
    return Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
}

function calculatePlan(input) {
    const src = input || {};
    const income = Number(src.monthlyIncome) || 0;
    const target = Number(src.targetAmount) || 0;
    const expense = Number(src.monthlyExpense) || 0;
    const difficulty = getDifficulty(src.difficulty);

    const base = {
        monthlyIncome: income,
        targetAmount: target,
        monthlyExpense: expense,
        difficulty: difficulty.key,
        difficultyLabel: difficulty.label,
        difficultyDesc: difficulty.desc,
        coefficient: difficulty.coefficient
    };

    if (income <= 0) {
        return Object.assign(base, { ok: false, reason: "月収（手取り）を入力してください。" });
    }
    if (target <= 0) {
        return Object.assign(base, { ok: false, reason: "ほしいものの金額を入力してください。" });
    }

    const surplus = income - expense;
    const surplusInfo = { monthlySurplus: surplus };

    if (surplus <= 0) {
        return Object.assign(base, surplusInfo, {
            ok: false,
            reason: "月の支出が収入を上回っています。まず支出を減らす必要があります。"
        });
    }

    let monthlySaving = Math.round(surplus * difficulty.coefficient);
    monthlySaving = Math.max(1, Math.min(monthlySaving, Math.round(income)));

    const spendable = Math.max(0, income - monthlySaving);

    const months = target / monthlySaving;
    const days = Math.max(1, Math.round(months * DAYS_PER_MONTH));
    const wholeMonths = Math.floor(days / DAYS_PER_MONTH);
    const restDays = days % DAYS_PER_MONTH;

    const now = src.now instanceof Date ? src.now : new Date();
    const targetDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const savingRate = monthlySaving / income;
    let caution = null;
    if (savingRate >= 0.5) {
        caution = `収入の ${Math.round(savingRate * 100)}% を貯金に回す計算です。かなり厳しいので、期間を長めに考えましょう。`;
    }

    return Object.assign(base, surplusInfo, {
        ok: true,
        monthlySaving,
        spendablePerMonth: spendable,
        savingRate,
        months: Math.round(months * 10) / 10,
        days,
        wholeMonths,
        restDays,
        periodLabel: wholeMonths > 0
            ? `${wholeMonths}か月${restDays > 0 ? restDays + "日" : ""}`
            : `${restDays}日`,
        targetDate,
        targetDateLabel: formatPlanDate(targetDate),
        caution
    });
}

function formatPlanDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function getReductionSuggestions(expenses, categories, monthKey, plan, limit) {
    const max = limit || 3;
    if (!plan || !plan.ok || !plan.monthlySaving) return [];

    const totals = {};
    (expenses || []).forEach(e => {
        if (!e || e.deletedAt || e.monthKey !== monthKey) return;
        const cid = String(e.categoryId);
        totals[cid] = (totals[cid] || 0) + (Number(e.amount) || 0);
    });

    const totalSpent = Object.values(totals).reduce((s, v) => s + v, 0);
    if (totalSpent <= 0) return [];

    return Object.entries(totals)
        .map(([cid, amount]) => {
            const cat = (categories || []).find(c => String(c.id) === cid);
            const cutAmount = Math.round(amount * 0.1);
            const newSaving = plan.monthlySaving + cutAmount;
            const newDays = Math.max(1, Math.round((plan.targetAmount / newSaving) * DAYS_PER_MONTH));
            return {
                categoryId: cid,
                name: cat ? cat.name : "不明",
                amount,
                share: amount / totalSpent,
                cutAmount,
                savedDays: plan.days - newDays
            };
        })
        .filter(s => s.cutAmount > 0)
        .sort((a, b) => b.savedDays - a.savedDays || b.amount - a.amount)
        .slice(0, max);
}

function buildPlannerAdvice(plan, suggestions, context) {
    const advice = [];
    if (!plan) return advice;

    if (!plan.ok) {
        advice.push(plan.reason);
        if (/支出が収入を上回/.test(plan.reason || "")) {
            advice.push("まずは「今月の内訳」で一番大きいカテゴリを確認してみましょう。");
        }
        return advice;
    }

    advice.push(`このペースだと、約 ${plan.periodLabel} で「${formatPlanDate(plan.targetDate)}」に買えます。`);

    if (plan.wholeMonths <= 1) {
        advice.push("1か月以内に手が届きます。もう少しだけ踏ん張ってみましょう。");
    } else if (plan.wholeMonths >= 12) {
        advice.push("1年以上かかる計算です。目標金額を分けて、小さな目標から達成するのもおすすめです。");
    }

    (suggestions || []).forEach(s => {
        if (s.savedDays <= 0) return;
        advice.push(`「${s.name}」を1割（約 ${s.cutAmount.toLocaleString()} 円/月）減らすと、${s.savedDays} 日早まります。`);
    });

    if (plan.caution) advice.push(plan.caution);

    const recorded = context && context.recordedMonths;
    if (recorded === 0) {
        advice.push("まだ支出の記録が少ないので、支出額は手入力の値を使っています。記録が増えると精度が上がります。");
    }

    return advice;
}

function buildPlannerPrompt(plan, suggestions, context) {
    const lines = [
        "あなたは家計簿アプリのアドバイザーです。以下の状況を踏まえ、",
        "日本語で2〜3文の前向きで実行しやすい提案を1つだけ書いてください。",
        "説教くさくせず、具体的な金額や日数を含めてください。",
        "",
        `月収(手取り): ${plan.monthlyIncome} 円`,
        `月の支出: ${plan.monthlyExpense} 円`,
        `月の余剰: ${plan.monthlySurplus} 円`,
        `目標金額: ${plan.targetAmount} 円`,
        `難易度: ${plan.difficultyLabel}（${plan.difficultyDesc}）`,
        `毎月の貯金額: ${plan.monthlySaving} 円`,
        `達成までの期間: ${plan.periodLabel}（${plan.days}日）`,
        `自由に使えるお金: ${plan.spendablePerMonth} 円/月`
    ];
    if (suggestions && suggestions.length > 0) {
        lines.push("");
        lines.push("支出の大きいカテゴリ:");
        suggestions.forEach(s => {
            lines.push(`・${s.name}: ${s.amount}円（支出の${Math.round(s.share * 100)}%）、1割減で${s.savedDays}日短縮`);
        });
    }
    if (context && context.topItems && context.topItems.length > 0) {
        lines.push("");
        lines.push("よく買っている品目:");
        context.topItems.slice(0, 5).forEach(t => lines.push(`・${t.name}: ${t.count}回`));
    }
    return lines.join("\n");
}

function getPlanProgress(plan, expenses) {
    if (!plan || !plan.ok || !plan.createdAt) {
        return { saved: 0, remaining: plan ? plan.targetAmount : 0, percent: 0, months: [] };
    }
    const startMonth = localMonthKey(new Date(plan.createdAt));
    const nowMonth = localMonthKey(new Date());
    const months = [];

    let cursor = startMonth;
    let guard = 0;
    while (cursor <= nowMonth && guard < 120) {
        const spent = (expenses || [])
            .filter(e => e && !e.deletedAt && e.monthKey === cursor)
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const income = Number(plan.monthlyIncome) || 0;
        // 今月はまだ終わっていないので、経過した日数ぶんの収入だけを数える
        const frac = cursor === nowMonth
            ? Math.min(1, elapsedDaysInMonth(cursor) / Math.max(1, daysInMonth(cursor)))
            : 1;
        const saved = Math.round(Math.max(0, income * frac - spent));
        months.push({ monthKey: cursor, spent, saved });
        cursor = addMonths(cursor, 1);
        guard++;
    }

    const saved = months.reduce((s, m) => s + m.saved, 0);
    const remaining = Math.max(0, plan.targetAmount - saved);
    return {
        saved,
        remaining,
        percent: plan.targetAmount > 0 ? Math.min(100, Math.round((saved / plan.targetAmount) * 100)) : 0,
        months,
        achieved: saved >= plan.targetAmount
    };
}

// ================================================================
// ▼ receipt.js
// ================================================================
const OCR_SETTINGS_KEY = "yoyu_aru_ocr_settings";
const RECEIPT_DB_NAME = "yoyu_aru_receipts";
const RECEIPT_DB_VERSION = 1;
const RECEIPT_STORE_NAME = "images";

const RECEIPT_MAX_EDGE = 1600;
const RECEIPT_JPEG_QUALITY = 0.8;
const RECEIPT_THUMB_EDGE = 360;

const DEFAULT_OCR_SETTINGS = {
    provider: "gemini",
    apiKey: "",
    model: "gemini-2.0-flash",
    endpoint: ""
};

function getOcrSettings() {
    let saved = null;
    try {
        saved = safeParse(localStorage.getItem(OCR_SETTINGS_KEY));
    } catch (e) { saved = null; }
    return Object.assign({}, DEFAULT_OCR_SETTINGS, saved || {});
}

function saveOcrSettings(settings) {
    try {
        localStorage.setItem(OCR_SETTINGS_KEY, JSON.stringify(settings || {}));
        return true;
    } catch (e) {
        return false;
    }
}

function isOcrConfigured() {
    const s = getOcrSettings();
    if (s.provider === "custom") return !!(s.apiKey && s.endpoint && s.model);
    return !!s.apiKey && !!s.model;
}

function buildReceiptPrompt() {
    return [
        "このレシート画像を読み取り、次のJSONだけを出力してください。",
        "説明文・前置き・Markdownのコードフェンスは一切書かないでください。",
        "",
        "{",
        '  "store": "店舗名（読み取れなければ空文字）",',
        '  "date": "YYYY-MM-DD 形式。不明なら空文字",',
        '  "subtotal": 小計（数値。不明なら0）,',
        '  "tax8": 8%対象の消費税額（数値。不明なら0）,',
        '  "tax10": 10%対象の消費税額（数値。不明なら0）,',
        '  "total": 合計金額（数値。必ず入れる）,',
        '  "items": [',
        '    { "name": "品目名", "price": 金額, "qty": 数量, "taxRate": 8または10, "type": "item" }',
        "  ]",
        "}",
        "",
        "注意事項：",
        "・割引や値引きの行は type を \"discount\" にし、price を負の数にしてください。",
        "・軽減税率（8%）と 10% が混在している場合は taxRate を品目ごとに分けてください。",
        "・「小計」「消費税」「合計」の行は items に含めず、それぞれの項目に入れてください。",
        "・読み取れない品目は無理に作らず、確実なものだけ入れてください。",
        "・金額はすべて円単位の整数にしてください。"
    ].join("\n");
}

function extractJsonObject(text) {
    const raw = String(text || "");
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : raw;

    const start = body.indexOf("{");
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < body.length; i++) {
        const ch = body[i];
        if (inString) {
            if (escaped) { escaped = false; }
            else if (ch === "\\") { escaped = true; }
            else if (ch === '"') { inString = false; }
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return body.slice(start, i + 1);
        }
    }
    return null;
}

function toInt(value) {
    if (typeof value === "number" && isFinite(value)) return Math.round(value);
    const n = parseFloat(String(value === undefined || value === null ? "" : value).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : Math.round(n);
}

function normalizeReceiptItem(item) {
    const it = item && typeof item === "object" ? item : {};
    const type = (it.type === "discount" ? "discount" : "item");
    let price = toInt(it.price);
    if (type === "discount" && price > 0) price = -price;
    return {
        name: String(it.name || "").trim(),
        price: price,
        qty: Math.max(1, toInt(it.qty) || 1),
        taxRate: it.taxRate === 8 ? 8 : (it.taxRate === 10 ? 10 : null),
        type: type
    };
}

function normalizeReceipt(receipt) {
    const r = receipt && typeof receipt === "object" ? receipt : {};
    const items = Array.isArray(r.items) ? r.items.map(normalizeReceiptItem).filter(it => it.name || it.price) : [];

    let date = String(r.date || "").trim();
    const jp = date.match(/(\d{4})[\/年\-](\d{1,2})[\/月\-](\d{1,2})/);
    if (jp) {
        date = `${jp[1]}-${String(jp[2]).padStart(2, "0")}-${String(jp[3]).padStart(2, "0")}`;
    } else {
        date = "";
    }

    return {
        store: String(r.store || "").trim(),
        date: date,
        subtotal: toInt(r.subtotal),
        tax8: toInt(r.tax8),
        tax10: toInt(r.tax10),
        total: toInt(r.total),
        items: items
    };
}

function parseReceiptResponse(text) {
    const jsonText = extractJsonObject(text);
    if (!jsonText) {
        return { ok: false, error: "レシートを読み取れませんでした。手入力に切り替えてください。" };
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (e) {
        return { ok: false, error: "読み取り結果の形式が不正でした。手入力に切り替えてください。" };
    }
    const receipt = normalizeReceipt(parsed);
    if (receipt.total <= 0 && receipt.items.length === 0) {
        return { ok: false, error: "金額を読み取れませんでした。もう一度撮影するか、手入力してください。" };
    }
    return { ok: true, receipt: receipt };
}

function validateReceipt(receipt) {
    const r = normalizeReceipt(receipt);
    const itemSum = r.items.reduce((s, it) => s + it.price * (it.qty || 1), 0);
    const warnings = [];

    if (r.total > 0 && r.items.length > 0) {
        const diff = itemSum - r.total;
        if (Math.abs(diff) > 2) {
            warnings.push(
                `品目の合計（${itemSum.toLocaleString()}円）とレシートの合計（${r.total.toLocaleString()}円）が `
                + `${Math.abs(diff).toLocaleString()}円 違います。読み取り漏れの可能性があります。`
            );
        }
    }
    if (r.total <= 0) {
        warnings.push("合計金額が読み取れていません。金額を確認してください。");
    }
    if (r.items.length === 0) {
        warnings.push("品目が読み取れていません。合計金額だけが記録されます。");
    }
    if (r.tax8 > 0 && r.tax10 > 0) {
        warnings.push("軽減税率（8%）と10%が混在しています。品目の税率を確認してください。");
    }

    return { itemSum, total: r.total, diff: itemSum - r.total, warnings };
}

const CATEGORY_KEYWORDS = {
    "食費": [
        "牛乳", "パン", "卵", "たまご", "お米", "ごはん", "肉", "豚", "牛", "鶏", "野菜", "果物",
        "りんご", "バナナ", "さかな", "惣菜", "弁当", "おにぎり", "サラダ", "ヨーグルト",
        "チーズ", "豆腐", "納豆", "麺", "ラーメン", "うどん", "そば", "パスタ", "カレー", "調味料",
        "醤油", "味噌", "ソース", "サラダ油", "ごま油", "砂糖", "冷凍", "アイス", "菓子", "スナック",
        "チョコ", "ジュース", "お茶", "コーヒー", "飲料", "ウォーター", "ビール", "ワイン"
    ],
    "日用品": [
        "ティッシュ", "ペーパー", "トイレット", "洗剤", "シャンプー", "コンディショナー", "石鹸",
        "石けん", "歯磨き", "ハブラシ", "タオル", "ゴミ袋", "ラップ", "ホイル", "電池", "スポンジ",
        "マスク", "柔軟剤", "漂白", "掃除", "洗面", "キッチン", "収納",
        "ボールペン", "ノート", "ファイル"
    ],
    "交通費": [
        "電車", "バス", "タクシー", "ガソリン", "軽油", "駐車", "パーキング", "切符", "きっぷ",
        "定期", "高速", "充電", "チャージ", "運賃", "鉄道", "メトロ"
    ],
    "娯楽": [
        "ゲーム", "映画", "シネマ", "書籍", "雑誌", "コミック", "カラオケ", "チケット",
        "玩具", "おもちゃ", "フィギュア", "配信", "サブスク", "課金", "グッズ", "ライブ"
    ],
    "医療": [
        "くすり", "病院", "診察", "処方", "サプリ", "目薬", "絆創膏", "湿布", "整骨",
        "歯科", "クリニック", "ドラッグ"
    ]
};

function guessCategoryId(itemName, categories, fallbackId) {
    const name = String(itemName || "");
    const list = Array.isArray(categories) ? categories : [];
    const fallback = fallbackId || (list[0] ? list[0].id : null);
    if (!name || list.length === 0) return fallback;

    let best = null;
    let bestLen = 0;
    Object.keys(CATEGORY_KEYWORDS).forEach(categoryName => {
        CATEGORY_KEYWORDS[categoryName].forEach(keyword => {
            if (keyword.length > bestLen && name.indexOf(keyword) !== -1) {
                best = categoryName;
                bestLen = keyword.length;
            }
        });
    });

    if (!best) return fallback;
    const matched = list.find(c => c.name === best);
    return matched ? matched.id : fallback;
}

function assignCategoriesToItems(items, categories, fallbackId) {
    return (Array.isArray(items) ? items : []).map(it => Object.assign({}, it, {
        categoryId: guessCategoryId(it.name, categories, fallbackId)
    }));
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) { reject(new Error("ファイルがありません。")); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("画像を読み込めませんでした。"));
            img.src = String(reader.result);
        };
        reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
        reader.readAsDataURL(file);
    });
}

function resizeImageToDataUrl(img, maxEdge, quality) {
    const edge = maxEdge || RECEIPT_MAX_EDGE;
    const q = quality === undefined ? RECEIPT_JPEG_QUALITY : quality;

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("画像のサイズを取得できませんでした。");

    const scale = Math.min(1, edge / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像を加工できませんでした。");
    ctx.drawImage(img, 0, 0, outW, outH);

    return {
        dataUrl: canvas.toDataURL("image/jpeg", q),
        width: outW,
        height: outH,
        originalWidth: w,
        originalHeight: h
    };
}

function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || "").split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const binary = atob(parts[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

function openReceiptDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("この環境では画像を保存できません。"));
            return;
        }
        const req = indexedDB.open(RECEIPT_DB_NAME, RECEIPT_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(RECEIPT_STORE_NAME)) {
                db.createObjectStore(RECEIPT_STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error("画像の保存領域を開けませんでした。"));
    });
}

async function saveReceiptImage(id, blob) {
    const db = await openReceiptDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(RECEIPT_STORE_NAME, "readwrite");
        tx.objectStore(RECEIPT_STORE_NAME).put(blob, id);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(new Error("画像を保存できませんでした。")); };
    });
}

async function getReceiptImage(id) {
    if (!id) return null;
    const db = await openReceiptDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(RECEIPT_STORE_NAME, "readonly");
        const req = tx.objectStore(RECEIPT_STORE_NAME).get(id);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror = () => { db.close(); reject(new Error("画像を読み込めませんでした。")); };
    });
}

async function deleteReceiptImage(id) {
    if (!id) return false;
    const db = await openReceiptDb();
    return new Promise((resolve) => {
        const tx = db.transaction(RECEIPT_STORE_NAME, "readwrite");
        tx.objectStore(RECEIPT_STORE_NAME).delete(id);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
    });
}

async function listReceiptImageIds() {
    try {
        const db = await openReceiptDb();
        return await new Promise((resolve) => {
            const tx = db.transaction(RECEIPT_STORE_NAME, "readonly");
            const req = tx.objectStore(RECEIPT_STORE_NAME).getAllKeys();
            req.onsuccess = () => { db.close(); resolve(req.result || []); };
            req.onerror = () => { db.close(); resolve([]); };
        });
    } catch (e) {
        return [];
    }
}

function describeHttpError(status) {
    if (status === 400) return "リクエストが拒否されました。モデル名を確認してください。";
    if (status === 401 || status === 403) return "APIキーが正しくないか、権限がありません。";
    if (status === 429) return "利用回数の上限に達しました。少し待ってから試してください。";
    if (status >= 500) return "サーバー側でエラーが発生しました。時間をおいて試してください。";
    return `通信に失敗しました（HTTP ${status}）。`;
}

function buildVisionRequest(dataUrl, settings, prompt) {
    const s = settings || {};
    const base64 = String(dataUrl).split(",")[1] || "";

    if (s.provider === "gemini") {
        const endpoint = (s.endpoint || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
        const model = s.model || "gemini-2.0-flash";
        return {
            // キーを URL に載せると、通信ログやスクリーンショットに残るのでヘッダーで送る
            url: `${endpoint}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": s.apiKey
            },
            body: {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/jpeg", data: base64 } }
                    ]
                }],
                generationConfig: { temperature: 0, responseMimeType: "application/json" }
            }
        };
    }

    const endpoint = s.endpoint || "https://api.openai.com/v1";
    return {
        url: `${endpoint.replace(/\/$/, "")}/chat/completions`,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${s.apiKey}`
        },
        body: {
            model: s.model || "gpt-4o-mini",
            temperature: 0,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            }]
        }
    };
}

function extractResponseText(provider, json) {
    try {
        if (provider === "gemini") {
            const parts = json.candidates[0].content.parts;
            return parts.map(p => p.text || "").join("");
        }
        return json.choices[0].message.content || "";
    } catch (e) {
        return "";
    }
}

async function recognizeReceipt(dataUrl, settings) {
    const s = settings || getOcrSettings();
    if (!s.apiKey) {
        return { ok: false, httpOk: false, error: "APIキーが設定されていません。" };
    }

    // カスタム先は https のみ許可（localhost だけ開発用に例外）。
    // http のまま送ると API キーが平文で流れるため。
    if (s.provider === "custom") {
        const endpoint = String(s.endpoint || "").trim();
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(endpoint);
        if (!/^https:\/\//i.test(endpoint) && !isLocal) {
            return { ok: false, httpOk: false, error: "エンドポイントは https:// で指定してください（localhost を除く）。" };
        }
    }

    const prompt = buildReceiptPrompt();
    const req = buildVisionRequest(dataUrl, s, prompt);

    // 通信が固まったまま「読み取っています…」が残らないように 20 秒で打ち切る
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;

    let res;
    try {
        res = await fetch(req.url, {
            method: "POST",
            headers: req.headers,
            body: JSON.stringify(req.body),
            signal: controller ? controller.signal : undefined
        });
    } catch (e) {
        const aborted = e && e.name === "AbortError";
        return {
            ok: false,
            httpOk: false,
            error: aborted
                ? "読み取りがタイムアウトしました。通信環境を確認して、もう一度試してください。"
                : "通信できませんでした。オフラインか、接続が制限されている可能性があります。"
        };
    } finally {
        if (controller) clearTimeout(timer);
    }

    if (!res.ok) {
        return { ok: false, httpOk: false, error: describeHttpError(res.status) };
    }

    let json;
    try {
        json = await res.json();
    } catch (e) {
        // HTTP 自体は通っているので「接続テスト」は成功扱いにする
        return { ok: false, httpOk: true, error: "応答を解釈できませんでした。モデル名やエンドポイントを確認してください。" };
    }

    const text = extractResponseText(s.provider, json);
    const parsed = parseReceiptResponse(text);
    return Object.assign({ httpOk: true }, parsed);
}
