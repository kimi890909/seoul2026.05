/* ════════════════════════════════════════════════════════════════════
   🗂 sw.js  —  Service Worker（離線管家）
   ════════════════════════════════════════════════════════════════════
   ▶ 這個檔案像「倉庫管理員」：
     1. 第一次開網頁時，把所有檔案存到手機快取
     2. 之後再開時，從快取拿出來（超快、不用網路）
     3. 有更新版本時，自動換新的給你
   
   ▶ 改了 HTML 後想強制更新？
     把下面的 CACHE_VERSION 改成 'v2', 'v3'... 即可
     使用者下次開網頁時會自動拿到新版本
   ════════════════════════════════════════════════════════════════════ */

// ⭐ 改檔案後要更新版本號（v1 → v2 → v3）
const CACHE_VERSION = 'seoul-2026-v9';

// 第一次安裝時就要存的「核心檔案」
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // Google Fonts（字體）
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap'
];

/* ── 安裝階段：把核心檔案存起來 ── */
self.addEventListener('install', event => {
  console.log('[SW] 安裝中...', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // 用 addAll；某個失敗不影響其他（用 catch 包起來）
      return Promise.all(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] 無法快取:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── 啟用階段：把舊版快取清掉 ── */
self.addEventListener('activate', event => {
  console.log('[SW] 啟用中...', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => {
          console.log('[SW] 刪除舊快取:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── 攔截網路請求：先看快取，沒有再去網路抓 ── */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 只處理 GET 請求
  if (req.method !== 'GET') return;

  // 🚫 不快取雲端同步 API（要即時讀取）
  if (url.href.includes('script.google.com')) {
    return; // 直接走網路
  }

  // 🚫 不快取 Chrome extensions
  if (url.protocol === 'chrome-extension:') return;

  /* 快取策略：
     - 自家檔案（index.html、manifest）→ 「快取優先」（離線也能開）
     - 圖片（外部 CDN） → 「快取優先 + 背景更新」（離線顯示舊圖、有網路時更新）
     - 其他外部資源 → 「網路優先 + 失敗用快取」 */

  const isOwnFile = url.origin === location.origin;
  const isImage = req.destination === 'image' ||
                  /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname);

  if (isOwnFile || isImage) {
    // 快取優先策略
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) {
          // 背景靜默更新（不影響使用者體驗）
          fetch(req).then(fresh => {
            if (fresh && fresh.ok) {
              caches.open(CACHE_VERSION).then(c => c.put(req, fresh));
            }
          }).catch(() => {});
          return cached;
        }
        // 沒在快取裡 → 去網路抓 → 抓到後存起來
        return fetch(req).then(fresh => {
          if (fresh && fresh.ok) {
            const clone = fresh.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, clone));
          }
          return fresh;
        }).catch(() => {
          // 網路也失敗（離線狀態）→ 給個離線提示
          if (req.destination === 'document') {
            return caches.match('./index.html');
          }
          // 圖片載入失敗時，回傳一個小小的透明圖
          if (isImage) {
            return new Response('', { status: 200 });
          }
        });
      })
    );
    return;
  }

  // 其他資源（如字體 CSS）：網路優先，失敗用快取
  event.respondWith(
    fetch(req).then(fresh => {
      if (fresh && fresh.ok) {
        const clone = fresh.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, clone));
      }
      return fresh;
    }).catch(() => caches.match(req))
  );
});

/* ── 接收主程式傳來的訊息（用來手動清快取等） ── */
self.addEventListener('message', event => {
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
