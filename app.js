const STORAGE_KEY_STATUS     = "cardapp_status_v1";
const STORAGE_KEY_LAST_THEME = "cardapp_last_theme_v1";
const STORAGE_KEY_RECENT     = "cardapp_recent_themes_v1";

const STATUSES = [
  { key: "unknown",   label: "覚えていない" },
  { key: "ambiguous", label: "曖昧" },
  { key: "known",     label: "覚えた" },
];

let CARDS = [];
let THEMES = [];
let currentThemeKey = null;

// modal
let modalCardId = null;
let showBack = false;
let modalStartMode = "start"; // start | jp | audio

// study
let studyDeck = [];
let studyIndex = 0;
let studyShowBack = false;
// start | audio | jp
let studyFrontMode = "start";

// audio
let audio = new Audio();
let nowPlayingId = null;

// ---------- utils ----------
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

  renderList();
  renderModal();
  if (screenStudy.classList.contains("show")) renderStudyCard();
}
function playAudio(url, cardId, { silent = false } = {}) {
  if (!url) { if (!silent) alert("audioUrl が未設定です"); return; }

  if (nowPlayingId === cardId && !audio.paused) {
    audio.pause(); audio.currentTime = 0; nowPlayingId = null; return;
  }
  nowPlayingId = cardId;
  audio.pause(); audio.currentTime = 0;
  audio.src = url;
  audio.play().catch(() => { if (!silent) alert("音声を再生できませんでした"); });
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
function themeLabel(themeKey) {
  // theme01 -> 01
  const m = String(themeKey || "").match(/theme(\d+)/i);
  const num = m ? String(m[1]).padStart(2, "0") : "";
  const name = themeNameByKey(themeKey);
  return num ? `${num} ${name}` : name;
}
function hasThemeSelected() {
  return !!currentThemeKey && THEMES.some(t => t.themeKey === currentThemeKey);
}
function pushRecent(themeKey) {
  let arr = loadJSON(STORAGE_KEY_RECENT, []);
  arr = [themeKey, ...arr.filter(x => x !== themeKey)].slice(0, 6);
  saveJSON(STORAGE_KEY_RECENT, arr);
}

// ---------- DOM ----------
const subtitleEl = document.getElementById("subtitle");

// tabs
const tabTopBtn  = document.getElementById("tabTop");
const tabListBtn = document.getElementById("tabList");

// screens
const screenTop    = document.getElementById("screenTop");
const screenPicker = document.getElementById("screenPicker");
const screenList   = document.getElementById("screenList");
const screenStudy  = document.getElementById("screenStudy");

// top
const selectedThemeText = document.getElementById("selectedThemeText");
const goThemeSelectBtn  = document.getElementById("goThemeSelectBtn");
const startSwipeBtn     = document.getElementById("startSwipeBtn");
const topHint           = document.getElementById("topHint");

// picker
const pickerBackBtn = document.getElementById("pickerBackBtn");
const themeSearch   = document.getElementById("themeSearch");
const recentGrid    = document.getElementById("recentGrid");
const themeGrid     = document.getElementById("themeGrid");
const pickerCount   = document.getElementById("pickerCount");

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
const studyBackBtn   = document.getElementById("studyBackBtn");
const studyCardEl    = document.getElementById("studyCard");
const studyAudioBtn  = document.getElementById("studyAudioBtn");
const studyCounterEl = document.getElementById("studyCounter");
const actionUnknown  = document.getElementById("actionUnknown");
const actionAmbiguous= document.getElementById("actionAmbiguous");
const actionKnown    = document.getElementById("actionKnown");

// ---------- navigation ----------
function hideAll() {
  screenTop.classList.remove("show");
  screenPicker.classList.remove("show");
  screenList.classList.remove("show");
  screenStudy.classList.remove("show");
}
function setTabActive(which) {
  tabTopBtn.classList.toggle("active", which === "top");
  tabListBtn.classList.toggle("active", which === "list");
}
function showTop() {
  hideAll();
  screenTop.classList.add("show");
  subtitleEl.textContent = "Practice your speech";
  setTabActive("top");
  renderTop();
}
function showListScreen() {
  hideAll();
  screenList.classList.add("show");
  subtitleEl.textContent = "List";
  setTabActive("list");
  renderList();
}
function showPicker() {
  hideAll();
  screenPicker.classList.add("show");
  subtitleEl.textContent = "Choose a theme";
  setTabActive("top");
  renderPicker();
}
function showStudy() {
  if (!hasThemeSelected()) return;
  hideAll();
  screenStudy.classList.add("show");
  subtitleEl.textContent = ""; // ←「スワイプ」文字は出さない
  setTabActive("top");

  studyDeck = CARDS.filter(c => c.themeKey === currentThemeKey);
  studyIndex = 0;
  studyShowBack = false;
  studyFrontMode = "start";

  renderStudyCard();
}

// tab clicks
tabTopBtn.addEventListener("click", showTop);
tabListBtn.addEventListener("click", showListScreen);

// ---------- top ----------
function renderTop() {
  const ok = hasThemeSelected();
  selectedThemeText.textContent = ok ? themeNameByKey(currentThemeKey) : "未選択";
  startSwipeBtn.disabled = !ok;
  startSwipeBtn.style.opacity = ok ? "1" : ".45";
  topHint.textContent = ok ? "開始を押すとスワイプが始まります。" : "テーマを選んでください。";
}
goThemeSelectBtn.addEventListener("click", showPicker);
startSwipeBtn.addEventListener("click", showStudy);

// ---------- picker ----------
function themeButton(t) {
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
function renderPicker() {
  const q = (themeSearch.value || "").trim().toLowerCase();
  const filtered = THEMES.filter(t => t.themeName.toLowerCase().includes(q));

  const recentKeys = loadJSON(STORAGE_KEY_RECENT, []);
  const recent = recentKeys
    .map(k => THEMES.find(t => t.themeKey === k))
    .filter(Boolean)
    .filter(t => t.themeName.toLowerCase().includes(q));

  pickerCount.textContent = `${THEMES.length} themes`;

  recentGrid.innerHTML = "";
  if (recent.length === 0) recentGrid.innerHTML = `<div style="color:rgba(120,120,140,.9);grid-column:1/-1;">（まだありません）</div>`;
  else recent.forEach(t => recentGrid.appendChild(themeButton(t)));

  themeGrid.innerHTML = "";
  if (filtered.length === 0) themeGrid.innerHTML = `<div style="color:rgba(120,120,140,.9);grid-column:1/-1;">一致するテーマがありません。</div>`;
  else filtered.forEach(t => themeGrid.appendChild(themeButton(t)));
}
themeSearch.addEventListener("input", renderPicker);
pickerBackBtn.addEventListener("click", showTop);

// ---------- list ----------
function renderList() {
  tbodyEl.innerHTML = "";

  if (!hasThemeSelected()) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.style.color = "rgba(120,120,140,.95)";
    td.textContent = "トップでテーマを選択してください。";
    tr.appendChild(td);
    tbodyEl.appendChild(tr);
    return;
  }

  const cards = CARDS.filter(c => c.themeKey === currentThemeKey);
  if (cards.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.style.color = "rgba(120,120,140,.95)";
    td.textContent = "このテーマのカードがありません。";
    tr.appendChild(td);
    tbodyEl.appendChild(tr);
    return;
  }

  cards.forEach(card => {
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
    b.onclick = (e) => { e.stopPropagation(); playAudio(card.audioUrl, card.id); };
    tdAu.appendChild(b);

    tr.appendChild(tdJp);
    tr.appendChild(tdAu);
    tbodyEl.appendChild(tr);
  });
}

// ---------- modal ----------
function openModal(cardId) {
  modalCardId = cardId;
  showBack = false;
  modalStartMode = "start";
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

function renderModal() {
  if (!modalCardId) return;
  const card = CARDS.find(c => c.id === modalCardId);
  if (!card) return;

  modalBadge.textContent = statusLabel(getStatus(card.id));
  modalTheme.textContent = themeNameByKey(card.themeKey);

  statusBtns.innerHTML = "";
  STATUSES.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "sbtn" + (getStatus(card.id) === s.key ? " active" : "");
    btn.textContent = s.label;
    btn.onclick = (e) => { e.stopPropagation(); setStatus(card.id, s.key); };
    statusBtns.appendChild(btn);
  });

  if (!showBack && modalStartMode === "start") {
    cardArea.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color:rgba(120,120,140,.95);">どちらから始める？</div>
        <button class="primaryBtn" id="modalChooseJp" style="width:100%;">日本語</button>
        <button class="audioBtn" id="modalChooseAudio" style="width:100%;">🔈 音声</button>
      </div>
    `;
    document.getElementById("modalChooseJp").onclick = (e) => { e.stopPropagation(); modalStartMode = "jp"; renderModal(); };
    document.getElementById("modalChooseAudio").onclick = (e) => { e.stopPropagation(); modalStartMode = "audio"; playAudio(card.audioUrl, card.id); renderModal(); };
    return;
  }

  if (!showBack && modalStartMode === "jp") {
    cardArea.innerHTML = `<p class="big">${escapeHtml(card.jp)}</p><div class="tapHint">タップで英語＋IPA</div>`;
    return;
  }

  if (!showBack && modalStartMode === "audio") {
    cardArea.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color:rgba(120,120,140,.95);">まず音声でスタート</div>
        <button class="audioBtn" id="modalReplay" style="width:100%;">🔈 もう一度再生</button>
        <button class="pillBtn" id="modalShowJp" style="width:100%;">日本語を表示</button>
      </div>
    `;
    document.getElementById("modalReplay").onclick = (e) => { e.stopPropagation(); playAudio(card.audioUrl, card.id); };
    document.getElementById("modalShowJp").onclick = (e) => { e.stopPropagation(); modalStartMode = "jp"; renderModal(); };
    return;
  }

  cardArea.innerHTML = `
    <p class="en">${escapeHtml(card.en)}</p>
    <p class="ipa">${escapeHtml(card.ipa)}</p>
    <div class="tapHint">タップで表面へ</div>
  `;
}

// ---------- study ----------
studyBackBtn.addEventListener("click", showTop);

function renderStudyCard() {
  const total = studyDeck.length;
  const cur = Math.min(studyIndex + 1, total);
  studyCounterEl.textContent = `${total === 0 ? 0 : cur} / ${total}`;

  const card = studyDeck[studyIndex];
  if (!card) {
    studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
    studyCardEl.innerHTML = `<p class="enBig">Done!</p><p class="ipaBig">Back to Top</p>`;
    return;
  }

  if (!studyShowBack) {
    // start
    if (studyFrontMode === "start") {
      studyCardEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:12px; color:rgba(120,120,140,.95);">${escapeHtml(themeLabel(currentThemeKey))}</div>
          <button class="audioBtn" id="studyChooseAudio" style="width:100%; padding:12px 14px; font-size:14px;">🔈 音声再生</button>
          <button class="pillBtn" id="studyChooseJp" style="width:100%; padding:12px 14px; font-size:14px;">日本語表示</button>
          <div class="tapHint">選んだ後：タップで英語＋IPA / スワイプで判定</div>
        </div>
      `;
      document.getElementById("studyChooseAudio").onclick = (e) => {
        e.stopPropagation();
        studyFrontMode = "audio";
        playAudio(card.audioUrl, card.id);
        renderStudyCard();
      };
      document.getElementById("studyChooseJp").onclick = (e) => {
        e.stopPropagation();
        studyFrontMode = "jp";
        renderStudyCard();
      };
      studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
      return;
    }

    // audio front
    if (studyFrontMode === "audio") {
      studyCardEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:12px; color:rgba(120,120,140,.95);">${escapeHtml(themeLabel(currentThemeKey))}</div>
          <button class="audioBtn" id="studyReplay" style="width:100%; padding:12px 14px; font-size:14px;">🔈 再生</button>
          <button class="pillBtn" id="studyShowJp" style="width:100%; padding:12px 14px; font-size:14px;">日本語表示</button>
          <div class="tapHint">タップで英語＋IPA / スワイプで判定</div>
        </div>
      `;
      document.getElementById("studyReplay").onclick = (e) => { e.stopPropagation(); playAudio(card.audioUrl, card.id); };
      document.getElementById("studyShowJp").onclick = (e) => { e.stopPropagation(); studyFrontMode = "jp"; renderStudyCard(); };
      playAudio(card.audioUrl, card.id, { silent: true });
      studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
      return;
    }

    // jp front
    studyCardEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color:rgba(120,120,140,.95);">${escapeHtml(themeLabel(currentThemeKey))}</div>
        <p class="jpBig">${escapeHtml(card.jp)}</p>
        <div class="tapHint">タップで英語＋IPA / スワイプで判定</div>
      </div>
    `;
    studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
    return;
  }

  // back
  studyCardEl.innerHTML = `
    <p class="enBig">${escapeHtml(card.en)}</p>
    <p class="ipaBig">${escapeHtml(card.ipa)}</p>
    <div class="tapHint">タップで表面へ / スワイプで判定</div>
  `;
  studyCardEl.style.transform = "translate(0px,0px) rotate(0deg)";
}

studyCardEl.addEventListener("click", () => {
  const card = studyDeck[studyIndex];
  if (!card) return;

  // start状態はタップ無効（誤操作防止）
  if (!studyShowBack && studyFrontMode === "start") return;

  studyShowBack = !studyShowBack;
  renderStudyCard();
});

studyAudioBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const card = studyDeck[studyIndex];
  if (!card) return;
  playAudio(card.audioUrl, card.id);
});

function decideStudy(statusKey) {
  const card = studyDeck[studyIndex];
  if (!card) return;
  setStatus(card.id, statusKey);
  studyIndex += 1;
  studyShowBack = false;
  studyFrontMode = "start";
  renderStudyCard();
}

actionUnknown.addEventListener("click", () => decideStudy("unknown"));
actionAmbiguous.addEventListener("click", () => decideStudy("ambiguous"));
actionKnown.addEventListener("click", () => decideStudy("known"));

// swipe gesture
let sx=0, sy=0, dx=0, dy=0, dragging=false;

studyCardEl.addEventListener("pointerdown", (e) => {
  const card = studyDeck[studyIndex];
  if (!card) return;

  // start状態はスワイプ無効（誤判定防止）
  if (!studyShowBack && studyFrontMode === "start") return;

  dragging = true;
  sx = e.clientX; sy = e.clientY;
  dx = 0; dy = 0;
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

// ---------- load + init ----------
async function loadCards() {
  const res = await fetch("./cards.json?ts=" + Date.now());
  if (!res.ok) throw new Error("cards.json が読み込めませんでした");
  CARDS = await res.json();
  buildThemes();
}

function pickDefaultTheme() {
  const saved = loadText(STORAGE_KEY_LAST_THEME, "");
  if (saved && THEMES.some(t => t.themeKey === saved)) return saved;

  const byName = THEMES.find(t => (t.themeName || "").includes("自己紹介"));
  if (byName) return byName.themeKey;

  const byKey = THEMES.find(t => t.themeKey === "theme01");
  if (byKey) return byKey.themeKey;

  return THEMES[0]?.themeKey || null;
}

async function init() {
  await loadCards();

  currentThemeKey = pickDefaultTheme();
  if (currentThemeKey) saveText(STORAGE_KEY_LAST_THEME, currentThemeKey);

  showTop();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }
}

function renderTop() {
  const ok = hasThemeSelected();
  selectedThemeText.textContent = ok ? themeNameByKey(currentThemeKey) : "未選択";
  startSwipeBtn.disabled = !ok;
  startSwipeBtn.style.opacity = ok ? "1" : ".45";
  topHint.textContent = ok ? "開始を押すとスワイプが始まります。" : "テーマを選んでください。";
}

init().catch((e) => {
  console.error(e);
  alert("初期化に失敗しました。cards.json の場所やJSON形式を確認してください。");
});
