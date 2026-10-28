// ==========================================
// gacha.js — ガチャとコレクション（v2.17）
// ==========================================
// ・ログインボーナスや記録でためたポイントで、新しいペットと部屋（マップ）が手に入る
// ・「まだ持っていないもの」だけが出る（ダブりなし。お金のアプリなので引かされる感じを避ける）
// ・レア度で出やすさが違う（★ふつう 6 : ★★レア 3 : ★★★スーパーレア 1 の重み）
// ・手に入れたものは「コレクション」からいつでも切り替えられる
// ==========================================

const GACHA_COST = 1000;

const GACHA_RARITY = {
    1: { stars: "★",   label: "ノーマル",       weight: 6 },
    2: { stars: "★★",  label: "レア",           weight: 3 },
    3: { stars: "★★★", label: "スーパーレア",   weight: 1 }
};

const GACHA_POOL = [
    { kind: "pet", id: "neko",      rarity: 1 },
    { kind: "pet", id: "usagi",     rarity: 1 },
    { kind: "map", id: "washitsu",  rarity: 1 },
    { kind: "pet", id: "shiba",     rarity: 2 },
    { kind: "pet", id: "hamster",   rarity: 2 },
    { kind: "map", id: "seaside",   rarity: 2 },
    { kind: "pet", id: "panda",     rarity: 3 },
    { kind: "map", id: "nightloft", rarity: 3 }
];

let gachaBusy = false;

// ------------------------------------------
// ロジック（画面に依存しない部分）
// ------------------------------------------
function gachaIsOwned(item) {
    return item.kind === "pet"
        ? roomData.ownedPets.includes(item.id)
        : roomData.ownedMaps.includes(item.id);
}

function gachaRemainingItems() {
    return GACHA_POOL.filter(it => !gachaIsOwned(it));
}

function gachaInfo(item) {
    if (item.kind === "pet") {
        const p = PET_CATALOG[item.id];
        return { label: p.label, img: PET_AWAKE_IMG[item.id], kindLabel: "ペット" };
    }
    const m = MAP_CATALOG[item.id];
    return { label: m.label, img: m.img, kindLabel: "部屋" };
}

// 残りの景品から、レア度ごとの当たる確率（%）を出す
function gachaOdds(items) {
    const total = items.reduce((s, it) => s + GACHA_RARITY[it.rarity].weight, 0);
    const out = {};
    [1, 2, 3].forEach(r => {
        const w = items.filter(it => it.rarity === r).reduce((s, it) => s + GACHA_RARITY[it.rarity].weight, 0);
        out[r] = total > 0 ? (w / total) * 100 : 0;
    });
    return out;
}

function gachaPick(items, rand) {
    const rnd = typeof rand === "function" ? rand : Math.random;
    const total = items.reduce((s, it) => s + GACHA_RARITY[it.rarity].weight, 0);
    let t = rnd() * total;
    for (const it of items) {
        t -= GACHA_RARITY[it.rarity].weight;
        if (t < 0) return it;
    }
    return items[items.length - 1];
}

// 1回ひく。ポイントを引いて、持ち物に追加して保存するところまでを一度にやる
// （途中で画面を閉じても、ポイントだけ減って何も手に入らない、が起きないように）
function pullGacha(rand) {
    if (roomData.points < GACHA_COST) return { ok: false, error: "ポイントが足りません" };
    const remaining = gachaRemainingItems();
    if (remaining.length === 0) return { ok: false, error: "すべて集めました！" };

    const item = gachaPick(remaining, rand);
    roomData.points -= GACHA_COST;
    if (item.kind === "pet") {
        roomData.ownedPets.push(item.id);
        if (!roomData.petNames[item.id]) roomData.petNames[item.id] = PET_CATALOG[item.id].defaultName;
    } else {
        roomData.ownedMaps.push(item.id);
    }
    roomData.gacha.pulls = (roomData.gacha.pulls || 0) + 1;
    saveRoomData();
    renderCurrency();
    return { ok: true, item };
}

function equipPet(type, newName) {
    if (!PET_CATALOG[type] || !roomData.ownedPets.includes(type)) return false;
    const prev = roomData.pet;
    if (prev && prev.type !== type) roomData.petNames[prev.type] = prev.name;   // いまの子の名前は覚えておく
    if (newName) roomData.petNames[type] = String(newName).trim().slice(0, 12);
    const name = roomData.petNames[type] || petDefaultName(type);
    roomData.pet = {
        type, name,
        x: prev ? prev.x : 50,
        y: PET_FLOOR_Y,
        scale: prev ? prev.scale : 1
    };
    saveRoomData();
    renderRoomPreview();
    centerRoomPreviewOnPet();
    preloadPetSleepGif();
    petSay(getPetLine("idle", `${name}だよ、よろしく`));
    return true;
}

function equipMap(id) {
    if (!MAP_CATALOG[id] || !roomData.ownedMaps.includes(id)) return false;
    roomData.mapId = id;
    saveRoomData();
    applyRoomMap();
    petSay(getPetLine("idle", `${MAP_CATALOG[id].label}にお引っこし`));
    return true;
}

// ------------------------------------------
// 画面
// ------------------------------------------
function gEl(id) { return document.getElementById(id); }

function openGachaModal() {
    renderCurrency();
    renderGachaPane();
    renderCollection();
    switchGachaTab("pull");
    gEl("modal-gacha")?.classList.add("open");
}

function closeGachaModal() {
    if (gachaBusy) return;
    gEl("modal-gacha")?.classList.remove("open");
}

function switchGachaTab(tab) {
    const isPull = tab === "pull";
    gEl("gacha-pane-pull").style.display = isPull ? "" : "none";
    gEl("gacha-pane-collection").style.display = isPull ? "none" : "";
    gEl("tab-gacha-pull")?.classList.toggle("is-active", isPull);
    gEl("tab-gacha-collection")?.classList.toggle("is-active", !isPull);
    if (!isPull) renderCollection();
}

function renderGachaPane() {
    const remaining = gachaRemainingItems();
    const total = GACHA_POOL.length;
    const costEl = gEl("gacha-cost");
    if (costEl) costEl.textContent = GACHA_COST.toLocaleString();

    const remainEl = gEl("gacha-remain");
    if (remainEl) {
        remainEl.textContent = remaining.length === 0
            ? "コンプリート！ すべてのペットと部屋を集めました。"
            : `まだ出会っていないもの：あと ${remaining.length} / ${total} 種`;
    }

    const oddsEl = gEl("gacha-odds");
    if (oddsEl) {
        oddsEl.innerHTML = "";
        if (remaining.length > 0) {
            const odds = gachaOdds(remaining);
            [3, 2, 1].forEach(r => {
                const n = remaining.filter(it => it.rarity === r).length;
                if (n === 0) return;
                const row = document.createElement("div");
                row.className = "gacha-odds-row";
                const left = document.createElement("span");
                left.textContent = `${GACHA_RARITY[r].stars} ${GACHA_RARITY[r].label}（${n}種）`;
                const right = document.createElement("strong");
                right.textContent = `${odds[r].toFixed(1)}%`;
                row.appendChild(left); row.appendChild(right);
                oddsEl.appendChild(row);
            });
        }
    }

    const btn = gEl("btn-gacha-pull");
    const status = gEl("gacha-status");
    if (btn) {
        if (remaining.length === 0) {
            btn.disabled = true; btn.textContent = "コンプリート済み";
            if (status) status.textContent = "";
        } else if (roomData.points < GACHA_COST) {
            btn.disabled = true; btn.textContent = "ガチャをひく";
            if (status) status.textContent = `あと ${(GACHA_COST - roomData.points).toLocaleString()}pt でひけます。ログインや記録でためよう！`;
        } else {
            btn.disabled = false; btn.textContent = `ガチャをひく（${GACHA_COST.toLocaleString()}pt）`;
            if (status) status.textContent = "";
        }
    }
}

function collectionCard(kind, id, owned, active) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `collection-card${owned ? "" : " is-locked"}${active ? " is-active" : ""}${kind === "map" ? " is-map" : ""}`;
    card.dataset.kind = kind; card.dataset.id = id;

    const img = document.createElement("img");
    img.alt = ""; img.draggable = false;
    img.src = kind === "pet" ? PET_AWAKE_IMG[id] : MAP_CATALOG[id].img;
    const label = document.createElement("span");
    label.className = "collection-label";
    const base = kind === "pet" ? PET_CATALOG[id].label : MAP_CATALOG[id].label;
    label.textContent = owned ? base : "？？？";
    card.appendChild(img); card.appendChild(label);

    if (active) {
        const badge = document.createElement("span");
        badge.className = "collection-badge";
        badge.textContent = "つかっている";
        card.appendChild(badge);
    }
    const poolItem = GACHA_POOL.find(it => it.kind === kind && it.id === id);
    if (poolItem) {
        const stars = document.createElement("span");
        stars.className = `collection-stars r${poolItem.rarity}`;
        stars.textContent = GACHA_RARITY[poolItem.rarity].stars;
        card.appendChild(stars);
    }

    card.addEventListener("click", () => {
        if (!owned) { showToast("ガチャで手に入るよ"); return; }
        if (active) return;
        if (kind === "pet") equipPet(id); else equipMap(id);
        playPop(); vibrate(15);
        renderCollection();
    });
    return card;
}

function renderCollection() {
    const petsEl = gEl("collection-pets");
    const mapsEl = gEl("collection-maps");
    if (!petsEl || !mapsEl) return;
    petsEl.innerHTML = ""; mapsEl.innerHTML = "";

    Object.keys(PET_CATALOG).forEach(id => {
        const owned = roomData.ownedPets.includes(id);
        petsEl.appendChild(collectionCard("pet", id, owned, owned && roomData.pet && roomData.pet.type === id));
    });
    Object.keys(MAP_CATALOG).forEach(id => {
        const owned = roomData.ownedMaps.includes(id);
        mapsEl.appendChild(collectionCard("map", id, owned, owned && roomData.mapId === id));
    });

    const have = roomData.ownedPets.length + roomData.ownedMaps.length;
    const all = Object.keys(PET_CATALOG).length + Object.keys(MAP_CATALOG).length;
    const countEl = gEl("gacha-collection-count");
    if (countEl) countEl.textContent = `${have}/${all}`;
}

// ------------------------------------------
// 演出：カプセルがゆれる → ひらく → 結果カード
// ------------------------------------------
const CAPSULE_SVG = `
<svg class="gacha-capsule-svg" viewBox="0 0 120 120" aria-hidden="true">
  <g class="cap-bottom"><path d="M12 60 A48 48 0 0 0 108 60 Z" fill="#fff7ec" stroke="#191b1d" stroke-width="4"/></g>
  <g class="cap-top"><path d="M12 60 A48 48 0 0 1 108 60 Z" fill="#e8647a" stroke="#191b1d" stroke-width="4"/>
     <ellipse cx="40" cy="36" rx="12" ry="7" fill="#fff" opacity=".55" transform="rotate(-30 40 36)"/></g>
  <rect x="8" y="57" width="104" height="6" fill="#191b1d"/>
</svg>`;

function gachaSparkles(host, count) {
    for (let i = 0; i < count; i++) {
        const s = document.createElement("span");
        s.className = "gacha-spark";
        s.textContent = "✦";
        s.style.left = (8 + Math.random() * 84) + "%";
        s.style.top = (10 + Math.random() * 70) + "%";
        s.style.animationDelay = (Math.random() * 0.6) + "s";
        s.style.fontSize = (12 + Math.random() * 16) + "px";
        host.appendChild(s);
    }
}

function playGachaSequence(item) {
    const overlay = gEl("gacha-overlay");
    if (!overlay) return;
    gachaBusy = true;
    overlay.innerHTML = `<div class="gacha-stage">${CAPSULE_SVG}<p class="gacha-stage-text">ガチャッ…</p></div>`;
    overlay.className = "gacha-overlay show";

    let revealed = false;
    const timers = [];
    const reveal = () => {
        if (revealed) return;
        revealed = true;
        timers.forEach(clearTimeout);
        showGachaResult(item);
    };
    [0, 320, 640, 960].forEach((ms, i) => timers.push(setTimeout(() => { playTone(300 + i * 90, 0.07, "square", 0.06); vibrate(10); }, ms)));
    timers.push(setTimeout(() => overlay.querySelector(".gacha-stage")?.classList.add("is-opening"), 1250));
    timers.push(setTimeout(reveal, 1650));
    overlay.onclick = reveal;                   // タップでスキップ
}

function showGachaResult(item) {
    const overlay = gEl("gacha-overlay");
    if (!overlay) return;
    const info = gachaInfo(item);
    const rar = GACHA_RARITY[item.rarity];
    overlay.onclick = null;
    overlay.className = `gacha-overlay show r${item.rarity}`;
    overlay.innerHTML = "";

    const card = document.createElement("div");
    card.className = `gacha-result r${item.rarity}`;

    const stars = document.createElement("div"); stars.className = "gacha-result-stars"; stars.textContent = rar.stars;
    const sub = document.createElement("div"); sub.className = "gacha-result-sub"; sub.textContent = `${rar.label}／あたらしい${info.kindLabel}`;
    const badge = document.createElement("span"); badge.className = "gacha-new"; badge.textContent = "NEW!";
    const imgWrap = document.createElement("div"); imgWrap.className = `gacha-result-img ${item.kind}`;
    const img = document.createElement("img"); img.src = info.img; img.alt = ""; img.draggable = false;
    imgWrap.appendChild(img);
    const name = document.createElement("h3"); name.className = "gacha-result-name"; name.textContent = info.label;

    card.appendChild(badge); card.appendChild(stars); card.appendChild(sub); card.appendChild(imgWrap); card.appendChild(name);

    let input = null;
    if (item.kind === "pet") {
        const label = document.createElement("label"); label.className = "gacha-name-label"; label.textContent = "名前をつけよう";
        input = document.createElement("input");
        input.type = "text"; input.id = "gacha-name-input"; input.className = "gacha-name-input";
        input.maxLength = 12; input.value = roomData.petNames[item.id] || petDefaultName(item.id); input.autocomplete = "off";
        card.appendChild(label); card.appendChild(input);
    }

    const actions = document.createElement("div"); actions.className = "gacha-result-actions";
    const finish = (equip) => {
        if (item.kind === "pet") {
            const nm = (input.value || "").trim() || petDefaultName(item.id);
            roomData.petNames[item.id] = nm.slice(0, 12);
            saveRoomData();
            if (equip) equipPet(item.id, nm);
        } else if (equip) {
            equipMap(item.id);
        }
        closeGachaOverlay();
    };
    const primary = document.createElement("button");
    primary.type = "button"; primary.className = "primary-button";
    primary.id = "btn-gacha-equip";
    primary.textContent = item.kind === "pet" ? "この子といっしょにくらす" : "この部屋にお引っこし";
    primary.addEventListener("click", () => finish(true));
    const later = document.createElement("button");
    later.type = "button"; later.className = "text-cancel-button";
    later.id = "btn-gacha-later";
    later.textContent = "あとで（コレクションに入れる）";
    later.addEventListener("click", () => finish(false));
    actions.appendChild(primary); actions.appendChild(later);
    card.appendChild(actions);

    overlay.appendChild(card);
    gachaSparkles(overlay, item.rarity === 3 ? 26 : item.rarity === 2 ? 14 : 7);

    // ファンファーレ（レア度が高いほど長い）
    const notes = item.rarity === 3 ? [784, 988, 1175, 1568, 1976] : item.rarity === 2 ? [660, 880, 1109] : [660, 880];
    notes.forEach((f, i) => setTimeout(() => playTone(f, 0.16, "triangle", 0.1), i * 110));
    vibrate(item.rarity === 3 ? 60 : 30);
}

function closeGachaOverlay() {
    const overlay = gEl("gacha-overlay");
    if (overlay) { overlay.className = "gacha-overlay"; overlay.innerHTML = ""; overlay.onclick = null; }
    gachaBusy = false;
    renderGachaPane();
    renderCollection();
    renderCurrency();
}

function onGachaPullClick() {
    if (gachaBusy) return;
    const res = pullGacha();
    if (!res.ok) {
        const status = gEl("gacha-status");
        if (status) status.textContent = res.error;
        return;
    }
    playGachaSequence(res.item);
}

document.addEventListener("DOMContentLoaded", () => {
    gEl("btn-open-gacha")?.addEventListener("click", openGachaModal);
    gEl("btn-close-gacha")?.addEventListener("click", closeGachaModal);
    gEl("btn-gacha-pull")?.addEventListener("click", onGachaPullClick);
    gEl("tab-gacha-pull")?.addEventListener("click", () => switchGachaTab("pull"));
    gEl("tab-gacha-collection")?.addEventListener("click", () => switchGachaTab("collection"));
});
