// sw.js — オフラインでも開けるようにするための Service Worker
// ・アプリ本体（html / js / css / json）… ネット優先。つながらないときだけ保存済みを使う
//   → 更新を配ったとき、利用者に必ず新しい版が届く（古い版に居座らない）
// ・画像・フォント … 保存済み優先。無ければ取得して保存する
const CACHE = "yoyu-aru-v2.18";
const CORE = ["./", "./index.html", "./app.js", "./cloud.js", "./onboarding.js", "./gacha.js", "./style.css", "./manifest.json"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => Promise.all(CORE.map(url => cache.add(url).catch(() => {}))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

function isCacheable(res) {
    return res && (res.ok || res.type === "opaque");
}

function isAppShell(url, request) {
    if (url.origin !== self.location.origin) return false;
    if (request.mode === "navigate") return true;
    return /\.(html|js|css|json)$/i.test(url.pathname) || url.pathname.endsWith("/");
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (!/^https?:$/.test(url.protocol)) return;

    const sameOrigin = url.origin === self.location.origin;
    const isFont = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
    if (!sameOrigin && !isFont) return;          // それ以外（OCR の API など）は触らない

    if (isAppShell(url, request)) {
        event.respondWith(
            fetch(request)
                .then(res => {
                    if (isCacheable(res)) {
                        const copy = res.clone();
                        caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => caches.match(request).then(hit => hit || caches.match("./index.html")))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(hit => {
            if (hit) return hit;
            return fetch(request).then(res => {
                if (isCacheable(res)) {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
                }
                return res;
            });
        })
    );
});

