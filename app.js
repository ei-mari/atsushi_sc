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

// modal state
let modalCardId = null;
let showBack = false;
// "start" | "jp" | "audio"
let modalStartMode = "start";

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
//  Modal UI (start choice: 日本語 / 🔈)
// =========================
function openModal(cardId) {
  modalCardId = cardId;
  showBack = false;
  modalStartMode = "start"; // ← ここが追加ポイント
  overlayEl.classList.add("show");
  renderModal();
}

function closeModal() {
  overlayEl.classList.remove("show");
  modalCardId = null;
}

closeBtn.addEventListener("click", closeModal);
overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeModal(); });

// カード面タップの挙動を「開始状態」に対応させる
cardArea.addEventListener("click", () => {
  if (!modalCardId) return;

  // まだ選択してないならタップでは何もしない
  if (modalStartMode === "start") return;

  // 音声スタート中のタップは「日本語表示」にする（裏面へは飛ばさない）
  if (!showBack && modalStartMode === "audio") {
    modalStartMode = "jp";
    renderModal();
    return;
  }

  // 通常の表⇄裏
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

  // status buttons
  statusBtns.innerHTML = "";
  STATUSES.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "sbtn" + (st === s.key ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = (e) => { e.stopPropagation(); setStatus(card.id, s.key); };
    statusBtns.appendChild(btn);
  });

  // 開始画面：日本語 / 🔈 を選ぶ
  if (!showBack && modalStartMode === "start") {
    cardArea.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color: rgba(120,120,140,.95);">どちらから始める？</div>
        <button class="primaryBtn" id="modalChooseJp" style="width:100%; padding:12px 14px; font-size:14px;">日本語</button>
        <button class="audioBtn" id="modalChooseAudio" style="width:100%; padding:12px 14px; font-size:14px;">🔈 音声</button>
        <div class="hint">選んだ後はタップで裏面（英語＋IPA）へ</div>
      </div>
    `;

    const chooseJp = document.getElementById("modalChooseJp");
    const chooseAudio = document.getElementById("modalChooseAudio");

    chooseJp.onclick = (e) => {
      e.stopPropagation();
      modalStartMode = "jp";
      renderModal();
    };

    chooseAudio.onclick = (e) => {
      e.stopPropagation();
      modalStartMode = "audio";
      playAudio(card.audioUrl, card.id);
      renderModal();
    };

    return;
  }

  // 表面（日本語）
  if (!showBack && modalStartMode === "jp") {
    cardArea.innerHTML = `
      <p class="big">${escapeHtml(card.jp)}</p>
      <div class="hint">（タップで裏面：英語＋IPA）</div>
    `;
    return;
  }

  // 表面（音声スタート）
  if (!showBack && modalStartMode === "audio") {
    cardArea.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color: rgba(120,120,140,.95);">まず音声でスタート</div>
        <button class="audioBtn" id="modalReplay" style="width:100%; padding:12px 14px; font-size:14px;">🔈 もう一度再生</button>
        <button class="pillBtn" id="modalShowJp" style="width:100%; padding:12px 14px; font-size:14px;">日本語を表示</button>
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

  // 裏面（英語＋IPA）
  cardArea.innerHTML = `
    <p class="en">${escapeHtml(card.en)}</p>
    <p class="ipa">${escapeHtml(card.ipa)}</p>
    <div class="hint">（タップで表面へ）</div>
  `;
}

// =========================
//  Study Mode (Swipe)  start choice: 日本語 / 🔈
// =========================
let studyDeck = [];
let studyIndex = 0;
let studyShowBack = false;
// "start" | "jp" | "audio"
let studyStartMode = "start";

function enterStudyMode() {
  if (!currentThemeKey) return;

  studyDeck = CARDS
    .filter(c => c.themeKey === currentThemeKey)
    .filter(c => getStatus(c.id) === currentFilter);

  studyIndex = 0;
  studyShowBack = false;
  studyStartMode = "start";

  screenTheme.classList.remove("show");
  screenStudy.classList.add("show");
  themeToolbar.style.display = "none";

  titleEl.textContent = `${themeNameByKey(currentThemeKey)}`;
  subtitleEl.textContent = "スワイプで判定（まず日本語/音声を選択）";

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

  // 開始選択
  if (!studyShowBack && studyStartMode === "start") {
    studyCardEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color: rgba(120,120,140,.95);">どちらから始める？</div>
        <button class="primaryBtn" id="studyChooseJp" style="width:100%; padding:12px 14px; font-size:14px;">日本語</button>
        <button class="audioBtn" id="studyChooseAudio" style="width:100%; padding:12px 14px; font-size:14px;">🔈 音声</button>
        <div class="tapHint">選択後：タップで裏面 / スワイプで判定</div>
      </div>
    `;
    document.getElementById("studyChooseJp").onclick = (e) => {
      e.stopPropagation();
      studyStartMode = "jp";
      renderStudyCard();
    };
    document.getElementById("studyChooseAudio").onclick = (e) => {
      e.stopPropagation();
      studyStartMode = "audio";
      playAudio(card.audioUrl, card.id);
      renderStudyCard();
    };
    studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
    return;
  }

  // 表面（日本語）
  if (!studyShowBack && studyStartMode === "jp") {
    studyCardEl.innerHTML = `
      <p class="jpBig">${escapeHtml(card.jp)}</p>
      <div class="tapHint">タップで裏面（英語＋IPA） / スワイプで判定</div>
    `;
    studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
    return;
  }

  // 表面（音声スタート）
  if (!studyShowBack && studyStartMode === "audio") {
    studyCardEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color: rgba(120,120,140,.95);">まず音声でスタート</div>
        <button class="audioBtn" id="studyReplay" style="width:100%; padding:12px 14px; font-size:14px;">🔈 もう一度再生</button>
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
      studyStartMode = "jp";
      renderStudyCard();
    };
    studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
    return;
  }

  // 裏面（英語＋IPA）
  studyCardEl.innerHTML = `
    <p class="enBig">${escapeHtml(card.en)}</p>
    <p class="ipaBig">${escapeHtml(card.ipa)}</p>
    <div class="tapHint">タップで表面へ戻る / スワイプで判定</div>
  `;
  studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
}

function decideStudy(statusKey) {
  const card = studyDeck[studyIndex];
  if (!card) return;

  setStatus(card.id, statusKey);

  studyIndex += 1;
  studyShowBack = false;
  studyStartMode = "start";
  renderStudyCard();
}

// study card tap behavior
studyCardEl.addEventListener("click", () => {
  const card = studyDeck[studyIndex];
  if (!card) return;

  // 未選択ならタップ無効
  if (studyStartMode === "start") return;

  // 音声スタート中はタップ＝日本語表示
  if (!studyShowBack && studyStartMode === "audio") {
    studyStartMode = "jp";
    renderStudyCard();
    return;
  }

  // 通常：表⇄裏
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

  // 開始選択中はスワイプさせない（誤操作防止）
  if (studyStartMode === "start") return;

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
