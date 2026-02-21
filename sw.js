// 更新したのに見た目が変わらない時は v2→v3 に増やす
const CACHE_NAME = "cardapp-cache-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./cards.json"
  // ※ manifest/icons は無くても動くので、addAll失敗を避けるためここには入れていません
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        // 再生した音声も含め、取れたものはキャッシュしていく
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      });
    }).catch(() => caches.match("./index.html"))
  );
});
