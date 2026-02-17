// =========================
//  Settings / Storage Keys
// =========================
const STORAGE_KEY_STATUS     = "cardapp_status_v1";        // { [id]: "known"|"ambiguous"|"unknown" }
const STORAGE_KEY_LAST_THEME = "cardapp_last_theme_v1";    // "theme01"
const STORAGE_KEY_RECENT     = "cardapp_recent_themes_v1"; // ["theme01", ...]

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
let currentFilter   = "unknown";
let modalCardId     = null;
let showBack        = false;

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

function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

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

  // update UI
  if (screenStudy.classList.contains("show")) {
    // in study mode, just rerender study + counter
    renderStudyCard();
  }
  renderThemeTable();
  renderModal();
}

function playAudio(url, cardId) {
  if (!url) return alert("audioUrl が未設定です（cards.jsonを確認）");

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
    alert("音声を再生できませんでした（パス/拡張子/アップロード場所を確認）");
  });
}

// =========================
//  DOM
// =========================
const titleEl     = document.getElementById("title");
const subtitleEl  = document.getElementById("subtitle");

const screenPicker = document.getElementById("screenPicker");
const screenTheme  = document.getElementById("screenTheme");
const themeToolbar = document.getElementById("themeToolbar");

const backBtn   = document.getElementById("backBtn");
const tabsEl    = document.getElementById("tabs");
const tbodyEl   = document.getElementById("tbody");

const themeSearch = document.getElementById("themeSearch");
const recentGrid  = document.getElementById("recentGrid");
const themeGrid   = document.getElementById("themeGrid");

// modal
const overlayEl     = document.getElementById("overlay");
const closeBtn      = document.getElementById("closeBtn");
const cardArea      = document.getElementById("cardArea");
const modalBadge    = document.getElementById("modalBadge");
const modalTheme    = document.getElementById("modalTheme");
const statusBtns    = document.getElementById("statusBtns");
const modalAudioBtn = document.getElementById("modalAudioBtn");

// study
const screenStudy     = document.getElementById("screenStudy");
const studyBtn        = document.getElementById("studyBtn");
const studyBackBtn    = document.getElementById("studyBackBtn");
const studyCardEl     = document.getElementById("studyCard");
const studyAudioBtn   = document.getElementById("studyAudioBtn");
const studyCounterEl  = document.getElementById("studyCounter");
const actionUnknown   = document.getElementById("actionUnknown");
const actionAmbiguous = document.getElementById("actionAmbiguous");
const actionKnown     = document.getElementById("actionKnown");

// =========================
//  Data -> Themes
// =========================
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
  return (THEMES.find(t => t.themeKey === themeKey)?.themeName) || themeKey;
}

// =========================
//  Navigation
// =========================
function showPicker() {
  currentThemeKey = null;

  screenPicker.classList.add("show");
  screenTheme.classList.remove("show");
  screenStudy.classList.remove("show");

  themeToolbar.style.display = "none";

  titleEl.textContent = "英作文カード";
  subtitleEl.textContent = "テーマを選択してください";

  renderPicker();
}

function pushRecent(themeKey) {
  let arr = loadJSON(STORAGE_KEY_RECENT, []);
  arr = [themeKey, ...arr.filter(x => x !== themeKey)].slice(0, 6);
  saveJSON(STORAGE_KEY_RECENT, arr);
}

function showTheme(themeKey) {
  currentThemeKey = themeKey;
  localStorage.setItem(STORAGE_KEY_LAST_THEME, themeKey);
  pushRecent(themeKey);

  screenPicker.classList.remove("show");
  screenStudy.classList.remove("show");
  screenTheme.classList.add("show");

  themeToolbar.style.display = "flex";

  titleEl.textContent = themeNameByKey(themeKey);
  subtitleEl.textContent = "ステータスで絞り込み → 行タップでカード";

  renderTabs();
  renderThemeTable();
}

backBtn.addEventListener("click", showPicker);

// =========================
//  Picker UI
// =========================
function themeButton(t) {
  const btn = document.createElement("button");
  btn.className = "themeBtn";
  btn.innerHTML = `
    <p class="themeTitle">${escapeHtml(t.themeName)}</p>
    <p class="themeMeta">${t.count} cards</p>
  `;
  btn.onclick = () => showTheme(t.themeKey);
  return btn;
}

function renderPicker() {
  const q = (themeSearch.value || "").trim().toLowerCase();
  const filtered = THEMES.filter(t => t.themeName.toLowerCase().includes(q));

  // recent
  const recentKeys = loadJSON(STORAGE_KEY_RECENT, []);
  const recent = recentKeys
    .map(k => THEMES.find(t => t.themeKey === k))
    .filter(Boolean)
    .filter(t => t.themeName.toLowerCase().includes(q));

  recentGrid.innerHTML = "";
  if (recent.length === 0) {
    recentGrid.innerHTML = `<div style="color:rgba(120,120,140,.9);grid-column:1/-1;">（まだありません）</div>`;
  } else {
    recent.forEach(t => recentGrid.appendChild(themeButton(t)));
  }

  // all
  themeGrid.innerHTML = "";
  if (filtered.length === 0) {
    themeGrid.innerHTML = `<div style="color:rgba(120,120,140,.9);grid-column:1/-1;">一致するテーマがありません。</div>`;
  } else {
    filtered.forEach(t => themeGrid.appendChild(themeButton(t)));
  }
}

themeSearch.addEventListener("input", renderPicker);

// =========================
//  Tabs UI
// =========================
function renderTabs() {
  tabsEl.innerHTML = "";
  STATUSES.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "tab" + (currentFilter === s.key ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = () => {
      currentFilter = s.key;
      renderThemeTable();
      // if in study mode, rebuild deck (we do it when entering)
    };
    tabsEl.appendChild(btn);
  });
}

// =========================
//  Theme Table UI
// =========================
function renderThemeTable() {
  tbodyEl.innerHTML = "";

  if (!currentThemeKey) return;

  const rows = CARDS
    .filter(c => c.themeKey === currentThemeKey)
    .filter(c => getStatus(c.id) === currentFilter);

  rows.forEach(card => {
    const tr = document.createElement("tr");

    const tdJp = document.createElement("td");
    tdJp.className = "jpCell";
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
    td1.textContent = "このステータスのカードはまだありません。";
    td2.textContent = "";
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbodyEl.appendChild(tr);
  }
}

// =========================
//  Modal UI
// =========================
function openModal(cardId) {
  modalCardId = cardId;
  showBack = false;
  overlayEl.classList.add("show");
  renderModal();
}

function closeModal() {
  overlayEl.classList.remove("show");
  modalCardId = null;
}

closeBtn.addEventListener("click", closeModal);
overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeModal(); });

cardArea.addEventListener("click", () => {
  if (!modalCardId) return;
  showBack = !showBack;
  renderModal();
});

modalAudioBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const card = CARDS.find(c => c.id === modalCardId);
  if (!card) return;
  playAudio(card.audioUrl, card.id);
});

function renderModal() {
  if (!modalCardId) return;
  const card = CARDS.find(c => c.id === modalCardId);
  if (!card) return;

  const st = getStatus(card.id);
  modalBadge.textContent = statusLabel(st);
  modalTheme.textContent = themeNameByKey(card.themeKey);

  statusBtns.innerHTML = "";
  STATUSES.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "sbtn" + (st === s.key ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = (e) => { e.stopPropagation(); setStatus(card.id, s.key); };
    statusBtns.appendChild(btn);
  });

  if (!showBack) {
    cardArea.innerHTML = `
      <p class="big">${escapeHtml(card.jp)}</p>
      <div class="hint">（タップで裏面：英語＋IPA）</div>
    `;
  } else {
    cardArea.innerHTML = `
      <p class="en">${escapeHtml(card.en)}</p>
      <p class="ipa">${escapeHtml(card.ipa)}</p>
      <div class="hint">（タップで表面：日本語＋音声）</div>
    `;
  }
}

// =========================
//  Study Mode (Swipe)
// =========================
let studyDeck = [];
let studyIndex = 0;
let studyShowBack = false;

function enterStudyMode() {
  if (!currentThemeKey) return;

  // current filter only (unknown / ambiguous / known)
  studyDeck = CARDS
    .filter(c => c.themeKey === currentThemeKey)
    .filter(c => getStatus(c.id) === currentFilter);

  studyIndex = 0;
  studyShowBack = false;

  screenTheme.classList.remove("show");
  screenStudy.classList.add("show");
  themeToolbar.style.display = "none";

  titleEl.textContent = `${themeNameByKey(currentThemeKey)}`;
  subtitleEl.textContent = "スワイプで判定（タップで表⇄裏）";

  renderStudyCard();
}

function exitStudyMode() {
  screenStudy.classList.remove("show");
  screenTheme.classList.add("show");
  themeToolbar.style.display = "flex";

  titleEl.textContent = themeNameByKey(currentThemeKey);
  subtitleEl.textContent = "ステータスで絞り込み → 行タップでカード";

  renderThemeTable();
}

studyBtn.addEventListener("click", enterStudyMode);
studyBackBtn.addEventListener("click", exitStudyMode);

function renderStudyCard() {
  const total = studyDeck.length;
  const current = Math.min(studyIndex + 1, total);
  studyCounterEl.textContent = `${total === 0 ? 0 : current} / ${total}`;

  const card = studyDeck[studyIndex];
  if (!card) {
    studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
    studyCardEl.innerHTML = `
      <p class="jpBig">このタブのカードは終わり！</p>
      <div class="tapHint">別のタブに切り替えるか、戻ってカードを追加してね</div>
    `;
    return;
  }

  if (!studyShowBack) {
    studyCardEl.innerHTML = `
      <p class="jpBig">${escapeHtml(card.jp)}</p>
      <div class="tapHint">タップで裏面（英語＋IPA）</div>
    `;
  } else {
    studyCardEl.innerHTML = `
      <p class="enBig">${escapeHtml(card.en)}</p>
      <p class="ipaBig">${escapeHtml(card.ipa)}</p>
      <div class="tapHint">タップで表面（日本語）</div>
    `;
  }

  studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
}

function decideStudy(statusKey) {
  const card = studyDeck[studyIndex];
  if (!card) return;

  setStatus(card.id, statusKey);

  studyIndex += 1;
  studyShowBack = false;
  renderStudyCard();
}

studyCardEl.addEventListener("click", () => {
  const card = studyDeck[studyIndex];
  if (!card) return;
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

  const TH = 90; // threshold
  if (dx > TH)  return decideStudy("known");       // right
  if (dx < -TH) return decideStudy("unknown");     // left
  if (dy < -TH) return decideStudy("ambiguous");   // up

  // reset
  studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
});

// =========================
//  Load + Init
// =========================
async function loadCards() {
  const res = await fetch("./cards.json");
  if (!res.ok) throw new Error("cards.json が読み込めませんでした");
  CARDS = await res.json();
  buildThemes();
}

async function init() {
  await loadCards();

  renderPicker();

  const last = localStorage.getItem(STORAGE_KEY_LAST_THEME);
  if (last && THEMES.some(t => t.themeKey === last)) {
    showTheme(last);
  } else {
    showPicker();
  }

  // Service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }
}

init().catch((e) => {
  console.error(e);
  alert("初期化に失敗しました。cards.json の場所やJSON形式を確認してください。");
});
