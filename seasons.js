/* ============================================================================
   seasons.js — 季節・行事に合わせた部屋の背景
   ----------------------------------------------------------------------------
   ・地域（日本 / 中国 / アメリカ / ヨーロッパ / オーストラリア）ごとに
     季節と行事を判定し、透明な SVG の背景を部屋の壁紙に重ねます。
   ・背景を重ねるだけで、ユーザーが選んだ部屋（マップ）はそのまま残ります。
   ========================================================================== */
(function () {
    "use strict";

    var KEY = "yoyu_aru_season";
    var REGIONS = [
        { id: "jp", label: "日本", tz: /^Asia\/Tokyo$/ },
        { id: "kr", label: "韓国", tz: /^Asia\/Seoul$/ },
        { id: "cn", label: "中国", tz: /^Asia\/(Shanghai|Chongqing|Harbin|Urumqi)/ },
        { id: "us", label: "アメリカ", tz: /^America\// },
        { id: "eu", label: "ヨーロッパ", tz: /^Europe\// },
        { id: "au", label: "オーストラリア（南半球）", tz: /^Australia\// }
    ];

    // Intl の中国暦が使えない環境むけの最終フォールバック。
    // 通常は下の computeLunarDates() が優先される。
    var LUNAR_FALLBACK = {
        2024: { cny: [2, 10], dragon: [6, 10], mid: [9, 17] },
        2025: { cny: [1, 29], dragon: [5, 31], mid: [10, 6] },
        2026: { cny: [2, 17], dragon: [6, 19], mid: [9, 25] },
        2027: { cny: [2, 6], dragon: [6, 9], mid: [9, 15] },
        2028: { cny: [1, 26], dragon: [5, 28], mid: [10, 3] },
        2029: { cny: [2, 13], dragon: [6, 16], mid: [9, 22] },
        2030: { cny: [2, 3], dragon: [6, 5], mid: [9, 12] },
        2031: { cny: [1, 23], dragon: [6, 24], mid: [10, 1] },
        2032: { cny: [2, 11], dragon: [6, 12], mid: [9, 19] },
        2033: { cny: [1, 31], dragon: [6, 1], mid: [9, 8] },
        2034: { cny: [2, 19], dragon: [6, 20], mid: [9, 27] },
        2035: { cny: [2, 8], dragon: [6, 10], mid: [9, 16] },
        2036: { cny: [1, 28], dragon: [5, 30], mid: [10, 4] }
    };

    var SEASON_LABEL = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
    var SEASON_BG = { spring: "spring", summer: "summer", autumn: "autumn", winter: "winter" };
    var EMOJI = {
        christmas: "🎄", christmas_summer: "🎄", newyear: "🎍", lunar_new_year: "🏮",
        sakura: "🌸", tanabata: "🎋", fireworks: "🎆", halloween: "🎃",
        thanksgiving: "🦃", valentines: "💝", midautumn: "🌕", easter: "🐣",
        tsuyu: "☔", spring: "🌷", summer: "🌻", autumn: "🍁", winter: "❄️"
    };

    function detectRegion() {
        var tz = "";
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* ignore */ }
        for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].tz.test(tz)) return REGIONS[i].id;
        var lang = String(navigator.language || "").toLowerCase();
        if (lang.indexOf("zh") === 0) return "cn";
        if (lang.indexOf("en") === 0) return "us";
        if (lang.indexOf("ja") === 0) return "jp";
        if (lang.indexOf("ko") === 0) return "kr";
        return "jp";
    }

    function loadConfig() {
        var cfg = { enabled: true, region: detectRegion() };
        try {
            var raw = JSON.parse(localStorage.getItem(KEY) || "null");
            if (raw && typeof raw === "object") {
                if (typeof raw.enabled === "boolean") cfg.enabled = raw.enabled;
                if (REGIONS.some(function (r) { return r.id === raw.region; })) cfg.region = raw.region;
            }
        } catch (e) { /* ignore */ }
        return cfg;
    }

    function debugEnabled() {
        try { return localStorage.getItem("yoyu_debug") === "1"; } catch (e) { return false; }
    }

    var config = loadConfig();
    var dateOverride = null;
    if (debugEnabled()) {
        try {
            var qs = new URLSearchParams(window.location.search);
            var q = qs.get("season_date");
            if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
                var parts = q.split("-");
                dateOverride = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            }
            var qRegion = qs.get("season_region");
            if (qRegion && REGIONS.some(function (r) { return r.id === qRegion; })) config.region = qRegion;
        } catch (e) { /* ignore */ }
    }

    function saveConfig() {
        try { localStorage.setItem(KEY, JSON.stringify(config)); } catch (e) { /* ignore */ }
    }

    function pad(n) { return String(n).padStart(2, "0"); }
    function md(d) { return (d.getMonth() + 1) * 100 + d.getDate(); }

    function inRange(d, sm, sd, em, ed) {
        var v = md(d), s = sm * 100 + sd, e = em * 100 + ed;
        if (s <= e) return v >= s && v <= e;
        return v >= s || v <= e;
    }

    function dateOf(year, pair) {
        return new Date(year, pair[0] - 1, pair[1]);
    }

    function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function withinDays(a, b, before, after) {
        var t = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
        var x = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
        var diff = Math.round((x - t) / 86400000);
        return diff >= -before && diff <= after;
    }

    function nthWeekday(year, month, weekday, n) {
        var d = new Date(year, month - 1, 1);
        var offset = (weekday - d.getDay() + 7) % 7;
        d.setDate(1 + offset + (n - 1) * 7);
        return d;
    }

    function easterDate(year) {
        var a = year % 19, b = Math.floor(year / 100), c = year % 100;
        var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
        var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
        var m = Math.floor((a + 11 * h + 22 * l) / 451);
        var month = Math.floor((h + l - 7 * m + 114) / 31);
        var day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }

    var lunarCache = {};
    var lunarFormatter = null;
    var lunarFormatterReady = false;
    var LUNAR_MONTHS = {
        "正月": 1, "一月": 1,
        "二月": 2, "三月": 3, "四月": 4, "五月": 5, "六月": 6,
        "七月": 7, "八月": 8, "九月": 9, "十月": 10,
        "冬月": 11, "十一月": 11, "臘月": 12, "十二月": 12
    };

    function getLunarFormatter() {
        if (lunarFormatterReady) return lunarFormatter;
        lunarFormatterReady = true;
        try {
            // 中国暦。月名は「正月」「八月」のような表記で返る。
            lunarFormatter = new Intl.DateTimeFormat("zh-u-ca-chinese", {
                month: "numeric",
                day: "numeric"
            });
        } catch (e) {
            lunarFormatter = null;
        }
        return lunarFormatter;
    }

    function lunarParts(date) {
        var fmt = getLunarFormatter();
        if (!fmt) return null;
        try {
            var parts = fmt.formatToParts(date);
            var month = null, day = null;
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].type === "month") month = parts[i].value;
                else if (parts[i].type === "day") day = parts[i].value;
            }
            if (!month || !day) return null;
            // 閏月は祝日判定に使わない
            if (month.indexOf("閏") === 0 || month.indexOf("闰") === 0) return null;
            var monthNumber = LUNAR_MONTHS[month];
            if (!monthNumber && /^\d+$/.test(month)) monthNumber = parseInt(month, 10);
            var dayNumber = /^\d+$/.test(day) ? parseInt(day, 10) : NaN;
            if (!monthNumber || !dayNumber) return null;
            return { month: monthNumber, day: dayNumber };
        } catch (e) {
            return null;
        }
    }

    function findLunarDate(year, month, day, startMonth, endMonth) {
        for (var m = startMonth; m <= endMonth; m++) {
            var days = new Date(year, m, 0).getDate();
            for (var d = 1; d <= days; d++) {
                // 正午で作る（DST の境界で日付がずれにくい）
                var date = new Date(year, m - 1, d, 12);
                var p = lunarParts(date);
                if (p && p.month === month && p.day === day) return date;
            }
        }
        return null;
    }

    function pairOf(date) {
        return date ? [date.getMonth() + 1, date.getDate()] : null;
    }

    function computeLunarDates(year) {
        var cny = findLunarDate(year, 1, 1, 1, 2);
        var dragon = findLunarDate(year, 5, 5, 5, 7);
        var mid = findLunarDate(year, 8, 15, 9, 10);
        if (!cny || !dragon || !mid) return null;
        return {
            cny: pairOf(cny),
            dragon: pairOf(dragon),
            mid: pairOf(mid)
        };
    }

    function seasonOf(d, region) {
        var m = d.getMonth() + 1;
        var south = region === "au";
        if (m >= 3 && m <= 5) return south ? "autumn" : "spring";
        if (m >= 6 && m <= 8) return south ? "winter" : "summer";
        if (m >= 9 && m <= 11) return south ? "spring" : "autumn";
        return south ? "summer" : "winter";
    }

    function lunarFor(year) {
        if (lunarCache[year]) return lunarCache[year];
        var computed = computeLunarDates(year);
        if (computed) {
            lunarCache[year] = computed;
            return computed;
        }
        // Intl の中国暦が使えない環境では、従来の表にフォールバックする。
        var fallback = LUNAR_FALLBACK[year] || null;
        if (fallback) lunarCache[year] = fallback;
        return fallback;
    }

    function eventsFor(d, region) {
        var y = d.getFullYear();
        var lunar = lunarFor(y);
        var easter = easterDate(y);
        var list = [];

        function add(id, label, bg, test) {
            if (test) list.push({ id: id, label: label, bg: bg });
        }

        // 年末年始（12/29〜1/3）。南半球は花火、日本はお正月の絵。
        add("newyear", "お正月", region === "jp" ? "newyear" : "fireworks",
            inRange(d, 12, 29, 1, 3));

        // クリスマス（12/1〜12/25）
        if (region === "au") {
            add("christmas", "南半球のクリスマス", "christmas_summer", inRange(d, 12, 1, 12, 25));
        } else {
            add("christmas", "クリスマス", "christmas", inRange(d, 12, 1, 12, 25));
        }

        // イースター（米・欧・豪）
        if (region === "us" || region === "eu" || region === "au") {
            add("easter", "イースター", "easter", withinDays(d, easter, 2, 1));
        }

        // オーストラリア・デー
        if (region === "au") add("australia_day", "オーストラリア・デー", "summer", inRange(d, 1, 24, 1, 26));

        if (region === "jp") {
            add("sakura", "桜", "sakura", inRange(d, 3, 20, 4, 10));
            add("goldenweek", "ゴールデンウィーク", "spring", inRange(d, 4, 29, 5, 5));
            add("tsuyu", "梅雨", "tsuyu", inRange(d, 6, 1, 6, 30));
            add("tanabata", "七夕", "tanabata", inRange(d, 7, 1, 7, 7));
            add("fireworks", "花火", "fireworks", inRange(d, 7, 20, 8, 31));
        }

        if (region === "us") {
            add("independence", "独立記念日", "fireworks", inRange(d, 7, 1, 7, 4));
            var thanks = nthWeekday(y, 11, 4, 4); // 11月の第4木曜
            add("thanksgiving", "感謝祭", "thanksgiving", withinDays(d, thanks, 0, 3));
        }

        // 中国の旧正月・端午・中秋を先に判定する。
        // バレンタイン（2/7〜2/14）と春節が重なる年は、春節を優先する。
        if (region === "cn") {
            if (lunar) {
                var cny = dateOf(y, lunar.cny);
                var lantern = new Date(cny); lantern.setDate(cny.getDate() + 14);
                add("lantern", "元宵節", "lunar_new_year", sameDay(d, lantern));
                add("lunar_new_year", "春節", "lunar_new_year", withinDays(d, cny, 1, 14));
                add("dragonboat", "端午の節句", "tsuyu", withinDays(d, dateOf(y, lunar.dragon), 1, 1));
                add("midautumn", "中秋節", "midautumn", withinDays(d, dateOf(y, lunar.mid), 1, 1));
            }
            add("qingming", "清明節", "spring", inRange(d, 4, 4, 4, 6));
            add("nationalday", "建国記念日", "fireworks", inRange(d, 9, 27, 10, 7));
        }

        // バレンタイン（中国の春節より後ろに置く）
        add("valentines", "バレンタイン", "valentines", inRange(d, 2, 7, 2, 14));

        // ハロウィン（どの地域でも商業的に親しまれている）
        add("halloween", "ハロウィン", "halloween", inRange(d, 10, 20, 10, 31));

        return list;
    }

    function getContext(date, region) {
        var d = date || dateOverride || new Date();
        var r = region || config.region;
        var events = eventsFor(d, r);
        if (events.length) {
            var ev = events[0];
            return { type: "event", id: ev.id, label: ev.label, bg: ev.bg, season: seasonOf(d, r), region: r, date: d };
        }
        var season = seasonOf(d, r);
        return { type: "season", id: season, label: SEASON_LABEL[season], bg: SEASON_BG[season], season: season, region: r, date: d };
    }

    function labelOf(ctx) {
        var text = ctx.label;
        try { if (window.I18N) text = I18N.t(text); } catch (e) { /* ignore */ }
        return text;
    }

    // 画面全体の色味（tint）と光（glow）、星・雪の粒（dot）
    var SCREEN = {
        christmas: {
            tint: "linear-gradient(180deg, rgba(170,205,240,.55), rgba(220,238,252,.18) 45%, rgba(255,250,240,0) 78%)",
            glow: "radial-gradient(circle at 82% 7%, rgba(255,226,160,.55), transparent 32%)",
            dot: "rgba(255,255,255,.55)"
        },
        christmas_summer: {
            tint: "linear-gradient(180deg, rgba(255,205,135,.38), rgba(255,232,190,.12) 45%, rgba(255,250,240,0) 78%)",
            glow: "radial-gradient(circle at 78% 8%, rgba(255,230,150,.62), transparent 30%)",
            dot: "rgba(255,255,255,.28)"
        },
        newyear: {
            tint: "linear-gradient(180deg, rgba(245,175,145,.34), rgba(255,235,220,.12) 45%, rgba(255,250,240,0) 78%)",
            glow: "radial-gradient(circle at 75% 9%, rgba(255,210,160,.58), transparent 34%)",
            dot: "rgba(255,255,255,.22)"
        },
        lunar_new_year: {
            tint: "linear-gradient(180deg, rgba(235,150,135,.44), rgba(255,220,210,.12) 45%, rgba(255,248,236,0) 78%)",
            glow: "radial-gradient(circle at 80% 9%, rgba(255,210,120,.55), transparent 34%)",
            dot: "rgba(255,224,160,.45)"
        },
        sakura: {
            tint: "linear-gradient(180deg, rgba(250,190,212,.40), rgba(255,236,244,.12) 45%, rgba(255,250,252,0) 78%)",
            glow: "radial-gradient(circle at 78% 8%, rgba(255,220,235,.55), transparent 34%)",
            dot: "rgba(255,255,255,.30)"
        },
        spring: {
            tint: "linear-gradient(180deg, rgba(250,200,218,.34), rgba(255,240,246,.10) 45%, rgba(255,250,252,0) 78%)",
            glow: "radial-gradient(circle at 78% 8%, rgba(255,225,235,.45), transparent 34%)",
            dot: "rgba(255,255,255,.24)"
        },
        summer: {
            tint: "linear-gradient(180deg, rgba(150,210,240,.38), rgba(225,245,255,.12) 45%, rgba(255,250,235,0) 78%)",
            glow: "radial-gradient(circle at 80% 7%, rgba(255,235,160,.62), transparent 32%)",
            dot: "rgba(255,255,255,.26)"
        },
        fireworks: {
            tint: "linear-gradient(180deg, rgba(165,185,230,.44), rgba(220,230,250,.14) 45%, rgba(255,247,235,0) 78%)",
            glow: "radial-gradient(circle at 75% 9%, rgba(255,190,150,.35), transparent 36%)",
            dot: "rgba(255,240,190,.55)"
        },
        autumn: {
            tint: "linear-gradient(180deg, rgba(240,185,120,.35), rgba(252,228,195,.12) 45%, rgba(255,250,240,0) 78%)",
            glow: "radial-gradient(circle at 80% 8%, rgba(255,215,140,.50), transparent 34%)",
            dot: "rgba(255,255,255,.20)"
        },
        winter: {
            tint: "linear-gradient(180deg, rgba(180,215,240,.42), rgba(232,247,255,.12) 45%, rgba(255,255,255,0) 78%)",
            glow: "radial-gradient(circle at 80% 8%, rgba(220,245,255,.55), transparent 34%)",
            dot: "rgba(255,255,255,.55)"
        },
        halloween: {
            tint: "linear-gradient(180deg, rgba(195,170,215,.40), rgba(230,215,240,.12) 45%, rgba(255,248,235,0) 78%)",
            glow: "radial-gradient(circle at 80% 8%, rgba(255,215,135,.50), transparent 34%)",
            dot: "rgba(255,220,150,.40)"
        },
        thanksgiving: {
            tint: "linear-gradient(180deg, rgba(240,180,115,.36), rgba(252,225,190,.12) 45%, rgba(255,250,240,0) 78%)",
            glow: "radial-gradient(circle at 80% 8%, rgba(255,220,150,.48), transparent 34%)",
            dot: "rgba(255,255,255,.20)"
        },
        valentines: {
            tint: "linear-gradient(180deg, rgba(250,185,205,.40), rgba(255,232,242,.12) 45%, rgba(255,250,252,0) 78%)",
            glow: "radial-gradient(circle at 80% 8%, rgba(255,205,225,.55), transparent 34%)",
            dot: "rgba(255,255,255,.26)"
        },
        midautumn: {
            tint: "linear-gradient(180deg, rgba(170,190,230,.44), rgba(225,232,248,.14) 45%, rgba(255,248,235,0) 78%)",
            glow: "radial-gradient(circle at 80% 8%, rgba(255,235,170,.55), transparent 34%)",
            dot: "rgba(255,240,190,.50)"
        },
        easter: {
            tint: "linear-gradient(180deg, rgba(165,215,240,.32), rgba(255,244,200,.12) 45%, rgba(255,250,240,0) 78%)",
            glow: "radial-gradient(circle at 80% 8%, rgba(255,235,175,.45), transparent 34%)",
            dot: "rgba(255,255,255,.28)"
        },
        tsuyu: {
            tint: "linear-gradient(180deg, rgba(165,190,210,.38), rgba(228,240,248,.12) 45%, rgba(255,255,255,0) 78%)",
            glow: "radial-gradient(circle at 80% 8%, rgba(220,240,255,.45), transparent 34%)",
            dot: "rgba(255,255,255,.20)"
        }
    };

    function screenPalette(ctx) {
        return SCREEN[ctx.bg] || SCREEN[ctx.season] || SCREEN.autumn;
    }

    function applyScreen() {
        var box = document.getElementById("season-backdrop");
        if (!box) return;
        if (!config.enabled) {
            box.hidden = true;
            return;
        }
        var ctx = getContext();
        var p = screenPalette(ctx);
        box.hidden = false;
        var scene = document.getElementById("season-backdrop-scene");
        if (scene) scene.style.setProperty("--season-scene", 'url("assets/seasons/' + ctx.bg + '.svg")');
        box.style.setProperty("--season-tint", p.tint);
        box.style.setProperty("--season-glow", p.glow);
        box.style.setProperty("--season-dots", "radial-gradient(" + p.dot + " 1.2px, transparent 1.4px)");
    }

    function updateBadge() {
        var badge = document.getElementById("season-badge");
        if (!badge) return;
        if (!config.enabled) {
            badge.hidden = true;
            badge.textContent = "";
            return;
        }
        var ctx = getContext();
        badge.hidden = false;
        badge.textContent = (EMOJI[ctx.bg] || "🍃") + " " + labelOf(ctx);
        badge.title = labelOf(ctx);
    }

    function updatePreview() {
        var box = document.getElementById("season-preview");
        if (!box) return;
        var ctx = getContext();
        if (config.enabled) {
            var p = screenPalette(ctx);
            box.style.backgroundImage = 'url("assets/seasons/' + ctx.bg + '.svg"), ' + p.glow + ", " + p.tint;
            box.setAttribute("data-empty", "false");
        } else {
            box.style.backgroundImage = "none";
            box.setAttribute("data-empty", "true");
        }
        var label = document.getElementById("season-current-label");
        if (label) label.textContent = config.enabled ? labelOf(ctx) : (window.I18N ? I18N.t("背景なし") : "背景なし");
        var sub = document.getElementById("season-current-sub");
        if (sub) {
            if (config.enabled) {
                var regionLabel = "";
                REGIONS.forEach(function (r) { if (r.id === config.region) regionLabel = r.label; });
                var seasonText = window.I18N ? window.I18N.t(SEASON_LABEL[ctx.season]) : SEASON_LABEL[ctx.season];
                sub.textContent = (window.I18N ? window.I18N.t(regionLabel) : regionLabel) + " · " + seasonText;
            } else {
                sub.textContent = "";
            }
        }
    }

    function renderModal() {
        var auto = document.getElementById("season-auto");
        if (auto) auto.checked = !!config.enabled;
        var select = document.getElementById("season-region");
        if (select && select.value !== config.region) select.value = config.region;
        updatePreview();
        var note = document.getElementById("season-disabled-note");
        if (note) note.hidden = !!config.enabled;
    }

    function refresh() {
        applyScreen();
        updateBadge();
        updatePreview();
    }

    function openModal() {
        var menu = document.getElementById("modal-menu");
        if (menu) menu.classList.remove("open");
        renderModal();
        var modal = document.getElementById("modal-season");
        if (modal) modal.classList.add("open");
    }

    window.SeasonalBackground = {
        applyScreen: applyScreen,
        getContext: getContext,
        refresh: refresh,
        open: openModal,
        get config() { return { enabled: config.enabled, region: config.region }; }
    };

    function boot() {
        // 部屋のタイトル横のバッジ
        var titleBar = document.querySelector(".room-section-title");
        var badge = document.getElementById("season-badge");
        if (!badge && titleBar) {
            badge = document.createElement("button");
            badge.type = "button";
            badge.id = "season-badge";
            badge.className = "season-badge";
            badge.setAttribute("data-i18n-skip", "1");
            badge.addEventListener("click", openModal);
            titleBar.insertBefore(badge, titleBar.querySelector(".room-edit-btn"));
        }

        var auto = document.getElementById("season-auto");
        if (auto) auto.addEventListener("change", function () {
            config.enabled = !!auto.checked;
            saveConfig();
            refresh();
            renderModal();
        });

        var select = document.getElementById("season-region");
        if (select) {
            REGIONS.forEach(function (r) {
                if (!select.querySelector('option[value="' + r.id + '"]')) {
                    var opt = document.createElement("option");
                    opt.value = r.id;
                    opt.textContent = r.label;
                    select.appendChild(opt);
                }
            });
            select.value = config.region;
            select.addEventListener("change", function () {
                config.region = select.value;
                saveConfig();
                refresh();
                renderModal();
                try {
                    window.dispatchEvent(new CustomEvent("yoyu:seasonchange", {
                        detail: { region: config.region, enabled: config.enabled }
                    }));
                } catch (e) { /* ignore */ }
            });
        }

        var openBtn = document.getElementById("btn-open-season");
        if (openBtn) openBtn.addEventListener("click", openModal);
        var closeBtn = document.getElementById("btn-close-season");
        if (closeBtn) closeBtn.addEventListener("click", function () {
            var modal = document.getElementById("modal-season");
            if (modal) modal.classList.remove("open");
        });

        window.addEventListener("yoyu:languagechange", function () {
            updateBadge();
            updatePreview();
        });

        applyScreen();
        updateBadge();
        updatePreview();
        // app.js の初期化後に、季節背景を必ず一度適用する
        setTimeout(refresh, 0);
        setTimeout(refresh, 500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
