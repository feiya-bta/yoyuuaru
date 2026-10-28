// ==========================================
// onboarding.js — 初回ガイド
// ==========================================
// 流れ：ペットの名前を決める → ① 予算を決める → ② 1件記録する → ③ 引っ越しの案内
// 画面をふさがない小さなカードで案内する（途中でスキップ可）。
// 進み具合は端末に保存し、途中で閉じても続きから再開する。
//   ・初めてペットを迎えた人にだけ自動で始まる（すでに使っている人には出ない）
//   ・「設定 → 使い方をもう一度見る」から、いつでも見直せる
// ==========================================

const ONBOARDING_KEY = "yoyu_aru_onboarding";

const ONBOARDING_STEPS = [
    {
        id: "budget",
        title: "① 今月の予算を決めよう",
        body: "上の予算ボックスの えんぴつ をタップして、今月使ってよい金額を入れてね。",
        target: "#budget-box",
        action: "btn-edit-budget"
    },
    {
        id: "expense",
        title: "② 1件、記録してみよう",
        body: "右下の ＋ をタップして、金額とカテゴリを入れて「記録する」を押してね。レシートの読み取りもできるよ。",
        target: "#fab-add-expense"
    },
    {
        id: "finish",
        title: "③ 最後に、だいじなこと",
        body: "データはこの端末の中だけに保存されます。機種変更や万一に備えて、「データ移行」でコードを保存しておこう。部屋は下に引くと小さくなるよ。",
        target: "#btn-open-account",
        final: true
    }
];

function readOnboardingState() {
    try {
        const s = JSON.parse(localStorage.getItem(ONBOARDING_KEY) || "null");
        return (s && typeof s === "object") ? s : null;
    } catch (e) { return null; }
}

function writeOnboardingState(state) {
    try { localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても進められる */ }
}

function clearOnboardingHighlight() {
    document.querySelectorAll(".onb-highlight").forEach(el => el.classList.remove("onb-highlight"));
}

function removeOnboardingCard() {
    clearOnboardingHighlight();
    document.getElementById("onboarding-card")?.remove();
}

function finishOnboarding() {
    removeOnboardingCard();
    writeOnboardingState({ done: true, finishedAt: new Date().toISOString() });
}

// scrollIntoView は外枠(.app-container)まで動かして画面全体がずれることがあるので、
// 中身のスクロール領域（.app-content）だけを動かす。
function scrollTargetIntoContent(target) {
    const content = document.querySelector(".app-content");
    if (!content || !content.contains(target)) return;     // 固定表示の要素は動かさない
    const c = content.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const top = content.scrollTop + (t.top - c.top) - 16;
    try { content.scrollTo({ top: Math.max(0, top), behavior: "smooth" }); } catch (e) { content.scrollTop = Math.max(0, top); }
}

// ヘッダーのすぐ下（部屋の上）に置く。下側には予算の「保存」や ＋ ボタンがあるので避ける。
function positionOnboardingCard() {
    const card = document.getElementById("onboarding-card");
    const header = document.querySelector(".app-header");
    if (!card) return;
    const bottom = header ? header.getBoundingClientRect().bottom : 60;
    card.style.top = Math.round(bottom + 6) + "px";
}
window.addEventListener("resize", positionOnboardingCard);

function showOnboardingStep(index) {
    const step = ONBOARDING_STEPS[index];
    if (!step) { finishOnboarding(); return; }
    writeOnboardingState({ done: false, step: index });
    removeOnboardingCard();

    const card = document.createElement("div");
    card.id = "onboarding-card";
    card.className = "onboarding-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "使い方ガイド");

    const dots = ONBOARDING_STEPS.map((_, i) => `<span class="onb-dot${i === index ? " is-active" : ""}"></span>`).join("");
    card.innerHTML =
        `<div class="onb-head"><span class="onb-dots">${dots}</span>` +
        `<button type="button" class="onb-skip" id="onb-skip">スキップ</button></div>` +
        `<h4 class="onb-title"></h4><p class="onb-body"></p>` +
        `<div class="onb-actions"></div>`;
    card.querySelector(".onb-title").textContent = step.title;
    card.querySelector(".onb-body").textContent = step.body;

    const actions = card.querySelector(".onb-actions");
    if (step.final) {
        const open = document.createElement("button");
        open.type = "button";
        open.className = "primary-button-sm";
        open.textContent = "データ移行を開く";
        open.addEventListener("click", () => {
            finishOnboarding();
            if (typeof openTransferModal === "function") openTransferModal();
        });
        const done = document.createElement("button");
        done.type = "button";
        done.className = "secondary-button";
        done.textContent = "はじめる";
        done.addEventListener("click", finishOnboarding);
        actions.appendChild(open);
        actions.appendChild(done);
    } else if (step.action) {
        const go = document.createElement("button");
        go.type = "button";
        go.className = "primary-button-sm";
        go.textContent = "予算を入れる";
        go.addEventListener("click", () => document.getElementById(step.action)?.click());
        actions.appendChild(go);
    }

    card.querySelector("#onb-skip").addEventListener("click", finishOnboarding);
    // .app-container の中に置く。こうするとモーダル（z-index:100）より後ろに回り、
    // 「保存」などのボタンをカードが覆わない。
    (document.querySelector(".app-container") || document.body).appendChild(card);
    positionOnboardingCard();

    const target = document.querySelector(step.target);
    if (target) {
        target.classList.add("onb-highlight");
        scrollTargetIntoContent(target);
    }
}

// force=true は「もう一度見る」。最初からやり直す。
function startOnboarding(force) {
    const state = readOnboardingState();
    if (!force) {
        if (state) return;                       // 開始済み、または完了済み
        const hasData = (typeof activeExpenses === "function" && activeExpenses().length > 0);
        if (hasData) {                           // データ移行で来た人など
            writeOnboardingState({ done: true, skipped: "has-data" });
            return;
        }
    }
    showOnboardingStep(0);
}

// app.js から呼ばれる：budget / expense が完了したら次へ
function onboardingNotify(eventName) {
    const state = readOnboardingState();
    if (!state || state.done) return;
    const index = Number(state.step) || 0;
    const step = ONBOARDING_STEPS[index];
    if (!step || step.id !== eventName) return;
    // トーストやペットの反応が見えるように、少し待ってから次へ
    setTimeout(() => {
        const now = readOnboardingState();
        if (now && !now.done && Number(now.step) === index) showOnboardingStep(index + 1);
    }, 900);
}

// 入力中（キーボードが出ているとき）は、カードが入力欄に重ならないよう一時的に引っ込める
let onbAwayTimer = null;
function isTextField(el) {
    return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}
document.addEventListener("focusin", (e) => {
    if (!isTextField(e.target)) return;
    clearTimeout(onbAwayTimer);
    document.getElementById("onboarding-card")?.classList.add("is-away");
});
document.addEventListener("focusout", () => {
    clearTimeout(onbAwayTimer);
    onbAwayTimer = setTimeout(() => {
        if (isTextField(document.activeElement)) return;
        document.getElementById("onboarding-card")?.classList.remove("is-away");
    }, 250);
});

// 起動時：途中で閉じていたら続きから再開する
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        const state = readOnboardingState();
        if (state && !state.done && typeof roomData !== "undefined" && roomData.pet) {
            showOnboardingStep(Math.min(Number(state.step) || 0, ONBOARDING_STEPS.length - 1));
        }
    }, 700);
});
