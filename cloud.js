// ================================================================
// ▼ sync.js
// ================================================================

// ==========================================
// sync.js — バックアップとデータ統合（同期の中核）
// ==========================================
// 方針：
//   ・「マージ規則」は純粋関数として書く。ここが一番バグりやすいので
//     テストで固める。
//   ・通信部分は SyncTransport として差し替え可能にする。
//   ・マージの統計は「支出・カテゴリ・予算」で分けて集計する。
//     以前は全部同じ stats を共有していたため、画面の「追加 N件」が
//     支出の件数なのかカテゴリも含むのか分からなかった。
// ==========================================

const BACKUP_FORMAT = "yoyu-aru-backup";
const BACKUP_VERSION = 1;

function recordStamp(record) {
    if (!record || typeof record !== "object") return "";
    return String(record.updatedAt || record.deletedAt || record.createdAt || record.datetime || "");
}

function isNewer(a, b) {
    return String(a || "") > String(b || "");
}

function newMergeStats() {
    return { pulled: 0, updated: 0, keptLocal: 0, same: 0, conflicts: 0 };
}

function addMergeStats(target, source) {
    ["pulled", "updated", "keptLocal", "same", "conflicts"].forEach(k => {
        target[k] += source[k] || 0;
    });
    return target;
}

function mergeCollection(localList, remoteList, stats, label) {
    const local = Array.isArray(localList) ? localList : [];
    const remote = Array.isArray(remoteList) ? remoteList : [];
    const out = new Map();

    local.forEach(item => {
        if (item && item.id !== undefined && item.id !== null) out.set(String(item.id), item);
    });

    remote.forEach(item => {
        if (!item || item.id === undefined || item.id === null) return;
        const id = String(item.id);
        const mine = out.get(id);

        if (!mine) {
            out.set(id, item);
            stats.pulled++;
        } else {
            const mineStamp = recordStamp(mine);
            const theirsStamp = recordStamp(item);
            if (isNewer(theirsStamp, mineStamp)) {
                out.set(id, item);
                stats.updated++;
            } else if (isNewer(mineStamp, theirsStamp)) {
                stats.keptLocal++;
            } else {
                stats.same++;
            }
            if (mineStamp && theirsStamp && mineStamp !== theirsStamp) stats.conflicts++;
        }
    });

    void label;
    return [...out.values()];
}

function mergeBudget(localBudget, remoteBudget, localMeta, remoteMeta, stats) {
    const out = Object.assign({}, localBudget || {});
    const meta = Object.assign({}, localMeta || {});
    const remoteKeys = Object.keys(remoteBudget || {});

    remoteKeys.forEach(key => {
        const localHas = Object.prototype.hasOwnProperty.call(out, key);
        if (!localHas) {
            out[key] = remoteBudget[key];
            if (remoteMeta && remoteMeta[key]) meta[key] = remoteMeta[key];
            stats.pulled++;
            return;
        }
        const mineStamp = (localMeta && localMeta[key]) || "";
        const theirsStamp = (remoteMeta && remoteMeta[key]) || "";
        if (isNewer(theirsStamp, mineStamp)) {
            out[key] = remoteBudget[key];
            if (theirsStamp) meta[key] = theirsStamp;
            stats.updated++;
        } else {
            stats.keptLocal++;
        }
    });

    return { budget: out, budgetUpdatedAt: meta };
}

// カテゴリ別予算は「月ごとのまとまり」で新しい方を採用する。
// 同じ月をカテゴリ単位で混ぜると、片方で消した予算が復活しやすいため。
function mergeCategoryBudgets(localMap, remoteMap, localMeta, remoteMeta, idRemap) {
    const out = {};
    const meta = {};
    const remapRemote = (map) => {
        const result = {};
        Object.keys(map || {}).forEach(id => {
            const target = idRemap && idRemap[String(id)] !== undefined ? idRemap[String(id)] : id;
            const amount = Number(map[id]);
            if (isFinite(amount) && amount > 0) result[String(target)] = Math.round(amount);
        });
        return result;
    };

    const months = new Set([
        ...Object.keys(localMap || {}),
        ...Object.keys(remoteMap || {})
    ]);

    months.forEach(monthKey => {
        const local = (localMap && typeof localMap[monthKey] === "object") ? localMap[monthKey] : null;
        const remote = (remoteMap && typeof remoteMap[monthKey] === "object")
            ? remapRemote(remoteMap[monthKey])
            : null;

        if (local && remote) {
            const remoteWins = isNewer(remoteMeta && remoteMeta[monthKey], localMeta && localMeta[monthKey]);
            const chosen = remoteWins ? remote : local;
            if (Object.keys(chosen).length > 0) out[monthKey] = chosen;
            const stamp = remoteWins ? (remoteMeta && remoteMeta[monthKey]) : (localMeta && localMeta[monthKey]);
            if (stamp && Object.keys(chosen).length > 0) meta[monthKey] = stamp;
            return;
        }

        const chosen = remote || local;
        if (!chosen || Object.keys(chosen).length === 0) return;
        out[monthKey] = chosen;
        const stamp = remote ? (remoteMeta && remoteMeta[monthKey]) : (localMeta && localMeta[monthKey]);
        if (stamp) meta[monthKey] = stamp;
    });

    return { categoryBudget: out, categoryBudgetUpdatedAt: meta };
}

// ------------------------------------------
// appData 全体のマージ
// ------------------------------------------
// 返り値：{ merged, stats }
//   stats … { pulled, updated, keptLocal, same, conflicts, byType }
//           byType.expenses / byType.categories / byType.budget に内訳を持つ。
//           合計（フラットな値）は後方互換のためにも残してある。
function mergeAppData(local, remote) {
    const l = (local && typeof local === "object") ? local : {};
    const r = (remote && typeof remote === "object") ? remote : {};

    const expStats = newMergeStats();
    const catStats = newMergeStats();
    const budStats = newMergeStats();

    // 同じ名前のカテゴリが別IDで存在する場合は、手元のIDに寄せて重複を防ぐ
    const localCats = Array.isArray(l.categories) ? l.categories : [];
    const idRemap = {};
    const remoteCats = (Array.isArray(r.categories) ? r.categories : []).filter(cat => {
        if (!cat || cat.id === undefined || cat.id === null) return false;
        const same = localCats.find(lc => lc && String(lc.id) !== String(cat.id) && lc.name === cat.name);
        if (same) { idRemap[String(cat.id)] = same.id; return false; }
        return true;
    });
    const remoteExpenses = (Array.isArray(r.expenses) ? r.expenses : []).map(e => {
        if (e && idRemap[String(e.categoryId)] !== undefined) {
            return Object.assign({}, e, { categoryId: idRemap[String(e.categoryId)] });
        }
        return e;
    });

    const expenses = mergeCollection(l.expenses, remoteExpenses, expStats, "expenses");
    const categories = mergeCollection(l.categories, remoteCats, catStats, "categories");
    const budgetResult = mergeBudget(l.budget, r.budget, l.budgetUpdatedAt, r.budgetUpdatedAt, budStats);
    const categoryBudgetResult = mergeCategoryBudgets(
        l.categoryBudget, r.categoryBudget,
        l.categoryBudgetUpdatedAt, r.categoryBudgetUpdatedAt,
        idRemap
    );

    const merged = Object.assign({}, l, {
        schemaVersion: SCHEMA_VERSION,
        ownerId: l.ownerId || r.ownerId || null,
        budget: budgetResult.budget,
        budgetUpdatedAt: budgetResult.budgetUpdatedAt,
        categoryBudget: categoryBudgetResult.categoryBudget,
        categoryBudgetUpdatedAt: categoryBudgetResult.categoryBudgetUpdatedAt,
        categories: categories,
        expenses: expenses,
        plan: pickPlan(l.plan, r.plan)
    });

    const totals = newMergeStats();
    addMergeStats(totals, expStats);
    addMergeStats(totals, catStats);
    addMergeStats(totals, budStats);
    totals.byType = {
        expenses: expStats,
        categories: catStats,
        budget: budStats
    };

    return { merged, stats: totals };
}

function pickPlan(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return isNewer(b.updatedAt || b.createdAt, a.updatedAt || a.createdAt) ? b : a;
}

function unionList(a, b) {
    return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
}

// 部屋データ：基本は新しい方を採用するが、ガチャで手に入れたもの（ペット・部屋・名前）は
// どちらの端末で手に入れたものも消えないように足し合わせる。
function mergeRoomData(local, remote) {
    const l = local && typeof local === "object" ? local : null;
    const r = remote && typeof remote === "object" ? remote : null;
    if (!l && !r) return { merged: null, took: "none" };
    if (!l) return { merged: r, took: "remote" };
    if (!r) return { merged: l, took: "local" };

    const remoteWins = isNewer(r.updatedAt, l.updatedAt);
    const win = remoteWins ? r : l;
    const lose = remoteWins ? l : r;
    const merged = Object.assign({}, win, {
        ownedPets: unionList(win.ownedPets, lose.ownedPets),
        ownedMaps: unionList(win.ownedMaps, lose.ownedMaps),
        petNames: Object.assign({}, lose.petNames || {}, win.petNames || {}),
        gacha: { pulls: Math.max(Number(win.gacha && win.gacha.pulls) || 0, Number(lose.gacha && lose.gacha.pulls) || 0) }
    });
    return { merged, took: remoteWins ? "remote" : "local" };
}

// ------------------------------------------
// バックアップファイル（JSON）
// ------------------------------------------
function buildBackupObject(appData, roomData) {
    return {
        format: BACKUP_FORMAT,
        backupVersion: BACKUP_VERSION,
        schemaVersion: typeof SCHEMA_VERSION !== "undefined" ? SCHEMA_VERSION : null,
        exportedAt: new Date().toISOString(),
        data: appData,
        room: roomData
    };
}

function serializeBackup(appData, roomData) {
    return JSON.stringify(buildBackupObject(appData, roomData), null, 2);
}

function parseBackup(text) {
    if (!text || typeof text !== "string") {
        return { ok: false, error: "ファイルが空です。" };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { ok: false, error: "JSON として読み取れませんでした。バックアップファイルか確認してください。" };
    }
    if (!parsed || typeof parsed !== "object") {
        return { ok: false, error: "ファイルの中身が想定と違います。" };
    }
    if (parsed.format !== BACKUP_FORMAT) {
        return { ok: false, error: "このアプリのバックアップファイルではありません。" };
    }
    if (!parsed.data || typeof parsed.data !== "object") {
        return { ok: false, error: "家計データが含まれていません。" };
    }
    if (!Array.isArray(parsed.data.expenses)) {
        return { ok: false, error: "支出データの形式が不正です。" };
    }
    if (Number(parsed.backupVersion) > BACKUP_VERSION) {
        return { ok: false, error: "新しい形式のバックアップです。アプリを更新してください。" };
    }
    return {
        ok: true,
        data: parsed.data,
        room: (parsed.room && typeof parsed.room === "object") ? parsed.room : null,
        exportedAt: parsed.exportedAt || null
    };
}

// ------------------------------------------
// データコード（端末の引っ越し）
// ------------------------------------------
// バックアップ(JSON)を gzip → Base64 の1本の文字列にしたもの。
// コピーして新しい端末に貼り付けるだけで移せる。
//   YOYU1Z:... … gzip 圧縮あり
//   YOYU1P:... … 圧縮なし（CompressionStream が使えない環境）
function bytesToBase64(bytes) {
    let s = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(s);
}

function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function pipeBytes(bytes, transform) {
    const stream = new Blob([bytes]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodeTransferCode(appDataValue, roomDataValue) {
    const json = JSON.stringify(buildBackupObject(appDataValue, roomDataValue));
    const bytes = new TextEncoder().encode(json);
    if (typeof CompressionStream === "function") {
        try {
            const z = await pipeBytes(bytes, new CompressionStream("gzip"));
            return "YOYU1Z:" + bytesToBase64(z);
        } catch (e) { /* 圧縮なしへ */ }
    }
    return "YOYU1P:" + bytesToBase64(bytes);
}

async function decodeTransferCode(code) {
    const text = String(code || "").replace(/\s+/g, "");
    const m = text.match(/^YOYU1([ZP]):([A-Za-z0-9+\/=]+)$/);
    if (!m) {
        return { ok: false, error: "データコードの形式ではありません。「YOYU1」で始まるコードを全部貼り付けてください。" };
    }
    try {
        let bytes = base64ToBytes(m[2]);
        if (m[1] === "Z") {
            if (typeof DecompressionStream !== "function") {
                return { ok: false, error: "このブラウザは圧縮コードを読めません。新しいブラウザで試すか、バックアップファイルを使ってください。" };
            }
            bytes = await pipeBytes(bytes, new DecompressionStream("gzip"));
        }
        return parseBackup(new TextDecoder().decode(bytes));
    } catch (e) {
        return { ok: false, error: "コードが壊れています。コピー漏れ（途中で切れていないか）を確認してください。" };
    }
}
