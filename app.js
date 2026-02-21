// =========================
//  Storage Keys
// =========================
const STORAGE_KEY_STATUS     = "cardapp_status_v1";
const STORAGE_KEY_LAST_THEME = "cardapp_last_theme_v1";
const STORAGE_KEY_RECENT     = "cardapp_recent_themes_v1";
const STORAGE_KEY_FILTER     = "cardapp_filter_v1";

// =========================
//  Status / State
// =========================
const STATUSES = [
  { key: "unknown",   label: "覚えていない" },
  { key: "ambiguous", label: "曖昧" },
  { key: "known",     label: "覚えた" },
];

let CARDS = [];
let THEMES = [];

let currentThemeKey = null;
let currentFilter   = loadText(STORAGE_KEY_FILTER, "unknown");

// modal
let modalCardId = null;
let showBack = false;
let modalStartMode = "start"; // start | jp | audio

// study
let studyDeck = [];
let studyIndex = 0;
let studyShowBack = false;
let studyFrontMode = "jp"; // jp | audio

// audio
let audio = new Audio();
let nowPlayingId = null;

// =========================
//  Utilities
// =========================
function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function loadText(key, fallback) {
  const v = localStorage.getItem(key);
  return v == null ? fallback : v;
}
function saveText(key, val) { localStorage.setItem(key, val); }

function statusLabel(k) {
  const s = STATUSES.find(x => x.key === k);
  return s ? s.label : k;
}

function getStatus(id) {
  const map = loadJSON(STORAGE_KEY_STATUS, {});
  return map[id] || "unknown";
}

function setStatus(id, status) {
  const map = loadJSON(STORAGE_KEY_STATUS, {});
  map[id] = status;
  saveJSON(STORAGE_KEY_STATUS, map);

  // update UIs
  renderTop();
  renderThemeTable();
  renderModal();
  if (isStudy()) renderStudyCard();
}

function playAudio(url, cardId, { silent = false } = {}) {
  if (!url) {
    if (!silent) alert("audioUrl が未設定です（cards.jsonを確認）");
    return;
  }

  // same card -> stop
  if (nowPlayingId === cardId && !audio.paused) {
    audio.pause();
    audio.currentTime = 0;
    nowPlayingId = null;
    return;
  }

  nowPlayingId = cardId;
  audio.pause();
  audio.currentTime = 0;
  audio.src = url;

  audio.play().catch(() => {
    // 自動再生ブロック等もあるので、silent時は無言でOK
    if (!silent) alert("音声を再生できませんでした（パス/形式/ブラウザ設定を確認）");
  });
}

function buildThemes() {
  const map = new Map();
  for (const c of CARDS) {
    const key = c.themeKey;
    const name = c.themeName || c.themeKey || "Untitled";
    const x = map.get(key) || { themeKey: key, themeName: name, count: 0 };
    x.count += 1;
    map.set(key, x);
  }
  THEMES = [...map.values()].sort((a,b) => a.themeName.localeCompare(b.themeName, "ja"));
}

function themeNameByKey(themeKey) {
  return (THEMES.find(t => t.themeKey === themeKey)?.themeName) || themeKey || "未選択";
}

function hasThemeSelected() {
  return !!currentThemeKey && THEMES.some(t => t.themeKey === currentThemeKey);
}

function isTop(){ return screenTop.classList.contains("show"); }
function isPicker(){ return screenPicker.classList.contains("show"); }
function isList(){ return screenTheme.classList.contains("show"); }
function isStudy(){ return screenStudy.classList.contains("show"); }

// =========================
//  DOM
// =========================
const titleEl    = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");

// screens
const screenTop    = document.getElementById("screenTop");
const screenPicker = document.getElementById("screenPicker");
const screenTheme  = document.getElementById("screenTheme");
const screenStudy  = document.getElementById("screenStudy");

// header toolbars
const listToolbar = document.getElementById("listToolbar");
const listBackTopBtn = document.getElementById("listBackTopBtn");
const tabsEl = document.getElementById("tabs");

// top
const selectedThemeText = document.getElementById("selectedThemeText");
const goThemeSelectBtn  = document.getElementById("goThemeSelectBtn");
const topTabsEl         = document.getElementById("topTabs");
const modeSwipeJpBtn    = document.getElementById("modeSwipeJpBtn");
const modeSwipeAudioBtn = document.getElementById("modeSwipeAudioBtn");
const modeListBtn       = document.getElementById("modeListBtn");
const topHint           = document.getElementById("topHint");

// picker
const pickerBackTopBtn = document.getElementById("pickerBackTopBtn");
const themeSearch = document.getElementById("themeSearch");
const recentGrid  = document.getElementById("recentGrid");
const themeGrid   = document.getElementById("themeGrid");
const pickerCount = document.getElementById("pickerCount");

// list
const tbodyEl = document.getElementById("tbody");

// modal
const overlayEl     = document.getElementById("overlay");
const closeBtn      = document.getElementById("closeBtn");
const cardArea      = document.getElementById("cardArea");
const modalBadge    = document.getElementById("modalBadge");
const modalTheme    = document.getElementById("modalTheme");
const statusBtns    = document.getElementById("statusBtns");
const modalAudioBtn = document.getElementById("modalAudioBtn");

// study
const studyBackTopBtn = document.getElementById("studyBackTopBtn");
const studyCardEl     = document.getElementById("studyCard");
const studyAudioBtn   = document.getElementById("studyAudioBtn");
const studyCounterEl  = document.getElementById("studyCounter");
const studyHintEl     = document.getElementById("studyHint");
const actionUnknown   = document.getElementById("actionUnknown");
const actionAmbiguous = document.getElementById("actionAmbiguous");
const actionKnown     = document.getElementById("actionKnown");

// =========================
//  Navigation
// =========================
function hideAllScreens(){
  screenTop.classList.remove("show");
  screenPicker.classList.remove("show");
  screenTheme.classList.remove("show");
  screenStudy.classList.remove("show");
}

function showTop(){
  hideAllScreens();
  screenTop.classList.add("show");
  listToolbar.style.display = "none";
  titleEl.textContent = "英作文カード";
  subtitleEl.textContent = "トップ";
  renderTop();
}

function showPicker(){
  hideAllScreens();
  screenPicker.classList.add("show");
  listToolbar.style.display = "none";
  titleEl.textContent = "テーマ選択";
  subtitleEl.textContent = "テーマを選んでトップに戻ります";
  renderPicker();
}

function showList(){
  if (!hasThemeSelected()) return;
  hideAllScreens();
  screenTheme.classList.add("show");
  listToolbar.style.display = "flex";
  titleEl.textContent = themeNameByKey(currentThemeKey);
  subtitleEl.textContent = "一覧選択";
  renderTabs(tabsEl);
  renderThemeTable();
}

function showStudy(frontMode){
  if (!hasThemeSelected()) return;
  hideAllScreens();
  screenStudy.classList.add("show");
  listToolbar.style.display = "none";

  studyFrontMode = frontMode; // "jp" | "audio"
  studyIndex = 0;
  studyShowBack = false;

  // current filter only
  studyDeck = CARDS
    .filter(c => c.themeKey === currentThemeKey)
    .filter(c => getStatus(c.id) === currentFilter);

  titleEl.textContent = themeNameByKey(currentThemeKey);
  subtitleEl.textContent = frontMode === "jp" ? "スワイプ（日本語）" : "スワイプ（音声）";
  studyHintEl.textContent = "スワイプ：右=覚えた / 左=覚えていない / 上=曖昧　（タップで表⇄裏）";

  renderStudyCard();
}

// =========================
//  Top UI
// =========================
function renderTop(){
  const ok = hasThemeSelected();
  selectedThemeText.textContent = ok ? themeNameByKey(currentThemeKey) : "未選択";

  // filter tabs on top
  renderTabs(topTabsEl, { compact: true });

  // enable/disable modes
  [modeSwipeJpBtn, modeSwipeAudioBtn, modeListBtn].forEach(btn => {
    if (ok) btn.classList.remove("disabled");
    else btn.classList.add("disabled");
  });
  topHint.textContent = ok ? "モードを選んで開始。" : "まず「テーマを選択」してください。";
}

goThemeSelectBtn.addEventListener("click", showPicker);

modeSwipeJpBtn.addEventListener("click", () => showStudy("jp"));
modeSwipeAudioBtn.addEventListener("click", () => showStudy("audio"));
modeListBtn.addEventListener("click", showList);

// =========================
//  Picker UI
// =========================
function pushRecent(themeKey) {
  let arr = loadJSON(STORAGE_KEY_RECENT, []);
  arr = [themeKey, ...arr.filter(x => x !== themeKey)].slice(0, 6);
  saveJSON(STORAGE_KEY_RECENT, arr);
}

function themeButton(t){
  const btn = document.createElement("button");
  btn.className = "themeBtn";
  btn.innerHTML = `
    <p class="themeTitle">${escapeHtml(t.themeName)}</p>
    <p class="themeMeta">${t.count} cards</p>
  `;
  btn.onclick = () => {
    currentThemeKey = t.themeKey;
    saveText(STORAGE_KEY_LAST_THEME, currentThemeKey);
    pushRecent(currentThemeKey);
    showTop();
  };
  return btn;
}

function renderPicker(){
  const q = (themeSearch.value || "").trim().toLowerCase();

  const filtered = THEMES.filter(t => t.themeName.toLowerCase().includes(q));

  const recentKeys = loadJSON(STORAGE_KEY_RECENT, []);
  const recent = recentKeys
    .map(k => THEMES.find(t => t.themeKey === k))
    .filter(Boolean)
    .filter(t => t.themeName.toLowerCase().includes(q));

  pickerCount.textContent = `${THEMES.length} themes`;

  recentGrid.innerHTML = "";
  if (recent.length === 0) {
    recentGrid.innerHTML = `<div style="color:rgba(120,120,140,.9);grid-column:1/-1;">（まだありません）</div>`;
  } else {
    recent.forEach(t => recentGrid.appendChild(themeButton(t)));
  }

  themeGrid.innerHTML = "";
  if (filtered.length === 0) {
    themeGrid.innerHTML = `<div style="color:rgba(120,120,140,.9);grid-column:1/-1;">一致するテーマがありません。</div>`;
  } else {
    filtered.forEach(t => themeGrid.appendChild(themeButton(t)));
  }
}

themeSearch.addEventListener("input", renderPicker);
pickerBackTopBtn.addEventListener("click", showTop);

// =========================
//  Tabs (shared)
// =========================
function renderTabs(containerEl, { compact = false } = {}){
  containerEl.innerHTML = "";
  STATUSES.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "tab" + (currentFilter === s.key ? " active" : "");
    btn.textContent = s.label;
    btn.style.padding = compact ? "9px 10px" : "";
    btn.onclick = () => {
      currentFilter = s.key;
      saveText(STORAGE_KEY_FILTER, currentFilter);

      // refresh current screen
      renderTop();
      if (isList()) renderThemeTable();
      if (isStudy()) {
        // rebuild deck on filter change
        studyDeck = CARDS
          .filter(c => c.themeKey === currentThemeKey)
          .filter(c => getStatus(c.id) === currentFilter);
        studyIndex = 0;
        studyShowBack = false;
        renderStudyCard();
      }
    };
    containerEl.appendChild(btn);
  });
}

// =========================
//  List
// =========================
listBackTopBtn.addEventListener("click", showTop);

function renderThemeTable(){
  tbodyEl.innerHTML = "";
  if (!hasThemeSelected()) return;

  const rows = CARDS
    .filter(c => c.themeKey === currentThemeKey)
    .filter(c => getStatus(c.id) === currentFilter);

  rows.forEach(card => {
    const tr = document.createElement("tr");

    const tdJp = document.createElement("td");
    tdJp.innerHTML = `
      <div class="rowTop">
        <span class="jp">${escapeHtml(card.jp)}</span>
        <span class="badge">${statusLabel(getStatus(card.id))}</span>
      </div>
    `;
    tdJp.onclick = () => openModal(card.id);

    const tdAu = document.createElement("td");
    const b = document.createElement("button");
    b.className = "audioBtn";
    b.textContent = "▶︎";
    b.onclick = (e) => {
      e.stopPropagation();
      playAudio(card.audioUrl, card.id);
    };
    tdAu.appendChild(b);

    tr.appendChild(tdJp);
    tr.appendChild(tdAu);
    tbodyEl.appendChild(tr);
  });

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    const td2 = document.createElement("td");
    td1.style.borderRadius = "18px 0 0 18px";
    td2.style.borderRadius = "0 18px 18px 0";
    td1.style.color = "rgba(120,120,140,.95)";
    td1.textContent = "このフィルタのカードはありません。";
    td2.textContent = "";
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbodyEl.appendChild(tr);
  }
}

// =========================
//  Modal (start choice: 日本語 / 🔈)
// =========================
function openModal(cardId){
  modalCardId = cardId;
  showBack = false;
  modalStartMode = "start";
  overlayEl.classList.add("show");
  renderModal();
}
function closeModal(){
  overlayEl.classList.remove("show");
  modalCardId = null;
}
closeBtn.addEventListener("click", closeModal);
overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeModal(); });

cardArea.addEventListener("click", () => {
  if (!modalCardId) return;

  if (modalStartMode === "start") return;

  if (!showBack && modalStartMode === "audio") {
    modalStartMode = "jp";
    renderModal();
    return;
  }

  showBack = !showBack;
  renderModal();
});

modalAudioBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const card = CARDS.find(c => c.id === modalCardId);
  if (!card) return;
  playAudio(card.audioUrl, card.id);
});

function renderModal(){
  if (!modalCardId) return;
  const card = CARDS.find(c => c.id === modalCardId);
  if (!card) return;

  modalBadge.textContent = statusLabel(getStatus(card.id));
  modalTheme.textContent = themeNameByKey(card.themeKey);

  // status buttons
  statusBtns.innerHTML = "";
  STATUSES.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "sbtn" + (getStatus(card.id) === s.key ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = (e) => { e.stopPropagation(); setStatus(card.id, s.key); };
    statusBtns.appendChild(btn);
  });

  // start selector
  if (!showBack && modalStartMode === "start") {
    cardArea.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color: rgba(120,120,140,.95);">どちらから始める？</div>
        <button class="primaryBtn" id="modalChooseJp" style="width:100%;">日本語</button>
        <button class="audioBtn" id="modalChooseAudio" style="width:100%;">🔈 音声</button>
        <div class="hint">選んだ後はタップで裏面（英語＋IPA）へ</div>
      </div>
    `;
    document.getElementById("modalChooseJp").onclick = (e) => {
      e.stopPropagation();
      modalStartMode = "jp";
      renderModal();
    };
    document.getElementById("modalChooseAudio").onclick = (e) => {
      e.stopPropagation();
      modalStartMode = "audio";
      playAudio(card.audioUrl, card.id);
      renderModal();
    };
    return;
  }

  if (!showBack && modalStartMode === "jp") {
    cardArea.innerHTML = `
      <p class="big">${escapeHtml(card.jp)}</p>
      <div class="hint">（タップで裏面：英語＋IPA）</div>
    `;
    return;
  }

  if (!showBack && modalStartMode === "audio") {
    cardArea.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color: rgba(120,120,140,.95);">まず音声でスタート</div>
        <button class="audioBtn" id="modalReplay" style="width:100%;">🔈 もう一度再生</button>
        <button class="pillBtn" id="modalShowJp" style="width:100%;">日本語を表示</button>
        <div class="hint">（カード面タップでも日本語を表示）</div>
      </div>
    `;
    document.getElementById("modalReplay").onclick = (e) => {
      e.stopPropagation();
      playAudio(card.audioUrl, card.id);
    };
    document.getElementById("modalShowJp").onclick = (e) => {
      e.stopPropagation();
      modalStartMode = "jp";
      renderModal();
    };
    return;
  }

  cardArea.innerHTML = `
    <p class="en">${escapeHtml(card.en)}</p>
    <p class="ipa">${escapeHtml(card.ipa)}</p>
    <div class="hint">（タップで表面へ）</div>
  `;
}

// =========================
//  Study (Swipe) - front fixed (jp/audio)
// =========================
studyBackTopBtn.addEventListener("click", showTop);

function renderStudyCard(){
  const total = studyDeck.length;
  const cur = Math.min(studyIndex + 1, total);
  studyCounterEl.textContent = `${total === 0 ? 0 : cur} / ${total}`;

  const card = studyDeck[studyIndex];
  if (!card) {
    studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
    studyCardEl.innerHTML = `
      <p class="jpBig">このフィルタのカードは終わり！</p>
      <div class="tapHint">トップに戻ってフィルタやテーマを変えてね</div>
    `;
    return;
  }

  if (!studyShowBack) {
    if (studyFrontMode === "jp") {
      studyCardEl.innerHTML = `
        <p class="jpBig">${escapeHtml(card.jp)}</p>
        <div class="tapHint">タップで裏面（英語＋IPA） / スワイプで判定</div>
      `;
    } else {
      // audio front
      studyCardEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:12px; color: rgba(120,120,140,.95);">音声からスタート</div>
          <button class="audioBtn" id="studyReplay" style="width:100%; padding:12px 14px; font-size:14px;">🔈 再生</button>
          <button class="pillBtn" id="studyShowJp" style="width:100%; padding:12px 14px; font-size:14px;">日本語を表示</button>
          <div class="tapHint">（カード面タップでも日本語を表示）</div>
        </div>
      `;
      document.getElementById("studyReplay").onclick = (e) => {
        e.stopPropagation();
        playAudio(card.audioUrl, card.id);
      };
      document.getElementById("studyShowJp").onclick = (e) => {
        e.stopPropagation();
        // 音声モードでも、日本語を見てから裏面に行けるように
        studyFrontMode = "jp";
        renderStudyCard();
        // 戻したくなったらトップから入り直す運用（要望があれば“カード単位で固定”に変更可）
      };

      // 自動再生は環境でブロックされやすいので silent で試すだけ
      playAudio(card.audioUrl, card.id, { silent: true });
    }
  } else {
    studyCardEl.innerHTML = `
      <p class="enBig">${escapeHtml(card.en)}</p>
      <p class="ipaBig">${escapeHtml(card.ipa)}</p>
      <div class="tapHint">タップで表面へ / スワイプで判定</div>
    `;
  }

  studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
}

function decideStudy(statusKey){
  const card = studyDeck[studyIndex];
  if (!card) return;

  setStatus(card.id, statusKey);

  studyIndex += 1;
  studyShowBack = false;
  renderStudyCard();
}

// tap behavior
studyCardEl.addEventListener("click", () => {
  const card = studyDeck[studyIndex];
  if (!card) return;

  if (!studyShowBack && studyFrontMode === "audio") {
    // audio front: tap => show jp (without flipping to back)
    studyFrontMode = "jp";
    renderStudyCard();
    return;
  }

  studyShowBack = !studyShowBack;
  renderStudyCard();
});

studyAudioBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const card = studyDeck[studyIndex];
  if (!card) return;
  playAudio(card.audioUrl, card.id);
});

actionUnknown.addEventListener("click", () => decideStudy("unknown"));
actionAmbiguous.addEventListener("click", () => decideStudy("ambiguous"));
actionKnown.addEventListener("click", () => decideStudy("known"));

// swipe gesture via pointer events
let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;

studyCardEl.addEventListener("pointerdown", (e) => {
  const card = studyDeck[studyIndex];
  if (!card) return;

  dragging = true;
  sx = e.clientX;
  sy = e.clientY;
  dx = 0;
  dy = 0;
  studyCardEl.setPointerCapture(e.pointerId);
});

studyCardEl.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  dx = e.clientX - sx;
  dy = e.clientY - sy;

  const rot = Math.max(-12, Math.min(12, dx / 18));
  studyCardEl.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
});

studyCardEl.addEventListener("pointerup", () => {
  if (!dragging) return;
  dragging = false;

  const TH = 90;
  if (dx > TH)  return decideStudy("known");
  if (dx < -TH) return decideStudy("unknown");
  if (dy < -TH) return decideStudy("ambiguous");

  studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
});

// =========================
//  Events (top -> picker / list / study)
// =========================
pickerBackTopBtn.addEventListener("click", showTop);

// =========================
//  Load + Init
// =========================
async function loadCards(){
  const res = await fetch("./cards.json");
  if (!res.ok) throw new Error("cards.json が読み込めませんでした");
  CARDS = await res.json();
  buildThemes();
}

async function init(){
  await loadCards();

  // restore last theme if possible
  const last = loadText(STORAGE_KEY_LAST_THEME, "");
  if (last && THEMES.some(t => t.themeKey === last)) currentThemeKey = last;

  // initial: always top
  showTop();

  // wire list back
  listBackTopBtn.addEventListener("click", showTop);

  // top -> picker
  goThemeSelectBtn.addEventListener("click", showPicker);

  // top mode buttons already wired

  // Service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }
}

init().catch((e) => {
  console.error(e);
  alert("初期化に失敗しました。cards.json の場所やJSON形式を確認してください。");
});
