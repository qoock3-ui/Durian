/*
 * FinTrack service worker — 刻意保守。
 *
 * 唯一目的是讓 App 能安裝到主畫面,並在離線時還能開得起來。
 * 因此:
 *  - 導覽與 /api 一律走網路優先,新版部署後不會被舊快取黏住
 *    (與 public/_headers 的 no-cache 策略一致)
 *  - 只有帶內容雜湊的 /assets/* 走快取優先,那些檔名變了就是新檔
 */
const CACHE = "fintrack-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add("/")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API 一律走網路,絕不快取(金額必須是最新的)
  if (url.pathname.startsWith("/api/")) return;

  // 雜湊過的靜態資源:快取優先
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 其餘(含 SPA 導覽):網路優先,離線才退回快取
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && request.mode === "navigate") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match("/"))),
  );
});
