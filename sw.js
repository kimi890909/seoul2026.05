/* ════════════════════════════════════════════════════════════════════
   🗂 sw.js  —  Service Worker（離線管家）
   ▶ 版本：v15 (配合 2026 首爾手冊更新)
   ▶ 功能：處理離線存取、圖片快取、並排除雲端同步 API
   ════════════════════════════════════════════════════════════════════ */

// ⭐ 每次修改 index.html 或新增照片後，都要將此版本號 +1
const CACHE_VERSION = 'seoul-2026-v15';

// 第一次安裝時就要存的核心檔案
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // Google Fonts 字體資源
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap'
];

/* ── 1. 安裝階段：將核心資源寫入快取 ── */
self.addEventListener('install', event => {
  console.log('[SW] 正在安裝新版本:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // 逐一快取檔案，即使單一檔案失敗（如字體網址變動）也不會中斷安裝
      return Promise.all(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] 無法下載快取資源:', url, err))
        )
      );
    }).then(() => self.skipWaiting()) // 強制跳過等待，立即進入啟動階段
  );
});

/* ── 2. 啟用階段：清理舊版本的快取檔案 ── */
self.addEventListener('activate', event => {
  console.log('[SW] 正在啟用新版本...', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => {
          console.log('[SW] 刪除過期舊快取:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim()) // 讓 Service Worker 立即接管頁面
  );
});

/* ── 3. 攔截網路請求 ── */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 規則 A：只處理 GET 請求
  if (req.method !== 'GET') return;

  // 規則 B：🚫 不快取 Google Apps Script 同步 API (確保筆記即時性)
  if (url.href.includes('script.google.com')) return;

  // 規則 C：🚫 忽略 Chrome 瀏覽器外掛產生的請求
  if (url.protocol === 'chrome-extension:') return;

  const isOwnFile = url.origin === location.origin;
  const isImage = req.destination === 'image' ||
                  /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname);

  // 策略：對於自家檔案與圖片，使用「快取優先 + 背景更新」
  if (isOwnFile || isImage) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) {
          // 💡 已經有快取：先給使用者看快取的內容，同時偷偷去網路抓新的
          fetch(req).then(fresh => {
            if (fresh && fresh.ok) {
              caches.open(CACHE_VERSION).then(c => c.put(req, fresh));
            }
          }).catch(() => {}); // 如果沒網路，背景更新失敗也不影響使用者
          return cached;
        }

        // 💡 沒快取：去網路抓，抓到後存入快取備用
        return fetch(req).then(fresh => {
          if (fresh && fresh.ok) {
            const clone = fresh.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, clone));
          }
          return fresh;
        }).catch(() => {
          // 💡 完全斷網且沒快取的情況：
          if (req.destination === 'document') {
            return caches.match('./index.html'); // 回傳主頁面
          }
          if (isImage) {
            return new Response('', { status: 200 }); // 回傳空圖片避免報錯
          }
        });
      })
    );
    return;
  }

  // 規則 D：外部資源（如字體 CSS）：網路優先，失敗才用快取
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

/* ── 4. 訊息接收（供主程式 index.html 呼叫控制） ── */
self.addEventListener('message', event => {
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    console.log('[SW] 快取已手動清除');
  }
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});