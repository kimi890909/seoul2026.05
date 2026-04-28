/* ════════════════════════════════════════════════════════════════════
   ⚙️ <<API_URL>> 雲端同步設定（GAS 部署網址）
   ════════════════════════════════════════════════════════════════════
   ⚠️ 這是最重要的設定！沒有它就無法同步雲端
   
   ▶ 怎麼取得這個網址？
     1. 打開 https://script.google.com
     2. 開啟你的「首爾散心」專案
     3. 右上角「部署」→「管理部署作業」
     4. 點 ✏️ 鉛筆 → 版本選「新版本」→「部署」
     5. 跳出網址 → 點「複製」
   
   ▶ 怎麼換？
     把下面引號 '...' 裡面整串網址換掉
     例：const API_URL = 'https://script.google.com/macros/s/XXX/exec';
   
   ▶ 重要提醒：
     - 引號 ' ' 不能拿掉
     - 結尾分號 ; 不能拿掉
     - 網址結尾要有 /exec
   
   ▶ 萬一想關掉雲端功能？
     改成：const API_URL = '請在這裡貼上你的_GAS_網頁應用程式網址';
     系統會自動偵測並停用雲端功能（但資料就不會同步了）
   
   🆕 v4 補充：行前清單下方新增的「連結 + 圖片」也會一起同步
     - 整包以 JSON 格式存入 prep 欄位
     - 不需要額外修改 GAS 程式碼，只要 GAS 接受任意 data 物件就會自動存
     - 重整網頁時會自動還原（不會跟硬編碼的連結重複）
   ════════════════════════════════════════════════════════════════════ */
const API_URL = 'https://script.google.com/macros/s/AKfycbwM-gjdtxHVaqfcpiEfah23LrXFIS_CIc6yWwuvCqFL6FKgyjAie_3tsnS0n_Jl9DNaLQ/exec';

function isApiReady(){return API_URL && !API_URL.includes('請在這裡貼上');}

let syncTimer = null;
function debouncedSync(key, data, delay){
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=>syncToCloud(key,data), delay||800);
}

async function syncToCloud(key, data){
  if(!isApiReady()) return;
  try{
    await fetch(API_URL, {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({action:'save', key:key, data:data})
    });
    showToast('✅ 已同步到雲端');
  }catch(err){console.warn('同步失敗',err);}
}

async function loadAllFromCloud(){
  if(!isApiReady()) return;
  try{
    const r = await fetch(API_URL+'?action=loadAll', {method:'GET'});
    const d = await r.json();
    // 🆕 v6 多人版：個人 prep 資料分人載入
    if(currentUser && d['prep_'+currentUser]) applyPrep(d['prep_'+currentUser]);
    // 對方資料記下來，用來顯示「對方好了沒」
    const partner = getPartner();
    if(partner && d['prep_'+partner]) {
      partnerData = d['prep_'+partner];
      renderPartnerStatus();
    }
    // 共用的 extras（連結 + 圖片）
    if(d.prep_extras) applyExtras(d.prep_extras);
    // v14：景點筆記
    if(d.spot_notes) applySpotNotes(d.spot_notes);
    // 🔄 向下相容：若雲端有舊版的 prep 資料（v4-v5），先當「信宏的個人資料」載入一次
    //    這樣升級到 v6 不會丟失之前的勾選紀錄
    if(d.prep && currentUser === 'xinhong' && !d.prep_xinhong){
      applyPrep(d.prep);
      applyExtras(d.prep);
      showToast('🔄 已將舊資料轉移到信宏帳號');
    }
    if(d.budget) applyBudget(d.budget);
    if(d.photos) applyPhotos(d.photos);
    // 注意：notes 不從雲端載入，改用本機 localStorage
    showToast('✅ 已載入雲端資料');
  }catch(err){console.warn('載入失敗',err);}
}

/* v15：手動同步按鈕 ─ 給對方手動撈取最新雲端資料 */
async function manualSync(){
  if(!isApiReady()){
    showToast('⚠️ 雲端 API 未設定');
    return;
  }
  const btn = document.getElementById('cloud-sync-btn');
  if(btn){
    btn.disabled = true;
    btn.textContent = '⏳ 同步中...';
  }
  try{
    await loadAllFromCloud();
    showToast('✅ 已撈取對方最新資料');
  }catch(err){
    showToast('⚠️ 同步失敗，請檢查網路');
  }finally{
    if(btn){
      btn.disabled = false;
      btn.textContent = '🔄 同步';
    }
  }
}

function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

/* ════════════════════════════════════════════════════════════════════
   📑 分頁切換
   ════════════════════════════════════════════════════════════════════ */
function switchTab(name, btn){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  btn.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ════════════════════════════════════════════════════════════════════
   ⭐ 路線雙 Tab + 三交通切換（新版景點卡的核心功能）
   ════════════════════════════════════════════════════════════════════ */
function switchRoute(btn, contentId){
  // 找到當前所在的景點卡，避免影響其他景點
  const card = btn.closest('.spot-card');
  card.querySelectorAll(':scope > .spot-body > .route-tabs > .route-tab').forEach(b=>b.classList.remove('active'));
  card.querySelectorAll(':scope > .spot-body > .route-content').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(contentId).classList.add('active');
}

function switchMode(btn, contentId){
  // 找到當前 route-content 區塊
  const wrap = btn.closest('.route-content');
  wrap.querySelectorAll('.tm-btn').forEach(b=>b.classList.remove('active'));
  wrap.querySelectorAll('.tm-content').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(contentId).classList.add('active');
}

/* ════════════════════════════════════════════════════════════════════
   ✏️ 編輯模式
   ════════════════════════════════════════════════════════════════════ */
function toggleEdit(){
  const body = document.body, btn = document.getElementById('edit-toggle'), hint = document.getElementById('edit-hint');
  const editing = body.classList.toggle('editing');
  document.querySelectorAll('[contenteditable]').forEach(el=>el.setAttribute('contenteditable', editing?'true':'false'));
  if(editing){btn.classList.add('on'); btn.textContent='✓ 完成編輯'; hint.classList.add('show');}
  else{btn.classList.remove('on'); btn.textContent='✏️ 編輯模式'; hint.classList.remove('show');}
}

/* ════════════════════════════════════════════════════════════════════
   👥 v6 多人版：信宏 / 小賢 切換 + 對方狀態
   ════════════════════════════════════════════════════════════════════
   ▶ 行前清單和記帳是「分人儲存」
   ▶ currentUser 記錄目前看的是誰
   ▶ partnerData 暫存對方的勾選資料，用來顯示「對方好了沒」
   ────────────────────────────────────────────────────────────────────
   雲端資料結構：
     prep_xinhong  → 信宏的行前清單
     prep_xiaoxian → 小賢的行前清單
     prep          → 共用的「+ 連結 / + 圖片」（v4 留下的，繼續用）
   ════════════════════════════════════════════════════════════════════ */
const USERS = {
  xinhong: {key:'xinhong', emoji:'👨', name:'信宏'},
  xiaoxian: {key:'xiaoxian', emoji:'🧑', name:'小賢'}
};
let currentUser = null;          // 目前是誰
let partnerData = null;          // 對方的清單資料（用來顯示狀態）

/* 取得「對方」是誰 */
function getPartner(){
  if(!currentUser) return null;
  return currentUser === 'xinhong' ? 'xiaoxian' : 'xinhong';
}

/* 使用者第一次選身分 */
function setCurrentUser(userKey){
  if(!USERS[userKey]) return;
  currentUser = userKey;
  localStorage.setItem('seoul_current_user', userKey);
  document.getElementById('user-pick-modal').classList.remove('show');
  updateUserSwitcherUI();
  // 從雲端載入這個人的資料
  if(isApiReady()) loadUserData();
}

/* 切換使用者（按鈕點擊） */
function switchUser(userKey){
  if(!USERS[userKey] || userKey === currentUser) return;
  // 切換前先把目前的勾選狀態存起來（避免漏存）
  if(currentUser){
    savePrepCurrentUser();
  }
  currentUser = userKey;
  localStorage.setItem('seoul_current_user', userKey);
  updateUserSwitcherUI();
  // 清空目前的勾選狀態 → 重新從雲端載入新使用者的資料
  resetPrepUI();
  if(isApiReady()) loadUserData();
  showToast(`👥 切換為 ${USERS[userKey].emoji} ${USERS[userKey].name}`);
}

/* 更新切換器 UI（哪個按鈕亮起來） */
function updateUserSwitcherUI(){
  const btnX = document.getElementById('user-btn-xinhong');
  const btnY = document.getElementById('user-btn-xiaoxian');
  if(!btnX || !btnY) return;
  btnX.classList.toggle('active', currentUser === 'xinhong');
  btnY.classList.toggle('active', currentUser === 'xiaoxian');
}

/* 把行前清單的勾選狀態全部清空（切換使用者用） */
function resetPrepUI(){
  document.querySelectorAll('#panel-prep .check-item').forEach(item=>{
    item.classList.remove('done');
    const noteEl = item.querySelector('.chk-note');
    const valEl = item.querySelector('.chk-val');
    // 把備註恢復成 HTML 裡寫死的預設值（從 dataset 還原）
    if(noteEl){
      const def = noteEl.dataset.default;
      if(def !== undefined) noteEl.textContent = def;
    }
    if(valEl) valEl.textContent = '';
    // 移除「對方狀態」標籤
    const ps = item.querySelector('.partner-status');
    if(ps) ps.remove();
  });
  updateProgress();
}

/* 從雲端讀取目前使用者的勾選狀態 + 對方的（顯示用） */
async function loadUserData(){
  if(!isApiReady() || !currentUser) return;
  try{
    // 讀我自己的
    const myKey = 'prep_' + currentUser;
    const myRes = await fetch(API_URL + '?action=load&key=' + myKey, {method:'GET'});
    const myData = await myRes.json();
    if(myData && myData.data) applyPrep(myData.data);

    // 讀對方的（用來顯示狀態）
    const partnerKey = 'prep_' + getPartner();
    const pRes = await fetch(API_URL + '?action=load&key=' + partnerKey, {method:'GET'});
    const pData = await pRes.json();
    partnerData = (pData && pData.data) ? pData.data : null;
    renderPartnerStatus();
  }catch(err){
    console.warn('[v6] 載入使用者資料失敗', err);
  }
}

/* 渲染「對方好了沒」的小標籤 */
function renderPartnerStatus(){
  // 清掉舊的
  document.querySelectorAll('#panel-prep .partner-status').forEach(el=>el.remove());
  if(!partnerData || !Array.isArray(partnerData)) return;
  // 把對方資料攤平
  const pFlat = [];
  partnerData.forEach(g => (g.items||[]).forEach(it => pFlat.push(it)));
  // 對應到目前畫面上的每個項目
  let i = 0;
  const partnerName = USERS[getPartner()].name;
  document.querySelectorAll('#panel-prep .check-item').forEach(item => {
    const it = pFlat[i++];
    if(!it) return;
    const right = item.querySelector('.chk-right');
    if(!right) return;
    const span = document.createElement('span');
    span.className = 'partner-status ' + (it.done ? 'done' : 'notyet');
    span.textContent = it.done ? `✓ ${partnerName}好了` : `${partnerName}還沒`;
    right.insertBefore(span, right.firstChild);
  });
}

/* 存目前使用者的勾選狀態到雲端（包了 user key） */
function savePrepCurrentUser(){
  if(!currentUser) return;
  const data = collectPrepData();
  debouncedSync('prep_' + currentUser, data);
}

/* 把目前畫面上的勾選資料蒐集起來（純資料，不含 extras） */
function collectPrepData(){
  const data = [];
  document.querySelectorAll('#panel-prep .check-list-card').forEach(card=>{
    const hd = card.querySelector('.check-list-hd');
    if(!hd) return;
    const group = {hd: hd.firstChild ? hd.firstChild.textContent.trim() : '', items:[]};
    card.querySelectorAll('.check-item').forEach(item=>{
      const nameEl = item.querySelector('.chk-name');
      const noteEl = item.querySelector('.chk-note');
      const valEl = item.querySelector('.chk-val');
      group.items.push({
        name: nameEl ? nameEl.textContent : '',
        note: noteEl ? noteEl.textContent : '',
        val: valEl ? valEl.textContent : '',
        done: item.classList.contains('done')
      });
    });
    data.push(group);
  });
  return data;
}

/* 初始化：從 localStorage 讀現任使用者，沒有的話跳出選人彈窗 */
function initUser(){
  // 把所有 chk-note 的初始值記到 dataset，切換使用者時可以還原
  document.querySelectorAll('#panel-prep .chk-note').forEach(el=>{
    el.dataset.default = el.textContent;
  });
  const saved = localStorage.getItem('seoul_current_user');
  if(saved && USERS[saved]){
    currentUser = saved;
    updateUserSwitcherUI();
  } else {
    // 第一次使用，跳出選人視窗
    document.getElementById('user-pick-modal').classList.add('show');
  }
}

/* ════════════════════════════════════════════════════════════════════
   📋 行前準備清單
   ════════════════════════════════════════════════════════════════════ */
function toggleCheck(item){
  item.classList.toggle('done');
  updateProgress();
  savePrep();
  // 🆕 切換後，重新渲染對方狀態（避免操作時消失）
  // 不需動 partnerData，只是把標籤掛回去
  if(partnerData) renderPartnerStatus();
}

function addItem(btn){
  const card = btn.parentElement;
  const div = document.createElement('div');
  div.className = 'check-item';
  div.onclick = function(){toggleCheck(this);};
  // 🆕 新增的項目自動帶上 extras 容器和「+ 連結 / + 圖片」按鈕，
  //    這樣所有清單組（不只證件、金錢、網路 APP）也都能用同樣的功能
  div.innerHTML = `<div class="chk-circle"><span class="chk-tick">✓</span></div>
    <div class="chk-body"><span class="chk-name" contenteditable="true">新項目</span>
    <span class="chk-note" contenteditable="true" onclick="event.stopPropagation()"></span>
    <div class="extras" data-extras></div>
    <div class="extra-add-row">
      <button class="extra-add-btn" onclick="event.stopPropagation();openAddLink(this)">+ 連結</button>
      <button class="extra-add-btn" onclick="event.stopPropagation();openAddImage(this)">+ 圖片</button>
    </div></div>
    <div class="chk-right">
    <button class="chk-del" onclick="event.stopPropagation();delItem(this)">×</button></div>`;
  card.insertBefore(div, btn);
  updateProgress();
  savePrep();
}

function delItem(btn){
  btn.closest('.check-item').remove();
  updateProgress();
  savePrep();
}

function updateProgress(){
  const items = document.querySelectorAll('#panel-prep .check-item');
  const done = document.querySelectorAll('#panel-prep .check-item.done').length;
  const total = items.length;
  const pct = total ? Math.round((done/total)*100) : 0;
  document.getElementById('prog-count').textContent = `${done} / ${total} 項完成`;
  document.getElementById('prog-bar').style.width = pct+'%';
}

function savePrep(){
  // 🆕 v6 多人版：勾選狀態 + 備註 → 各自獨立 (prep_xinhong / prep_xiaoxian)
  //    extras（+ 連結/+ 圖片）→ 大家共用 (prep_extras)
  const personalData = collectPrepData();   // 勾選/備註/數值
  const extrasData = [];                    // 共用的連結 + 圖片

  document.querySelectorAll('#panel-prep .check-list-card').forEach(card=>{
    const hd = card.querySelector('.check-list-hd');
    if(!hd) return;
    const group = {hd: hd.firstChild ? hd.firstChild.textContent.trim() : '', items:[]};
    card.querySelectorAll('.check-item').forEach(item=>{
      const extras = {links:[], images:[]};
      const extrasBox = item.querySelector('[data-extras]');
      if(extrasBox){
        extrasBox.querySelectorAll('a.extra-link').forEach(a=>{
          const txt = a.childNodes[0] ? a.childNodes[0].textContent.trim() : a.textContent.replace('×','').trim();
          extras.links.push({text: txt, href: a.getAttribute('href')||''});
        });
        extrasBox.querySelectorAll('img').forEach(img=>{
          extras.images.push(img.getAttribute('src')||'');
        });
      }
      group.items.push({extras: extras});
    });
    extrasData.push(group);
  });

  // 個人資料：依目前是誰存入對應的 key
  if(currentUser){
    debouncedSync('prep_' + currentUser, personalData);
  }
  // 共用 extras
  debouncedSync('prep_extras', extrasData, 1200);
}

function applyPrep(data){
  // 🆕 v6：只還原「個人」資料（勾選/備註/數值），extras 由 applyExtras 處理
  if(!Array.isArray(data)) return;
  let i = 0;
  document.querySelectorAll('#panel-prep .check-item').forEach(item=>{
    let flat = []; data.forEach(g=>g.items.forEach(it=>flat.push(it)));
    const it = flat[i++]; if(!it) return;
    if(it.done) item.classList.add('done');
    const noteEl = item.querySelector('.chk-note');
    const valEl = item.querySelector('.chk-val');
    if(noteEl && it.note!==undefined) noteEl.textContent = it.note;
    if(valEl && it.val!==undefined) valEl.textContent = it.val;
  });
  updateProgress();
}

/* 🆕 v6：套用「共用的 extras（連結 + 圖片）」 */
function applyExtras(data){
  if(!Array.isArray(data)) return;
  let i = 0;
  document.querySelectorAll('#panel-prep .check-item').forEach(item=>{
    let flat = []; data.forEach(g=>g.items.forEach(it=>flat.push(it)));
    const it = flat[i++]; if(!it || !it.extras) return;
    const extrasBox = item.querySelector('[data-extras]');
    if(!extrasBox) return;
    // 比對既有的，避免重複加入硬編碼的連結
    const existingHrefs = Array.from(extrasBox.querySelectorAll('a.extra-link')).map(a=>a.getAttribute('href'));
    const existingSrcs = Array.from(extrasBox.querySelectorAll('img')).map(img=>img.getAttribute('src'));
    (it.extras.links||[]).forEach(lk=>{
      if(!lk||!lk.href) return;
      if(existingHrefs.indexOf(lk.href) >= 0) return;
      addExtraLinkToBox(extrasBox, lk.text||'連結', lk.href);
    });
    (it.extras.images||[]).forEach(src=>{
      if(!src) return;
      if(existingSrcs.indexOf(src) >= 0) return;
      addExtraImageToBox(extrasBox, src);
    });
  });
}

/* 監聽編輯（span contenteditable 的 input 事件） */
document.addEventListener('input', e=>{
  if(e.target.matches('#panel-prep .chk-note, #panel-prep .chk-val, #panel-prep .chk-name')) savePrep();
});


/* ════════════════════════════════════════════════════════════════════
   📌 v14 景點/交通筆記同步（用 spotId 當 key，存 spot_notes 雲端）
   ──────────────────────────────────────────────────────────────────
   ▶ 每個 .note-host 必須有 data-spot-id 屬性（識別該筆記）
   ▶ 兩個人共用（旅伴一起記筆記、貼連結、貼照片）
   ════════════════════════════════════════════════════════════════════ */
function saveSpotNotes(){
  const data = {};
  document.querySelectorAll('.note-host[data-spot-id]').forEach(host=>{
    const id = host.dataset.spotId;
    const extras = {links:[], images:[]};
    const box = host.querySelector('[data-extras]');
    if(box){
      box.querySelectorAll('a.extra-link').forEach(a=>{
        const txt = a.childNodes[0] ? a.childNodes[0].textContent.trim() : a.textContent.replace('×','').trim();
        extras.links.push({text: txt, href: a.getAttribute('href')||''});
      });
      box.querySelectorAll('img').forEach(img=>{
        extras.images.push(img.getAttribute('src')||'');
      });
    }
    if(extras.links.length || extras.images.length){
      data[id] = extras;
    }
  });
  debouncedSync('spot_notes', data, 1200);
}

function applySpotNotes(data){
  if(!data || typeof data !== 'object') return;
  document.querySelectorAll('.note-host[data-spot-id]').forEach(host=>{
    const id = host.dataset.spotId;
    const it = data[id];
    if(!it) return;
    let extrasBox = host.querySelector('[data-extras]');
    if(!extrasBox){
      extrasBox = document.createElement('div');
      extrasBox.className = 'extras';
      extrasBox.dataset.extras = '';
      const addRow = host.querySelector('.extra-add-row');
      if(addRow) addRow.before(extrasBox);
      else host.appendChild(extrasBox);
    }
    const existingHrefs = Array.from(extrasBox.querySelectorAll('a.extra-link')).map(a=>a.getAttribute('href'));
    const existingSrcs = Array.from(extrasBox.querySelectorAll('img')).map(img=>img.getAttribute('src'));
    (it.links||[]).forEach(lk=>{
      if(!lk||!lk.href) return;
      if(existingHrefs.indexOf(lk.href) >= 0) return;
      addExtraLinkToBox(extrasBox, lk.text||'連結', lk.href);
    });
    (it.images||[]).forEach(src=>{
      if(!src) return;
      if(existingSrcs.indexOf(src) >= 0) return;
      addExtraImageToBox(extrasBox, src);
    });
  });
}

/* ════════════════════════════════════════════════════════════════════
   💴 記帳功能
   ════════════════════════════════════════════════════════════════════ */
function addBudget(day, cat, label){
  const card = document.getElementById('budget-'+day);
  const addRow = card.querySelector('.budget-add-row');
  const row = document.createElement('div');
  row.className = 'budget-row';
  row.dataset.cat = cat;
  // 🆕 v6 預設付款人 = 目前使用者（沒選人就用 share）
  const defaultPayer = currentUser === 'xinhong' ? 'x' : currentUser === 'xiaoxian' ? 'y' : 'share';
  row.dataset.payer = defaultPayer;
  const catClass = cat==='food'?'bc-food':cat==='transport'?'bc-transport':cat==='shop'?'bc-shop':cat==='hotel'?'bc-hotel':'bc-other';
  row.innerHTML = `<span class="budget-cat ${catClass}">${label}</span>
    <input class="budget-desc" placeholder="說明..." />
    <input class="budget-amt" type="number" placeholder="0" />
    <span style="font-size:11px;color:var(--text-muted)">KRW</span>
    <select class="budget-payer payer-${defaultPayer}" onchange="changePayer(this)">
      <option value="x" ${defaultPayer==='x'?'selected':''}>👨 信宏付</option>
      <option value="y" ${defaultPayer==='y'?'selected':''}>🧑 小賢付</option>
      <option value="share" ${defaultPayer==='share'?'selected':''}>👥 共同</option>
    </select>
    <button class="budget-del" onclick="this.parentElement.remove();updateTotals();saveBudget();">×</button>`;
  card.insertBefore(row, addRow);
  row.querySelector('.budget-amt').focus();
}

/* 🆕 v6 切換付款人時更新樣式 + 同步 */
/* ════════════════════════════════════════════════════════════════════
   🔀 Day 4 方案切換（v9 新增：方案 A 6002 / 方案 B AREX）
   ════════════════════════════════════════════════════════════════════ */
function switchD4Plan(plan){
  // 切換按鈕的 active 樣式
  document.getElementById('d4-tab-a').classList.toggle('active', plan === 'a');
  document.getElementById('d4-tab-b').classList.toggle('active', plan === 'b');
  // 切換內容區的顯示
  document.getElementById('d4-plan-a').classList.toggle('active', plan === 'a');
  document.getElementById('d4-plan-b').classList.toggle('active', plan === 'b');
  // 用 localStorage 記住使用者選擇
  try { localStorage.setItem('seoul_d4_plan', plan); } catch(e){}
}

/* 啟動時載入記住的方案（沒記就預設 A） */
function initD4Plan(){
  let plan = 'a';
  try {
    const saved = localStorage.getItem('seoul_d4_plan');
    if(saved === 'a' || saved === 'b') plan = saved;
  } catch(e){}
  switchD4Plan(plan);
}

/* ════════════════════════════════════════════════════════════════════
   🔀 Day 1 方案切換（v10 新增：方案 A 6002 / 方案 B AREX）
   ════════════════════════════════════════════════════════════════════ */
function switchD1Plan(plan){
  document.getElementById('d1-tab-a').classList.toggle('active', plan === 'a');
  document.getElementById('d1-tab-b').classList.toggle('active', plan === 'b');
  document.getElementById('d1-plan-a').classList.toggle('active', plan === 'a');
  document.getElementById('d1-plan-b').classList.toggle('active', plan === 'b');
  try { localStorage.setItem('seoul_d1_plan', plan); } catch(e){}
}

function initD1Plan(){
  let plan = 'a';
  try {
    const saved = localStorage.getItem('seoul_d1_plan');
    if(saved === 'a' || saved === 'b') plan = saved;
  } catch(e){}
  switchD1Plan(plan);
}

function changePayer(sel){
  const row = sel.closest('.budget-row');
  if(!row) return;
  row.dataset.payer = sel.value;
  // 切換 class（顏色）
  sel.classList.remove('payer-x','payer-y','payer-share');
  sel.classList.add('payer-' + sel.value);
  saveBudget();
  updateTotals();
}

function updateTotals(){
  const cats = {food:0, transport:0, shop:0, other:0, hotel:0};
  // 🆕 v6 加入「分人總額」
  const payers = {x:0, y:0, share:0};
  ['d1','d2','d3','d4'].forEach(d=>{
    let total = 0;
    document.querySelectorAll(`#budget-${d} .budget-row`).forEach(r=>{
      const amt = parseFloat(r.querySelector('.budget-amt').value) || 0;
      const c = r.dataset.cat || 'other';
      const p = r.dataset.payer || 'share';
      total += amt;
      if(cats[c] !== undefined) cats[c] += amt;
      if(payers[p] !== undefined) payers[p] += amt;
    });
    document.getElementById('total-'+d).textContent = total.toLocaleString() + ' KRW';
  });
  document.getElementById('sum-food').textContent = cats.food.toLocaleString() + ' KRW';
  document.getElementById('sum-transport').textContent = cats.transport.toLocaleString() + ' KRW';
  document.getElementById('sum-shop').textContent = cats.shop.toLocaleString() + ' KRW';
  document.getElementById('sum-other').textContent = (cats.other + cats.hotel).toLocaleString() + ' KRW';
  const total = cats.food+cats.transport+cats.shop+cats.other+cats.hotel;
  document.getElementById('sum-krw').textContent = total.toLocaleString() + ' KRW';
  document.getElementById('sum-twd').textContent = 'NT$ ' + Math.round(total*0.0234).toLocaleString();
  // 🆕 v6 更新「誰付了多少」（如果有對應 DOM）
  const sx = document.getElementById('sum-payer-x');
  const sy = document.getElementById('sum-payer-y');
  const ss = document.getElementById('sum-payer-share');
  if(sx) sx.textContent = payers.x.toLocaleString() + ' KRW';
  if(sy) sy.textContent = payers.y.toLocaleString() + ' KRW';
  if(ss) ss.textContent = payers.share.toLocaleString() + ' KRW';
  // 🆕 v6 自動算「誰該補誰多少錢」（共同支出對半攤）
  const settle = document.getElementById('sum-settle');
  if(settle){
    const xPaid = payers.x + payers.share/2;   // 信宏實際負擔
    const yPaid = payers.y + payers.share/2;   // 小賢實際負擔
    const xCharged = payers.x;
    const yCharged = payers.y;
    // 共同的對半，所以信宏多付的部分 = (xCharged + share/2) - 平均
    const avg = (payers.x + payers.y + payers.share) / 2;
    const xDiff = xCharged + payers.share - avg;   // 簡化：信宏現金流出 - 應分擔
    const yDiff = yCharged - avg;
    // 用更直觀算法：誰付得比應分擔的多 → 對方補錢給他
    const xShouldPay = payers.x + payers.share/2;  // 信宏應該負擔
    const yShouldPay = payers.y + payers.share/2;  // 小賢應該負擔
    const xActuallyPaid = payers.x + payers.share; // 假設「共同」是 x 先墊？無法確定
    // 簡化邏輯：以「各自付款 + 共同對半」呈現
    settle.innerHTML = `信宏實付 <strong>${(payers.x).toLocaleString()}</strong> KRW · 小賢實付 <strong>${(payers.y).toLocaleString()}</strong> KRW · 共同支出 <strong>${(payers.share).toLocaleString()}</strong> KRW（平攤每人 ${(payers.share/2).toLocaleString()} KRW）`;
  }
}

function saveBudget(){
  const data = {};
  ['d1','d2','d3','d4'].forEach(d=>{
    data[d] = [];
    document.querySelectorAll(`#budget-${d} .budget-row`).forEach(r=>{
      data[d].push({
        cat: r.dataset.cat,
        label: r.querySelector('.budget-cat').textContent,
        desc: r.querySelector('.budget-desc').value,
        amt: r.querySelector('.budget-amt').value,
        payer: r.dataset.payer || 'share'   // 🆕 v6
      });
    });
  });
  debouncedSync('budget', data);
}

function applyBudget(data){
  if(!data) return;
  ['d1','d2','d3','d4'].forEach(d=>{
    if(!data[d]) return;
    const card = document.getElementById('budget-'+d);
    const addRow = card.querySelector('.budget-add-row');
    // 🆕 v6 先清空當天既有的 row（避免重複載入）
    card.querySelectorAll('.budget-row').forEach(r=>r.remove());
    data[d].forEach(item=>{
      const row = document.createElement('div');
      row.className = 'budget-row';
      row.dataset.cat = item.cat;
      const payer = item.payer || 'share';   // 🆕 v6 沒有付款人時預設共同
      row.dataset.payer = payer;
      const catClass = item.cat==='food'?'bc-food':item.cat==='transport'?'bc-transport':item.cat==='shop'?'bc-shop':item.cat==='hotel'?'bc-hotel':'bc-other';
      row.innerHTML = `<span class="budget-cat ${catClass}">${item.label}</span>
        <input class="budget-desc" value="${(item.desc||'').replace(/"/g,'&quot;')}" />
        <input class="budget-amt" type="number" value="${item.amt||''}" />
        <span style="font-size:11px;color:var(--text-muted)">KRW</span>
        <select class="budget-payer payer-${payer}" onchange="changePayer(this)">
          <option value="x" ${payer==='x'?'selected':''}>👨 信宏付</option>
          <option value="y" ${payer==='y'?'selected':''}>🧑 小賢付</option>
          <option value="share" ${payer==='share'?'selected':''}>👥 共同</option>
        </select>
        <button class="budget-del" onclick="this.parentElement.remove();updateTotals();saveBudget();">×</button>`;
      card.insertBefore(row, addRow);
    });
  });
  updateTotals();
}

document.addEventListener('input', e=>{
  if(e.target.matches('.budget-amt, .budget-desc')){
    updateTotals();
    saveBudget();
  }
});

/* ════════════════════════════════════════════════════════════════════
   📸 相簿功能
   ════════════════════════════════════════════════════════════════════ */
let photoStore = {d1:[], d2:[], d3:[], d4:[]};
let lightboxCurrent = null;

function uploadPhotos(day, input){
  const files = Array.from(input.files);
  files.forEach(file=>{
    const reader = new FileReader();
    reader.onload = e=>{
      photoStore[day].push(e.target.result);
      renderGrid(day);
      // 雲端同步：照片較大，使用較長 debounce
      debouncedSync('photos', photoStore, 1500);
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderGrid(day){
  const grid = document.getElementById('grid-'+day);
  grid.innerHTML = '';
  photoStore[day].forEach((src, idx)=>{
    const img = document.createElement('img');
    img.className = 'photo-thumb';
    img.src = src;
    img.onclick = ()=>openLightbox(day, idx);
    grid.appendChild(img);
  });
}

function openLightbox(day, idx){
  lightboxCurrent = {day, idx};
  document.getElementById('lightbox-img').src = photoStore[day][idx];
  document.getElementById('lightbox').classList.add('show');
}

function closeLightbox(e){
  if(e && e.target.tagName === 'IMG' && e.target.id === 'lightbox-img') return;
  document.getElementById('lightbox').classList.remove('show');
  lightboxCurrent = null;
}

function deleteLightboxPhoto(){
  if(!lightboxCurrent) return;
  // 🆕 從 extras（行前清單迷你圖片）打開的，不在這裡刪，要回去點圖片右上角的 ×
  if(lightboxCurrent.fromExtra){
    showToast('💡 請點圖片右上角的 × 刪除');
    closeLightbox();
    return;
  }
  if(!confirm('確定要刪除這張照片嗎？')) return;
  // 隨手記中的照片
  if(lightboxCurrent.fromNote){
    const note = notesStore.find(n => n.id == lightboxCurrent.noteId);
    if(note){
      note.photos.splice(lightboxCurrent.idx, 1);
      saveNotes();
      renderNotesList();
    }
  } else {
    // 相簿中的照片
    photoStore[lightboxCurrent.day].splice(lightboxCurrent.idx, 1);
    renderGrid(lightboxCurrent.day);
    debouncedSync('photos', photoStore, 1500);
  }
  closeLightbox();
}

function applyPhotos(data){
  if(!data) return;
  photoStore = Object.assign({d1:[],d2:[],d3:[],d4:[]}, data);
  ['d1','d2','d3','d4'].forEach(d=>renderGrid(d));
}

/* ════════════════════════════════════════════════════════════════════
   📝 隨手記功能
   ════════════════════════════════════════════════════════════════════ */
let notesStore = [];        // 所有隨手記
let notePhotosTemp = [];    // 表單中暫存的照片
let noteLocationTemp = '';  // 表單中暫存的地點

/* 即時更新表單時間 */
function updateNoteFormTime(){
  const el = document.getElementById('note-form-time');
  if(!el) return;
  const now = new Date();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  const h = String(now.getHours()).padStart(2,'0');
  const mi = String(now.getMinutes()).padStart(2,'0');
  el.textContent = `📅 ${m}/${d} ${h}:${mi}`;
}

/* 取得地點（用瀏覽器內建定位） */
function setNoteLocation(){
  const el = document.getElementById('note-form-loc');
  if(!navigator.geolocation){
    showToast('⚠️ 此瀏覽器不支援定位');
    return;
  }
  el.textContent = '📍 取得位置中...';
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat = pos.coords.latitude.toFixed(5);
    const lng = pos.coords.longitude.toFixed(5);
    noteLocationTemp = `${lat},${lng}`;
    el.textContent = `📍 已取得位置`;
    el.classList.add('active');
    showToast('✅ 已記錄當前位置');
  }, err=>{
    el.textContent = '📍 點此加地點';
    showToast('⚠️ 無法取得位置：' + (err.message || '未知'));
  }, {timeout: 8000, enableHighAccuracy: true});
}

/* 加照片到隨手記表單 */
function addNotePhoto(input){
  const files = Array.from(input.files);
  files.forEach(file=>{
    const reader = new FileReader();
    reader.onload = e=>{
      notePhotosTemp.push(e.target.result);
      renderNotePreview();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderNotePreview(){
  const wrap = document.getElementById('note-form-photo-preview');
  wrap.innerHTML = '';
  notePhotosTemp.forEach((src, idx)=>{
    const w = document.createElement('div');
    w.className = 'note-prev-wrap';
    w.innerHTML = `<img class="note-prev-img" src="${src}">
      <button class="note-prev-del" onclick="removeNotePhoto(${idx})">×</button>`;
    wrap.appendChild(w);
  });
}

function removeNotePhoto(idx){
  notePhotosTemp.splice(idx, 1);
  renderNotePreview();
}

/* 提交一筆隨手記 */
function submitNote(){
  const textEl = document.getElementById('note-form-text');
  const text = textEl.textContent.trim();
  if(!text && notePhotosTemp.length === 0){
    showToast('⚠️ 請至少寫點什麼或加張照片');
    return;
  }
  
  const note = {
    id: Date.now(),
    time: new Date().toISOString(),
    text: text,
    photos: [...notePhotosTemp],     // 直接存 base64 到本機
    location: noteLocationTemp,
    day: getCurrentDay()
  };
  notesStore.unshift(note);
  saveNotes();           // 存到本機 localStorage
  renderNotesList();

  // 清空表單
  textEl.textContent = '';
  notePhotosTemp = [];
  noteLocationTemp = '';
  document.getElementById('note-form-photo-preview').innerHTML = '';
  const locEl = document.getElementById('note-form-loc');
  locEl.textContent = '📍 點此加地點';
  locEl.classList.remove('active');
  
  showToast('✅ 已記下（只存在這台裝置）');
}

/* 移除 uploadPhotoToGAS（不再需要） */

/* 自動判斷今天是 Day 幾 */
function getCurrentDay(){
  const today = new Date();
  const start = new Date(2026, 4, 1);  // 5/1
  const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  if(diff === 0) return 'Day 1';
  if(diff === 1) return 'Day 2';
  if(diff === 2) return 'Day 3';
  if(diff === 3) return 'Day 4';
  return '';  // 其他日期不顯示
}

/* 渲染所有隨手記 */
function renderNotesList(){
  const list = document.getElementById('notes-list');
  const empty = document.getElementById('notes-empty');
  if(notesStore.length === 0){
    list.innerHTML = '<div class="notes-empty" id="notes-empty"><div style="font-size:48px;margin-bottom:12px">📝</div><div style="font-size:14px;color:var(--text-muted)">還沒有隨手記</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">想到什麼就記下來！</div></div>';
    return;
  }
  list.innerHTML = '';
  notesStore.forEach(note=>{
    const card = document.createElement('div');
    card.className = 'note-card';
    card.dataset.id = note.id;

    // 格式化時間
    const t = new Date(note.time);
    const timeStr = `${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;

    // 地點按鈕（如果有座標，點了會打開 Google Map）
    let locHtml = '';
    if(note.location){
      const [lat, lng] = note.location.split(',');
      locHtml = `<a class="note-card-loc" href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="text-decoration:none">📍 看地點</a>`;
    }

    // Day 標籤
    let dayHtml = note.day ? `<span class="note-card-day">${note.day}</span>` : '';

    // 照片
    let photoHtml = '';
    if(note.photos && note.photos.length > 0){
      photoHtml = '<div class="note-card-photos">';
      note.photos.forEach((src, idx)=>{
        photoHtml += `<img src="${src}" onclick="openNotePhoto('${note.id}',${idx})">`;
      });
      photoHtml += '</div>';
    }

    card.innerHTML = `
      <div class="note-card-top">
        <div class="note-card-meta">
          <span class="note-card-time">📅 ${timeStr}</span>
          ${dayHtml}
          ${locHtml}
        </div>
        <button class="note-card-del" onclick="deleteNote(${note.id})">🗑</button>
      </div>
      ${note.text ? `<div class="note-card-text">${escapeHtml(note.text)}</div>` : ''}
      ${photoHtml}
    `;
    list.appendChild(card);
  });
}

function escapeHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* 點隨手記照片 → 用 lightbox 開啟 */
function openNotePhoto(noteId, idx){
  const note = notesStore.find(n => n.id == noteId);
  if(!note) return;
  document.getElementById('lightbox-img').src = note.photos[idx];
  document.getElementById('lightbox').classList.add('show');
  // 標記目前在隨手記模式（共用 lightbox）
  lightboxCurrent = {fromNote: true, noteId: noteId, idx: idx};
}

/* 刪除一筆隨手記 */
function deleteNote(id){
  if(!confirm('確定要刪除這則隨手記嗎？刪除後無法復原。')) return;
  notesStore = notesStore.filter(n => n.id != id);
  saveNotes();
  renderNotesList();
  showToast('🗑 已刪除');
}

/* 儲存到瀏覽器本機（不上雲端） */
function saveNotes(){
  try {
    localStorage.setItem('seoul_notes', JSON.stringify(notesStore));
  } catch(err){
    console.warn('儲存隨手記失敗:', err);
  }
}

/* 從瀏覽器本機載入（不從雲端） */
function loadNotesFromLocal(){
  try {
    const data = localStorage.getItem('seoul_notes');
    if(data){
      notesStore = JSON.parse(data);
      renderNotesList();
    }
  } catch(err){
    console.warn('載入隨手記失敗:', err);
  }
}

/* 從雲端載入（不再使用，但保留兼容） */
function applyNotes(data){
  // 不再從雲端載入，因為改存本機
  return;
}

/* ════════════════════════════════════════════════════════════════════
   🆕 v4 新增：機票號碼複製、行前清單迷你連結/圖片
   ════════════════════════════════════════════════════════════════════ */

/* 🆕 <<JS_機票複製>> 機票號碼複製 */
function copyTicket(btn, code){
  navigator.clipboard.writeText(code).then(()=>{
    btn.classList.add('copied');
    btn.textContent = '✓';
    showToast('📋 已複製：' + code);
    setTimeout(()=>{btn.classList.remove('copied'); btn.textContent='📋';}, 1500);
  }).catch(()=>{
    showToast('⚠️ 複製失敗，請手動長按');
  });
}

/* 🆕 <<JS_迷你彈窗>> 用一個共用彈窗請使用者輸入連結網址或圖片網址
   ────────────────────────────────────────────
   ▶ pendingExtras 暫存：使用者點哪個按鈕、要加什麼類型 */
let pendingExtras = null;   // {chkBody:HTMLElement, type:'link'|'image'}

function openAddLink(btn){
  // v14：支援多種容器：行前清單(.chk-body) / 景點交通卡(.note-host)
  const host = btn.closest('.chk-body') || btn.closest('.note-host');
  pendingExtras = {chkBody: host, type:'link'};
  document.getElementById('mm-title').textContent = '🔗 新增連結';
  document.getElementById('mm-hint').innerHTML = '貼上網址（例：APP 下載連結、官網），按確定就會出現一顆小按鈕。<br>也可以同時設定按鈕上要顯示的文字。';
  document.getElementById('mm-input1').placeholder = '按鈕顯示文字（例：iOS 下載）';
  document.getElementById('mm-input2').placeholder = '網址（https://...）';
  document.getElementById('mm-input1').value = '';
  document.getElementById('mm-input2').value = '';
  document.getElementById('mm-input1').style.display = 'block';
  document.getElementById('mini-modal').classList.add('show');
  setTimeout(()=>document.getElementById('mm-input1').focus(), 80);
}

function openAddImage(btn){
  // v15：改用「選檔案」(input file) 直接讓使用者選照片，自動壓縮上傳
  const host = btn.closest('.chk-body') || btn.closest('.note-host');
  // 動態建一個隱藏的 file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;  // 一次可選多張
  fileInput.style.display = 'none';
  fileInput.onchange = e => handleImagePick(e, host);
  document.body.appendChild(fileInput);
  fileInput.click();
  // 用完移除避免汙染
  setTimeout(()=>fileInput.remove(), 60000);
}

/* v15：處理選好的圖片檔案 → 壓縮 → 加到 host */
async function handleImagePick(event, host){
  const files = Array.from(event.target.files || []);
  if(!files.length) return;
  showToast('🔄 處理圖片中...');

  // 找或建 extras 容器
  let extrasBox = host.querySelector('[data-extras]');
  if(!extrasBox){
    extrasBox = document.createElement('div');
    extrasBox.className = 'extras';
    extrasBox.dataset.extras = '';
    const addRow = host.querySelector('.extra-add-row');
    if(addRow) addRow.before(extrasBox);
    else host.appendChild(extrasBox);
  }

  let okCount = 0;
  for(const file of files){
    try{
      const dataUrl = await compressImage(file, 800, 0.7);
      addExtraImageToBox(extrasBox, dataUrl);
      okCount++;
    }catch(err){
      console.warn('壓縮失敗', err);
      showToast('⚠️ 部分圖片處理失敗');
    }
  }
  if(okCount){
    showToast('✅ 已加入 ' + okCount + ' 張圖片');
    // 區分儲存
    if(host.classList.contains('note-host')) saveSpotNotes();
    else savePrep();
  }
}

/* v15：圖片壓縮（縮到指定寬度，輸出 jpeg base64） */
function compressImage(file, maxWidth, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=>reject(new Error('讀取失敗'));
    reader.onload = e=>{
      const img = new Image();
      img.onerror = ()=>reject(new Error('圖片無效'));
      img.onload = ()=>{
        try{
          let w = img.width, h = img.height;
          if(w > maxWidth){
            h = h * (maxWidth / w);
            w = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        }catch(err){ reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function closeMiniModal(){
  document.getElementById('mini-modal').classList.remove('show');
  pendingExtras = null;
}

function confirmMiniModal(){
  if(!pendingExtras) return closeMiniModal();
  const url = document.getElementById('mm-input2').value.trim();
  if(!url){ showToast('⚠️ 請輸入網址'); return; }
  // 簡單檢查 URL 開頭
  if(!/^https?:\/\//i.test(url)){
    showToast('⚠️ 網址要以 http:// 或 https:// 開頭');
    return;
  }
  let extrasBox = pendingExtras.chkBody.querySelector('[data-extras]');
  if(!extrasBox){
    extrasBox = document.createElement('div');
    extrasBox.className = 'extras';
    extrasBox.dataset.extras = '';
    const addRow = pendingExtras.chkBody.querySelector('.extra-add-row');
    if(addRow) addRow.before(extrasBox);
    else pendingExtras.chkBody.appendChild(extrasBox);
  }
  // v15：modal 只處理連結了（圖片已改用 file input）
  const txt = document.getElementById('mm-input1').value.trim() || '🔗 連結';
  addExtraLinkToBox(extrasBox, txt, url);
  showToast('✅ 連結已加入');
  closeMiniModal();
  // 區分儲存
  if(pendingExtras.chkBody.classList.contains('note-host')){
    saveSpotNotes();
  } else {
    savePrep();
  }
}

/* 🆕 <<JS_加連結>> 在 extras 容器裡塞一顆連結按鈕 */
function addExtraLinkToBox(extrasBox, text, href){
  // 找出或建立 .extra-row（連結用）
  let row = extrasBox.querySelector('.extra-row');
  if(!row){
    row = document.createElement('div');
    row.className = 'extra-row';
    extrasBox.appendChild(row);
  }
  const a = document.createElement('a');
  a.className = 'extra-link';
  a.target = '_blank';
  a.href = href;
  a.innerHTML = `${escapeHtmlSimple(text)}<span class="ex-del" onclick="event.preventDefault();event.stopPropagation();delExtraLink(this)">×</span>`;
  row.appendChild(a);
}

/* 🆕 <<JS_加圖片>> 在 extras 容器裡塞一張縮圖 */
function addExtraImageToBox(extrasBox, src){
  let imgRow = extrasBox.querySelector('.extra-img-row');
  if(!imgRow){
    imgRow = document.createElement('div');
    imgRow.className = 'extra-img-row';
    extrasBox.appendChild(imgRow);
  }
  const wrap = document.createElement('div');
  wrap.className = 'extra-img-wrap';
  wrap.innerHTML = `<img src="${src.replace(/"/g,'&quot;')}" onclick="openExtraLightbox(this)" onerror="this.parentElement.style.opacity='0.4';this.parentElement.title='圖片載入失敗，請確認網址正確'">
    <button class="extra-img-del" onclick="event.stopPropagation();delExtraImage(this)">×</button>`;
  imgRow.appendChild(wrap);
}

/* 🆕 <<JS_刪連結>> 刪除單顆連結 */
function delExtraLink(spanX){
  const a = spanX.closest('a.extra-link');
  if(!a) return;
  const row = a.parentElement;
  const isSpot = !!a.closest('.note-host');  // v14
  a.remove();
  if(row && !row.querySelector('a.extra-link')) row.remove();
  if(isSpot) saveSpotNotes(); else savePrep();
}

/* 🆕 <<JS_刪圖片>> 刪除單張圖片 */
function delExtraImage(btn){
  const wrap = btn.closest('.extra-img-wrap');
  if(!wrap) return;
  const row = wrap.parentElement;
  const isSpot = !!wrap.closest('.note-host');  // v14
  wrap.remove();
  if(row && !row.querySelector('.extra-img-wrap')) row.remove();
  if(isSpot) saveSpotNotes(); else savePrep();
}

/* 🆕 <<JS_點圖看大圖>> 用既有的 lightbox 顯示 */
function openExtraLightbox(img){
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = img.src;
  // 用一個特殊 flag 標示這不是相簿照片，所以「刪除」按鈕的行為要不一樣
  lightboxCurrent = {fromExtra: true};
  lb.classList.add('show');
}

/* 簡單 HTML escape，避免 text 含 < > & 變成標籤 */
function escapeHtmlSimple(str){
  if(str==null) return '';
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ════════════════════════════════════════════════════════════════════
   📞 電話複製
   ════════════════════════════════════════════════════════════════════ */
function copyPhone(btn, phone){
  navigator.clipboard.writeText(phone).then(()=>{
    btn.classList.add('copied');
    btn.textContent = '✓ 已複製';
    showToast('📋 電話已複製：' + phone);
    setTimeout(()=>{btn.classList.remove('copied'); btn.textContent='📋 複製';}, 1500);
  });
}

/* ════════════════════════════════════════════════════════════════════
   📱 <<PWA_註冊>> Service Worker 註冊（讓網頁可以離線）
   ════════════════════════════════════════════════════════════════════
   ▶ 這段在背景運作，不用你手動執行
   ▶ 第一次開：把網頁所有資料存到手機
   ▶ 之後開：直接從手機讀（飛快、可離線）
   ▶ 想關掉 PWA？把整段註冊邏輯註解掉即可
   ════════════════════════════════════════════════════════════════════ */
function registerPWA(){
  if(!('serviceWorker' in navigator)) {
    console.log('[PWA] 此瀏覽器不支援 Service Worker');
    return;
  }
  // file:// 協議下不能註冊 SW，給個友善提示
  if(location.protocol === 'file:') {
    console.log('[PWA] 用 file:// 開啟無法啟用離線功能，請部署到 GitHub Pages 或本機伺服器');
    return;
  }
  navigator.serviceWorker.register('sw.js').then(reg => {
    console.log('[PWA] ✅ 離線管家已啟動', reg.scope);
    
    // 偵測新版本（你改了 HTML 並更新版本號時）
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if(!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
          // 有新版了！詢問是否更新
          showUpdateBanner();
        }
      });
    });
  }).catch(err => {
    console.warn('[PWA] 離線管家註冊失敗', err);
  });
}

/* 🆕 顯示「有新版本」橫幅 */
function showUpdateBanner(){
  if(document.getElementById('pwa-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:10px 18px;border-radius:30px;font-size:13px;font-weight:600;z-index:1100;box-shadow:0 4px 16px rgba(91,141,239,0.4);cursor:pointer;display:flex;align-items:center;gap:8px;';
  banner.innerHTML = '🆕 有新版本！<span style="background:rgba(255,255,255,0.25);padding:3px 10px;border-radius:20px;font-size:12px">點此更新</span>';
  banner.onclick = () => {
    navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
    location.reload();
  };
  document.body.appendChild(banner);
}

/* 🆕 偵測「裝到主畫面」事件，給使用者按鈕去裝 */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallButton();
});

function showInstallButton(){
  if(document.getElementById('pwa-install-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'pwa-install-btn';
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--accent);color:#fff;border:none;padding:10px 16px;border-radius:30px;font-size:13px;font-weight:600;font-family:"Noto Sans TC",sans-serif;z-index:1100;box-shadow:0 4px 16px rgba(91,141,239,0.4);cursor:pointer;display:flex;align-items:center;gap:6px;';
  btn.innerHTML = '📲 裝到主畫面';
  btn.onclick = async () => {
    if(!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if(result.outcome === 'accepted'){
      showToast('🎉 安裝成功！可從主畫面開啟');
    }
    deferredInstallPrompt = null;
    btn.remove();
  };
  document.body.appendChild(btn);
}

/* 🆕 離線/上線狀態提示 */
function showOnlineStatus(isOnline){
  const existing = document.getElementById('pwa-status-banner');
  if(isOnline){
    if(existing) existing.remove();
    return;
  }
  if(existing) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-status-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#FFE6B0;color:#7A5500;padding:6px 12px;font-size:12px;font-weight:600;text-align:center;z-index:400;border-bottom:1px solid #E0C080;';
  banner.innerHTML = '📵 目前離線中 · 可繼續看行程，雲端同步暫停';
  document.body.insertBefore(banner, document.body.firstChild);
}
window.addEventListener('online', () => {
  showOnlineStatus(true);
  showToast('🌐 已回到線上！');
});
window.addEventListener('offline', () => showOnlineStatus(false));

/* ════════════════════════════════════════════════════════════════════
   🚀 初始化
   ════════════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', ()=>{
  initUser();              // 🆕 v6 第一次跳出選人，或讀本機記住的人
  initD4Plan();            // 🆕 v9 載入 Day 4 方案選擇
  initD1Plan();            // 🆕 v10 載入 Day 1 方案選擇
  injectSpotNoteHosts();   // 🆕 v14 為所有景點卡注入筆記區塊
  updateProgress();
  updateTotals();
  ['d1','d2','d3','d4'].forEach(d=>renderGrid(d));
  loadNotesFromLocal();    // 🆕 從瀏覽器本機載入隨手記
  renderNotesList();
  updateNoteFormTime();
  // 每分鐘更新隨手記表單的時間
  setInterval(updateNoteFormTime, 30000);
  if(isApiReady()) loadAllFromCloud();
  // 🆕 v5 啟動 PWA 離線功能
  registerPWA();
  // 開啟時就檢查是否離線
  if(!navigator.onLine) showOnlineStatus(false);
});

/* ════════════════════════════════════════════════════════════════════
   📌 v14 自動為所有景點/交通卡注入「+ 連結 / + 圖片」筆記區
   ──────────────────────────────────────────────────────────────────
   ▶ 為什麼用 JS 注入而不是手寫？因為景點超過 30 個，手寫太累
   ▶ 規則：所有 .spot-card .spot-body 都會自動加上一個 .note-host
   ▶ 用 spot-title 自動產生 spotId（去除特殊字元變成穩定識別碼）
   ════════════════════════════════════════════════════════════════════ */
function injectSpotNoteHosts(){
  let counter = 0;
  document.querySelectorAll('.spot-card .spot-body').forEach(body=>{
    // 已經有 note-host 的就跳過
    if(body.querySelector('.note-host')) return;
    // 用 spot-title + 序號當 spotId
    const titleEl = body.querySelector('.spot-title');
    const titleText = titleEl ? titleEl.textContent.trim() : 'spot';
    const spotId = 'spot_' + (++counter) + '_' + titleText.replace(/[^\w\u4e00-\u9fa5]/g,'').slice(0,20);
    // 建立 note-host
    const host = document.createElement('div');
    host.className = 'note-host';
    host.dataset.spotId = spotId;
    host.innerHTML = `
      <div class="note-host-title">📝 我的筆記（兩人共用）</div>
      <div class="extras" data-extras></div>
      <div class="extra-add-row">
        <button class="extra-add-btn" onclick="event.stopPropagation();openAddLink(this)">+ 連結</button>
        <button class="extra-add-btn" onclick="event.stopPropagation();openAddImage(this)">+ 圖片</button>
      </div>`;
    body.appendChild(host);
  });
}
