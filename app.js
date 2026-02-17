const STORAGE_KEY_STATUS = "cardapp_status_v1";
const STORAGE_KEY_LAST_THEME = "cardapp_last_theme_v1";
const STORAGE_KEY_RECENT = "cardapp_recent_themes_v1";

const STATUSES = [
  { key:"unknown", label:"覚えていない" },
  { key:"ambiguous", label:"曖昧" },
  { key:"known", label:"覚えた" },
];

let CARDS = [];
let THEMES = [];

let currentThemeKey = null;
let currentFilter = "unknown";
let modalCardId = null;
let showBack = false;

let audio = new Audio();
let nowPlayingId = null;

function escapeHtml(s){return (s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function loadJSON(key, fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;}}
function saveJSON(key, val){localStorage.setItem(key, JSON.stringify(val));}
function statusLabel(k){return (STATUSES.find(s=>s.key===k)||{label:k}).label;}
function getStatus(id){const map=loadJSON(STORAGE_KEY_STATUS,{}); return map[id]||"unknown";}
function setStatus(id, status){
  const map=loadJSON(STORAGE_KEY_STATUS,{});
  map[id]=status; saveJSON(STORAGE_KEY_STATUS,map);
  renderThemeTable(); renderModal();
}

function playAudio(url, cardId){
  if (!url) return alert("audioUrl が未設定です");
  if (nowPlayingId === cardId && !audio.paused){
    audio.pause(); audio.currentTime=0; nowPlayingId=null; return;
  }
  nowPlayingId = cardId;
  audio.pause(); audio.currentTime=0;
  audio.src = url;
  audio.play().catch(()=>alert("音声を再生できませんでした（パス/形式を確認）"));
}

/** DOM */
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const screenPicker = document.getElementById("screenPicker");
const screenTheme = document.getElementById("screenTheme");
const themeToolbar = document.getElementById("themeToolbar");
const backBtn = document.getElementById("backBtn");
const tabsEl = document.getElementById("tabs");
const tbodyEl = document.getElementById("tbody");
const themeSearch = document.getElementById("themeSearch");
const recentGrid = document.getElementById("recentGrid");
const themeGrid = document.getElementById("themeGrid");
const overlayEl = document.getElementById("overlay");
const closeBtn = document.getElementById("closeBtn");
const cardArea = document.getElementById("cardArea");
const modalBadge = document.getElementById("modalBadge");
const modalTheme = document.getElementById("modalTheme");
const statusBtns = document.getElementById("statusBtns");
const modalAudioBtn = document.getElementById("modalAudioBtn");

function buildThemes(){
  const map = new Map();
  for (const c of CARDS){
    const k=c.themeKey, name=c.themeName||k;
    const x = map.get(k) || {themeKey:k, themeName:name, count:0};
    x.count += 1; map.set(k,x);
  }
  THEMES = [...map.values()].sort((a,b)=>a.themeName.localeCompare(b.themeName,"ja"));
}

function showPicker(){
  currentThemeKey=null;
  screenPicker.classList.add("show");
  screenTheme.classList.remove("show");
  themeToolbar.style.display="none";
  titleEl.textContent="英作文カード";
  subtitleEl.textContent="テーマを選択してください";
  renderPicker();
}
function pushRecent(themeKey){
  let arr = loadJSON(STORAGE_KEY_RECENT, []);
  arr = [themeKey, ...arr.filter(x=>x!==themeKey)].slice(0,6);
  saveJSON(STORAGE_KEY_RECENT, arr);
}
function showTheme(themeKey){
  currentThemeKey=themeKey;
  localStorage.setItem(STORAGE_KEY_LAST_THEME, themeKey);
  pushRecent(themeKey);

  screenPicker.classList.remove("show");
  screenTheme.classList.add("show");
  themeToolbar.style.display="flex";

  const t=THEMES.find(x=>x.themeKey===themeKey);
  titleEl.textContent=t?.themeName||themeKey;
  subtitleEl.textContent="ステータスで絞り込み → 行タップでカード";

  renderTabs();
  renderThemeTable();
}

function themeButton(t){
  const btn=document.createElement("button");
  btn.className="themeBtn";
  btn.innerHTML=`<p class="themeTitle">${escapeHtml(t.themeName)}</p><p class="themeMeta">${t.count} cards</p>`;
  btn.onclick=()=>showTheme(t.themeKey);
  return btn;
}

function renderPicker(){
  const q=(themeSearch.value||"").trim().toLowerCase();
  const filtered = THEMES.filter(t=>t.themeName.toLowerCase().includes(q));

  const recentKeys = loadJSON(STORAGE_KEY_RECENT, []);
  const recent = recentKeys.map(k=>THEMES.find(t=>t.themeKey===k)).filter(Boolean)
    .filter(t=>t.themeName.toLowerCase().includes(q));

  recentGrid.innerHTML="";
  if (recent.length===0) recentGrid.innerHTML=`<div style="color:#666;grid-column:1/-1;">（まだありません）</div>`;
  else recent.forEach(t=>recentGrid.appendChild(themeButton(t)));

  themeGrid.innerHTML="";
  if (filtered.length===0) themeGrid.innerHTML=`<div style="color:#666;grid-column:1/-1;">一致するテーマがありません。</div>`;
  else filtered.forEach(t=>themeGrid.appendChild(themeButton(t)));
}

themeSearch.addEventListener("input", renderPicker);
backBtn.onclick = showPicker;

function renderTabs(){
  tabsEl.innerHTML="";
  STATUSES.forEach(s=>{
    const btn=document.createElement("button");
    btn.className="tab"+(currentFilter===s.key?" active":"");
    btn.textContent=s.label;
    btn.onclick=()=>{currentFilter=s.key; renderThemeTable();};
    tabsEl.appendChild(btn);
  });
}

function renderThemeTable(){
  tbodyEl.innerHTML="";
  const rows = CARDS.filter(c=>c.themeKey===currentThemeKey).filter(c=>getStatus(c.id)===currentFilter);

  rows.forEach(card=>{
    const tr=document.createElement("tr");

    const tdJp=document.createElement("td");
    tdJp.className="jpCell";
    tdJp.innerHTML=`
      <div class="rowTop">
        <span class="jp">${escapeHtml(card.jp)}</span>
        <span class="badge">${statusLabel(getStatus(card.id))}</span>
      </div>`;
    tdJp.onclick=()=>openModal(card.id);

    const tdAu=document.createElement("td");
    const b=document.createElement("button");
    b.className="audioBtn"; b.textContent="▶︎";
    b.onclick=(e)=>{e.stopPropagation(); playAudio(card.audioUrl, card.id);};
    tdAu.appendChild(b);

    tr.appendChild(tdJp); tr.appendChild(tdAu);
    tbodyEl.appendChild(tr);
  });

  if (rows.length===0){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=2; td.style.color="#666"; td.style.padding="18px 10px";
    td.textContent="このステータスのカードはまだありません。";
    tr.appendChild(td); tbodyEl.appendChild(tr);
  }
}

/** modal */
function openModal(cardId){
  modalCardId=cardId; showBack=false;
  overlayEl.classList.add("show");
  renderModal();
}
function closeModal(){ overlayEl.classList.remove("show"); modalCardId=null; }
closeBtn.onclick=closeModal;
overlayEl.addEventListener("click",(e)=>{ if(e.target===overlayEl) closeModal(); });

cardArea.addEventListener("click",()=>{ if(!modalCardId) return; showBack=!showBack; renderModal(); });
modalAudioBtn.onclick=(e)=>{ e.stopPropagation(); const card=CARDS.find(c=>c.id===modalCardId); if(card) playAudio(card.audioUrl, card.id); };

function renderModal(){
  if(!modalCardId) return;
  const card=CARDS.find(c=>c.id===modalCardId); if(!card) return;

  const st=getStatus(card.id);
  modalBadge.textContent=statusLabel(st);
  const t=(THEMES.find(x=>x.themeKey===card.themeKey)?.themeName)||card.themeKey;
  modalTheme.textContent=t;

  statusBtns.innerHTML="";
  STATUSES.forEach(s=>{
    const btn=document.createElement("button");
    btn.className="sbtn"+(st===s.key?" active":"");
    btn.textContent=s.label;
    btn.onclick=(e)=>{e.stopPropagation(); setStatus(card.id, s.key);};
    statusBtns.appendChild(btn);
  });

  if(!showBack){
    cardArea.innerHTML=`<p class="big">${escapeHtml(card.jp)}</p><div class="hint">（タップで裏面：英語＋IPA）</div>`;
  }else{
    cardArea.innerHTML=`<p class="en">${escapeHtml(card.en)}</p><p class="ipa">${escapeHtml(card.ipa)}</p><div class="hint">（タップで表面：日本語＋音声）</div>`;
  }
}

/** load + init */
async function init(){
  const res = await fetch("./cards.json");
  CARDS = await res.json();
  buildThemes();
  renderPicker();

  const last = localStorage.getItem(STORAGE_KEY_LAST_THEME);
  if(last && THEMES.some(t=>t.themeKey===last)) showTheme(last);
  else showPicker();

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }
}
init();
