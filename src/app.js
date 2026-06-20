// 瀏覽器端主程式：hash 路由 + 成績碼網址處理 + 各畫面渲染。
import { TYPES, TYPE_META, multiplier, formatMultiplier } from './data/typechart.js';
import { generateTypeQuiz, generateSpeedQuiz, generateWhoQuiz, generateWhoQuizFromKeys, whoAnswerCorrect, whoCharScore, scoreQuizChar, normalizeName, speedLines, scoreQuiz, newSeed, DEFAULT_QUESTION_COUNT, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT, SPEED_DIFFICULTIES, DEFAULT_SPEED_DIFFICULTY, WHO_DIFFICULTIES, DEFAULT_WHO_DIFFICULTY } from './quiz.js';
import { generateDoku, cellSatisfied, PICK_RESULT_LIMIT } from './doku.js';
import { encodeResult, decodeResult, encodeDokuTrap, encodeWhoCustom } from './share.js';
import { getHistory, addHistory } from './history.js';
import { masterAvailable, getMaster, saveMaster, resetMaster, pushWrong } from './master.js';
import { t, typeName } from './i18n.js';

const app = document.getElementById('app');

// ── 資料（離線產生的靜態檔，啟動時載入一次）──────────────────────
let pokedex = {};            // Champions 賽季名單（速度測驗 / 我是誰冠軍賽季池）
let seasonsData = { seasons: {} };
let nationalDex = {};        // 全國圖鑑分世代（我是誰的世代/地區池，含未進化）

// ── 小工具 ──────────────────────────────────────────────────────
const el = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const shareUrlFor = (code) => `${location.origin}${location.pathname}?c=${code}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 計分方式（單選）：不計分（只顯示對幾題）／正常計分（對/錯換算 100 分）；
// 我是誰多一個按字計分（逐字部分分、換算 100）。
function scoreModesFor(mode) {
  return mode === 'who' ? ['count', 'normal', 'char'] : ['count', 'normal'];
}
// 按字計分專用百分制（0..100）。
function charPct(quiz, answers) {
  return (scoreQuizChar(quiz, answers) / (quiz.count * 10)) * 100;
}
// 由（已解碼/歷史）結果取百分制，供比較與配色：按字計分 score 已是百分制；正常＝答對/題數×100。
function pctOf({ charScore, score, total }) {
  if (charScore) return score;
  return total ? (score / total) * 100 : 0;
}
// 顯示：最多兩位小數、去尾零（70 / 75.5 / 66.67）。
const fmtPct = (v) => String(Math.round(v * 100) / 100);

// 屬性 icon（本地 vendor 的白色字符 SVG）。
function typeIcon(typeKey) {
  return `<img class="type-icon" src="./assets/types/${typeKey}.svg" alt="" aria-hidden="true" />`;
}

// UI 圖示一律用 SVG（本 repo 禁用 emoji）。inline 以便 currentColor 跟著文字色。
const UI_ICONS = {
  bolt: '<path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z"/>',
  shield: '<path fill="currentColor" d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4z"/>',
  swords: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 4 6V3h3l11.5 10.5M13 19l3 3M16 16l4 4M19 21l2-2M18.5 3H21v3L9.5 17.5M11 13l-2 2M5 21l4-4"/></g>',
  who: '<path fill="currentColor" d="M12 2a6 6 0 0 1 6 6c0 2.6-1.7 4-3.1 5.1-1 .8-1.4 1.3-1.4 2.4v.5h-3v-.7c0-2.1.9-3.1 2.3-4.2C14 10.3 15 9.7 15 8a3 3 0 0 0-6 0H6a6 6 0 0 1 6-6Z"/><circle cx="12" cy="20.2" r="1.8" fill="currentColor"/>',
  search: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></g>',
  up: '<path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>',
  grid: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></g>',
  close: '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>',
};
function uiIcon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${UI_ICONS[name]}</svg>`;
}

// 精靈球 SVG（多色，非 currentColor）：用於「我是誰」電視動畫風格球框四角。
function pokeballSvg() {
  return `<svg class="pokeball-svg" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#fff" stroke="#222" stroke-width="1.4"/>
    <path d="M1.2 12a10.8 10.8 0 0 1 21.6 0Z" fill="#e3350d"/>
    <line x1="1.2" y1="12" x2="22.8" y2="12" stroke="#222" stroke-width="1.8"/>
    <circle cx="12" cy="12" r="3.4" fill="#fff" stroke="#222" stroke-width="1.6"/>
    <circle cx="12" cy="12" r="1.4" fill="#fff" stroke="#222" stroke-width="1"/>
  </svg>`;
}

// 「我是誰」球框內底色：由 seed＋題序決定（可分享 → 兩端同色），剪影是黑的故選中亮度底色。
const FRAME_COLORS = ['#9ed8a6', '#9ec9e8', '#e8c79e', '#d8a6cf', '#c0d89e', '#e89e9e', '#9ed8cf', '#c9b0e8', '#e8d99e', '#a6b8d8'];
function frameFill(seedStr, idx) {
  let h = 0;
  for (const c of `${seedStr}:${idx}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FRAME_COLORS[h % FRAME_COLORS.length];
}

function badge(typeKey, big = false) {
  const m = TYPE_META[typeKey];
  return `<span class="type-badge${big ? ' type-badge--lg' : ''}" style="background:${m.color}">${typeIcon(typeKey)}${esc(typeName(typeKey))}</span>`;
}

function setView(node) {
  app.innerHTML = '';
  app.appendChild(node);
  window.scrollTo(0, 0);
}

// ── 主題切換（瀏覽器預設 / 亮色 / 暗色）──────────────────────────
// 自繪 SVG：亮＝空心點、暗＝實心點、瀏覽器預設＝地球。偏好存 localStorage，預設跟瀏覽器。
const THEME_KEY = 'poke-quest.theme';
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_SVG = {
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="currentColor"/></svg>',
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.6" ry="8.5"/><line x1="3.5" y1="12" x2="20.5" y2="12"/><line x1="5.2" y1="7" x2="18.8" y2="7"/><line x1="5.2" y1="17" x2="18.8" y2="17"/></g></svg>',
};
const THEME_LABEL = { system: '主題：瀏覽器預設', light: '主題：亮色', dark: '主題：暗色' };

function readThemePref() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
}
function systemPrefersDark() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyTheme(pref) {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function initTheme() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  let pref = readThemePref();
  const paint = () => { btn.innerHTML = THEME_SVG[pref]; btn.setAttribute('aria-label', THEME_LABEL[pref]); btn.title = THEME_LABEL[pref]; };
  applyTheme(pref); paint();
  btn.onclick = () => {
    pref = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
    try { localStorage.setItem(THEME_KEY, pref); } catch { /* 存不了就只在本次有效 */ }
    applyTheme(pref); paint();
  };
  // 「瀏覽器預設」時，系統亮/暗切換要即時跟著變。
  if (typeof matchMedia === 'function') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (pref === 'system') applyTheme('system'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

// ── 賽季 / 測驗組裝 ──────────────────────────────────────────────
function seasonLabel(key) {
  return seasonsData.seasons[key]?.label || key;
}
function seasonKeys() {
  return Object.keys(seasonsData.seasons);
}
function defaultSeason() {
  const keys = seasonKeys();
  return keys.includes('m-b') ? 'm-b' : keys[0];
}
// 由賽季組出已排序的寶可夢池（穩定排序 → 速度測驗可決定性重現）。
function seasonPool(key) {
  const members = seasonsData.seasons[key]?.members || [];
  return members
    .filter((k) => pokedex[k])
    .map((k) => ({ key: k, ...pokedex[k] }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// ── 我是誰：世代/地區池 ─────────────────────────────────────────
// 池鍵：世代 g1..g9，或賽季鍵（如 m-b，作為「冠軍最新賽季」選項）。
const GENERATIONS = [
  { key: 'g1', cn: '一', min: 1, max: 151, region: '關都' },
  { key: 'g2', cn: '二', min: 152, max: 251, region: '城都' },
  { key: 'g3', cn: '三', min: 252, max: 386, region: '豐緣' },
  { key: 'g4', cn: '四', min: 387, max: 493, region: '神奧' },
  { key: 'g5', cn: '五', min: 494, max: 649, region: '合眾' },
  { key: 'g6', cn: '六', min: 650, max: 721, region: '卡洛斯' },
  { key: 'g7', cn: '七', min: 722, max: 809, region: '阿羅拉' },
  { key: 'g8', cn: '八', min: 810, max: 905, region: '伽勒爾' },
  { key: 'g9', cn: '九', min: 906, max: 1025, region: '帕底亞' },
];

// 地區形態歸到「該形態登場的世代/地區」（非本體國家圖鑑世代）：
// 阿羅拉九尾本體編號在關都，但形態是第七世代阿羅拉才有，故歸 g7。
// 洗翠（傳說 阿爾宙斯）世代算第八世代但地區非伽勒爾，獨立成 'hisui' 桶。
const REGION_GEN = { alola: 'g7', galar: 'g8', hisui: 'hisui', paldea: 'g9' };
function genKeyOf(key, entry) {
  for (const tag in REGION_GEN) {
    if (key.includes(`-${tag}`)) return REGION_GEN[tag];
  }
  // 一般／Mega：依國家圖鑑編號 ndex（Mega 仍算本體所屬世代）。
  const nd = entry.ndex || entry.dex;
  return GENERATIONS.find((g) => nd >= g.min && nd <= g.max)?.key || null;
}

// 我是誰的可選範圍：全部混合 + 全國圖鑑各世代 + 洗翠地區 + 冠軍最新賽季。
function whoPoolKeys() {
  const hasNonMega = (poolKey) => Object.keys(nationalDex).some((k) => !nationalDex[k].mega && genKeyOf(k, nationalDex[k]) === poolKey);
  const gens = GENERATIONS.map((g) => g.key).filter(hasNonMega);
  const hisui = hasNonMega('hisui') ? ['hisui'] : [];
  return ['all', ...gens, ...hisui, defaultSeason()];
}
function defaultWhoPool() {
  return whoPoolKeys()[0] || defaultSeason();
}
// 由池鍵組出穩定排序的寶可夢池：
//   賽季鍵（冠軍最新賽季）→ Champions 名單 pokedex；'all' / 世代 / 地區鍵 → 全國圖鑑 nationalDex。
function whoPool(poolKey) {
  if (seasonsData.seasons[poolKey]) return seasonPool(poolKey);
  const keys = poolKey === 'all'
    ? Object.keys(nationalDex)
    : Object.keys(nationalDex).filter((k) => genKeyOf(k, nationalDex[k]) === poolKey);
  return keys
    .map((k) => ({ key: k, ...nationalDex[k] }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
function poolLabel(poolKey) {
  if (!poolKey) return t('builder.poolLabel');
  if (poolKey === 'all') return '全部世代（混合）';
  const g = GENERATIONS.find((x) => x.key === poolKey);
  if (g) return `第${g.cn}世代（${g.region}）`;
  if (poolKey === 'hisui') return '洗翠地區（傳說 阿爾宙斯）';
  return `冠軍賽季（${poolKey.toUpperCase()}）`;
}

function buildQuiz({ mode, season, seed, total, difficulty }) {
  if (mode === 'speed') return generateSpeedQuiz(seed, seasonPool(season), total, difficulty || DEFAULT_SPEED_DIFFICULTY);
  if (mode === 'who') return generateWhoQuiz(seed, whoPool(season), total, difficulty || DEFAULT_WHO_DIFFICULTY);
  return generateTypeQuiz(seed, total);
}

// 速度測驗難度顯示名（'all' 不另標，視為「混合」不加後綴以相容舊碼）。
function difficultyLabel(difficulty) {
  return t(`difficulty.${difficulty}`) || '';
}

function quizLabel(mode, season, difficulty = 'all') {
  if (mode === 'doku') return t('quiz.doku.title');
  if (mode === 'speed') {
    const diff = difficulty && difficulty !== 'all' ? ` · ${difficultyLabel(difficulty)}` : '';
    return `${t('quiz.speed.title')}（${seasonLabel(season)}${diff}）`;
  }
  if (mode === 'who') {
    const diff = difficulty ? ` · ${difficultyLabel(difficulty)}` : '';
    return `${t('quiz.who.title')}（${poolLabel(season)}${diff}）`;
  }
  return t('quiz.type.title');
}

// ── 狀態 ─────────────────────────────────────────────────────────
let session = null;        // { quiz, answers, index, locked, challenge, saved, meta }
let viewingHistory = null; // 目前點開查看的歷史紀錄
let setupState = null;     // { mode, season, seed } — 準備畫面
let dokuSetup = null;      // { play, hintMode, seed } — 數獨準備畫面
let dokuState = null;      // { seed, puzzle, picks:[9], hintMode, play, pits, challenge } — 數獨盤面
let masterState = null;    // 寶可夢大師模式（本機）的進行狀態
let builderState = null;   // 我是誰出題 builder 的狀態

// 速度線表「每行最多幾隻」偏好（5 或 10，預設 10），記在 localStorage。
const SPD_PERROW_KEY = 'poke-quest.spdPerRow';
function readSpdPerRow() {
  try { return Number(localStorage.getItem(SPD_PERROW_KEY)) === 5 ? 5 : 10; } catch { return 10; }
}
let spdPerRow = readSpdPerRow();

// 解碼任一種分享碼：一般成績碼 / 挖坑碼 / 自訂題庫碼都由 decodeResult 統一處理。
function decodeShare(code) {
  return decodeResult(code);
}

// 相對時間文字。
function relTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── 首頁：選測驗 + 輸入代碼 + 最近紀錄 ──────────────────────────
function viewHome() {
  const history = getHistory();

  const node = el(`
    <section>
      <div class="card">
        <h1>${esc(t('app.title'))}</h1>
        <p class="lead">${esc(t('home.lead'))}</p>
        <p class="label">${esc(t('home.pickTitle'))}</p>
        <button class="quiz-card" data-pick="type">
          <span class="quiz-card__emoji" aria-hidden="true">${uiIcon('shield')}</span>
          <span class="quiz-card__text">
            <span class="quiz-card__title">${esc(t('quiz.type.title'))}</span>
            <span class="quiz-card__desc">${esc(t('quiz.type.desc'))}</span>
          </span>
          <span class="hist-chevron" aria-hidden="true">›</span>
        </button>
        <button class="quiz-card" data-pick="speed">
          <span class="quiz-card__emoji" aria-hidden="true">${uiIcon('bolt')}</span>
          <span class="quiz-card__text">
            <span class="quiz-card__title">${esc(t('quiz.speed.title'))}</span>
            <span class="quiz-card__desc">${esc(t('quiz.speed.desc'))}</span>
          </span>
          <span class="hist-chevron" aria-hidden="true">›</span>
        </button>
        <button class="quiz-card" data-pick="who">
          <span class="quiz-card__emoji" aria-hidden="true">${uiIcon('who')}</span>
          <span class="quiz-card__text">
            <span class="quiz-card__title">${esc(t('quiz.who.title'))}</span>
            <span class="quiz-card__desc">${esc(t('quiz.who.desc'))}</span>
          </span>
          <span class="hist-chevron" aria-hidden="true">›</span>
        </button>
        <button class="quiz-card" data-pick="doku">
          <span class="quiz-card__emoji" aria-hidden="true">${uiIcon('grid')}</span>
          <span class="quiz-card__text">
            <span class="quiz-card__title">${esc(t('quiz.doku.title'))}</span>
            <span class="quiz-card__desc">${esc(t('quiz.doku.desc'))}</span>
          </span>
          <span class="hist-chevron" aria-hidden="true">›</span>
        </button>
      </div>

      <div class="card">
        <h2>${esc(t('home.codeTitle'))}</h2>
        <p class="muted">${esc(t('home.codeHint'))}</p>
        <div class="code-box">
          <input type="text" inputmode="text" autocomplete="off" spellcheck="false"
                 placeholder="${esc(t('home.codePlaceholder'))}" aria-label="${esc(t('home.codeTitle'))}" data-code-input />
          <button class="btn btn--accent" data-act="code-go">${esc(t('home.codeGo'))}</button>
        </div>
        <p class="feedback feedback--bad" data-code-err style="text-align:left;min-height:0"></p>
      </div>

      ${history.length ? `
      <div class="card">
        <h2>最近紀錄</h2>
        <p class="muted">保存在這台裝置，最多 5 筆 · 點擊看逐題檢討</p>
        <div class="history"></div>
      </div>` : ''}
    </section>`);

  // 選測驗 → 準備畫面。
  node.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => {
      const mode = b.dataset.pick;
      // 數獨走自己的 setup（選玩法：一般練習／挖坑出題；作答方式：提示／無提示）。
      if (mode === 'doku') { dokuSetup = { play: 'practice', hintMode: 'hint', seed: newSeed() }; go('#/doku-setup'); return; }
      let season = '', difficulty = 'all';
      if (mode === 'speed') { season = defaultSeason(); difficulty = DEFAULT_SPEED_DIFFICULTY; }
      else if (mode === 'who') { season = defaultWhoPool(); difficulty = DEFAULT_WHO_DIFFICULTY; }
      setupState = { mode, season, difficulty, seed: newSeed() };
      go('#/setup');
    };
  });

  // 直接輸入代碼挑戰：接受純代碼，或貼上含 ?c= 的整條連結。
  const codeInput = node.querySelector('[data-code-input]');
  const codeErr = node.querySelector('[data-code-err]');
  const submitCode = () => {
    const raw = codeInput.value.trim();
    if (!raw) return;
    const m = raw.match(/[?&]c=([^&\s]+)/);
    const code = m ? decodeURIComponent(m[1]) : raw;
    const decoded = decodeShare(code);
    if (!decoded) {
      codeErr.textContent = t('home.codeBad');
      codeInput.focus();
      return;
    }
    viewChallenge(decoded);
  };
  node.querySelector('[data-act="code-go"]').onclick = submitCode;
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitCode(); }
  });

  const histWrap = node.querySelector('.history');
  if (histWrap) {
    history.forEach((rec) => {
      const rsm = rec.scoreMode || 'count';
      const usePct = rsm === 'char' || rsm === 'normal';
      const pct = pctOf({ charScore: rsm === 'char', score: rec.score, total: rec.total });
      const tone = pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad';
      const label = quizLabel(rec.mode || 'type', rec.season || '', rec.difficulty || 'all') + (rsm !== 'count' ? ' · ' + t('score.' + rsm) : '');
      const scoreText = usePct ? fmtPct(pct) : `${rec.score}/${rec.total}`;
      const item = el(`
        <button class="hist-item" type="button">
          <span class="hist-score hist-score--${tone}">${esc(scoreText)}</span>
          <span class="hist-meta">
            <span class="hist-time">${esc(label)} · ${esc(relTime(rec.ts))}</span>
            <span class="hist-code">分享碼 ${esc(rec.code.slice(0, 10))}…</span>
          </span>
          <span class="hist-chevron" aria-hidden="true">›</span>
        </button>`);
      item.onclick = () => { viewingHistory = rec; go('#/history'); };
      histWrap.appendChild(item);
    });
  }

  setView(node);
}

// ── 準備畫面：選賽季 + 顯示本局題目碼（開局前就能分享一起測）──────
function viewSetup() {
  if (!setupState) return viewHome();
  const { mode } = setupState;
  if (mode === 'speed') {
    if (!setupState.season) setupState.season = defaultSeason();
    if (!setupState.difficulty) setupState.difficulty = DEFAULT_SPEED_DIFFICULTY;
  } else if (mode === 'who') {
    if (!setupState.season) setupState.season = defaultWhoPool();
    if (!setupState.difficulty) setupState.difficulty = DEFAULT_WHO_DIFFICULTY;
  }
  if (setupState.count == null) setupState.count = DEFAULT_QUESTION_COUNT;
  if (setupState.scoreMode == null) setupState.scoreMode = 'count';
  if (mode !== 'who' && setupState.scoreMode === 'char') setupState.scoreMode = 'count';
  const season = mode === 'type' ? '' : setupState.season;
  const difficulty = mode === 'type' ? 'all' : setupState.difficulty;
  const seed = setupState.seed;
  // 題數（10–20）與計分方式套用所有模式；按字計分（char）僅我是誰可選。
  const count = setupState.count;
  const scoreMode = setupState.scoreMode;
  const charScore = mode === 'who' && scoreMode === 'char';
  const score100 = scoreMode === 'normal';

  const code = encodeResult({ mode, season, seed, total: count, score: 0, difficulty, charScore, score100 });
  const url = shareUrlFor(code);
  const title = t(`quiz.${mode}.title`);
  const desc = t(`quiz.${mode}.desc`);
  const noteKey = mode === 'who' ? `who.difficulty.${difficulty}.note` : `difficulty.${difficulty}.note`;

  const node = el(`
    <section class="card">
      <h2>${esc(title)}</h2>
      <p class="lead">${esc(desc)}</p>

      ${mode === 'speed' ? `
      <p class="label">${esc(t('setup.season'))}</p>
      <div class="season-pick"></div>` : ''}
      ${mode === 'who' ? `
      <p class="label">${esc(t('setup.pool'))}</p>
      <div class="pool-pick tab-scroll"></div>` : ''}
      ${mode === 'speed' || mode === 'who' ? `
      <p class="label">${esc(t('setup.difficulty'))}</p>
      <div class="difficulty-pick tab-scroll"></div>
      <p class="muted">${esc(t(noteKey))}</p>` : ''}

      <p class="label">${esc(t('setup.scoreMode'))}</p>
      <div class="difficulty-pick tab-scroll" data-scoremodes></div>
      <p class="muted">${esc(t(`score.${scoreMode}.note`))}</p>

      <p class="label">${esc(t('setup.count'))}</p>
      <div class="count-pick">
        <button class="count-step" data-count-step="-1" aria-label="減少題數" ${count <= MIN_QUESTION_COUNT ? 'disabled' : ''}>−</button>
        <span class="count-val" data-count-val>${count}</span>
        <button class="count-step" data-count-step="1" aria-label="增加題數" ${count >= MAX_QUESTION_COUNT ? 'disabled' : ''}>＋</button>
      </div>

      ${mode === 'type' ? `
      <button class="btn btn--ghost" data-nav="chart" style="margin-top:14px">${esc(t('home.openChart'))}</button>` : ''}
      ${mode === 'speed' ? `
      <button class="btn btn--ghost" data-nav="speedline" style="margin-top:14px">${esc(t('speedline.openBtn'))}</button>` : ''}
      ${mode === 'who' ? `
      <button class="btn btn--ghost" data-nav="dex" style="margin-top:14px">${esc(t('dex.openBtn'))}</button>` : ''}

      <button class="btn btn--primary" data-act="start" style="margin-top:14px">${esc(t('setup.start'))}</button>

      <p class="label">${esc(t('home.thisCode'))}</p>
      <div class="code-box">
        <input type="text" readonly value="${esc(url)}" aria-label="本局題目連結" data-this-url />
        <button class="btn btn--accent" data-act="copy-share">${esc(t('home.copyShare'))}</button>
      </div>
      <p class="muted">代碼 <strong>${esc(code)}</strong> · <button class="linklike" data-act="reroll">${esc(t('home.reroll'))}</button></p>

      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);

  if (mode === 'speed') {
    const pickWrap = node.querySelector('.season-pick');
    seasonKeys().forEach((key) => {
      const b = el(`<button class="season-btn" aria-pressed="${season === key}">${esc(seasonLabel(key))}</button>`);
      b.onclick = () => { setupState.season = key; viewSetup(); };
      pickWrap.appendChild(b);
    });

    const diffWrap = node.querySelector('.difficulty-pick');
    // UI 只給三檔（'all' 為相容舊碼的內部值，不對外呈現）。
    SPEED_DIFFICULTIES.filter((d) => d !== 'all').forEach((d) => {
      const b = el(`<button class="season-btn" aria-pressed="${difficulty === d}">${esc(difficultyLabel(d))}</button>`);
      b.onclick = () => { setupState.difficulty = d; viewSetup(); };
      diffWrap.appendChild(b);
    });
  }

  if (mode === 'who') {
    const poolWrap = node.querySelector('.pool-pick');
    whoPoolKeys().forEach((pk) => {
      const b = el(`<button class="season-btn" aria-pressed="${season === pk}">${esc(poolLabel(pk))}</button>`);
      b.onclick = () => { setupState.season = pk; viewSetup(); };
      poolWrap.appendChild(b);
    });

    const diffWrap = node.querySelector('.difficulty-pick');
    WHO_DIFFICULTIES.forEach((d) => {
      const b = el(`<button class="season-btn" aria-pressed="${difficulty === d}">${esc(difficultyLabel(d))}</button>`);
      b.onclick = () => { setupState.difficulty = d; viewSetup(); };
      diffWrap.appendChild(b);
    });

    // 寶可夢大師模式 + 出題模式入口（衍生玩法）：放到「換一份題目」連結之下。
    const masterWrap = el(`
      <div class="master-entry">
        <button class="btn btn--ghost" data-act="master">${esc(t('master.btn'))}</button>
        <p class="muted">${esc(t('master.btnNote'))}</p>
        <button class="btn btn--ghost" data-act="builder">${esc(t('builder.btn'))}</button>
      </div>`);
    masterWrap.querySelector('[data-act="master"]').onclick = () => startMaster(setupState.season, setupState.difficulty);
    masterWrap.querySelector('[data-act="builder"]').onclick = () => { builderState = null; go('#/who-builder'); };
    const rerollP = node.querySelector('[data-act="reroll"]')?.closest('p');
    if (rerollP) rerollP.after(masterWrap);
    else node.querySelector('[data-act="start"]').before(masterWrap);
  }

  const smWrap = node.querySelector('[data-scoremodes]');
  if (smWrap) scoreModesFor(mode).forEach((sm) => {
    const b = el(`<button class="season-btn" aria-pressed="${scoreMode === sm}">${esc(t(`score.${sm}`))}</button>`);
    b.onclick = () => { setupState.scoreMode = sm; viewSetup(); };
    smWrap.appendChild(b);
  });

  node.querySelectorAll('[data-count-step]').forEach((b) => {
    b.onclick = () => {
      const next = clamp(setupState.count + Number(b.dataset.countStep), MIN_QUESTION_COUNT, MAX_QUESTION_COUNT);
      if (next !== setupState.count) { setupState.count = next; viewSetup(); }
    };
  });

  node.querySelector('[data-act="start"]').onclick = () => startQuiz({ mode, season, seed, difficulty, count, scoreMode });

  const shareBtn = node.querySelector('[data-act="copy-share"]');
  shareBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = node.querySelector('[data-this-url]');
      input.select();
      document.execCommand('copy');
    }
    shareBtn.textContent = t('result.copied');
    setTimeout(() => (shareBtn.textContent = t('home.copyShare')), 1500);
  };

  node.querySelector('[data-act="reroll"]').onclick = () => { setupState.seed = newSeed(); viewSetup(); };

  setView(node);
}

// ── 開始測驗 ────────────────────────────────────────────────────
function startQuiz({ mode = 'type', season = '', seed, difficulty = 'all', count = DEFAULT_QUESTION_COUNT, scoreMode = 'count', challenge = null }) {
  const total = clamp(challenge ? challenge.total : count, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT);
  let sm = challenge ? (challenge.charScore ? 'char' : challenge.score100 ? 'normal' : 'count') : scoreMode;
  if (mode !== 'who' && sm === 'char') sm = 'count';
  let quiz;
  try {
    quiz = buildQuiz({ mode, season, seed, total, difficulty });
  } catch (e) {
    console.error(e);
    return viewHome();
  }
  session = { quiz, answers: [], index: 0, locked: false, challenge, saved: false, meta: { mode, season, difficulty, count: total, scoreMode: sm } };
  go('#/quiz');
}

// ── 測驗畫面 ────────────────────────────────────────────────────
function pokeOption(p, i) {
  const b = el(`
    <button class="btn option option-poke" data-i="${i}">
      <img class="poke-img" alt="${esc(p.nameZh)}" loading="lazy" />
      <span class="poke-name">${esc(p.nameZh)}${p.mega ? ' <span class="mega-tag">MEGA</span>' : ''}</span>
      <span class="poke-speed" data-speed hidden>${uiIcon('bolt')}速度 ${p.speed}</span>
    </button>`);
  const img = b.querySelector('img');
  img.src = p.image;
  img.onerror = () => { img.style.visibility = 'hidden'; };
  return b;
}

function viewQuiz() {
  if (!session) return viewHome();
  const { quiz, index } = session;
  const q = quiz.questions[index];
  const pct = Math.round((index / quiz.count) * 100);

  const node = el(`
    <section class="card">
      <div class="quiz__meta">
        <span>${esc(t('quiz.progress', { n: index + 1, total: quiz.count }))}</span>
        <span>${session.challenge ? uiIcon('swords') : ''}</span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>
      <div data-qbody></div>
      <div class="options"></div>
      <p class="feedback"></p>
      <button class="btn btn--primary" data-act="next" hidden></button>
    </section>`);

  const body = node.querySelector('[data-qbody]');
  const optWrap = node.querySelector('.options');

  if (q.mode === 'who') {
    const hint = whoHint(q, session.meta.difficulty);
    body.innerHTML = `
      <div class="who-frame" style="--frame-fill:${frameFill(quiz.seed, index)}">
        <span class="who-corner who-corner--tl">${pokeballSvg()}</span>
        <span class="who-corner who-corner--tr">${pokeballSvg()}</span>
        <span class="who-corner who-corner--bl">${pokeballSvg()}</span>
        <span class="who-corner who-corner--br">${pokeballSvg()}</span>
        <div class="who-stage${session.meta.difficulty === 'veryeasy' ? ' revealed' : ''}"><img class="who-img" alt="" /></div>
      </div>
      <p class="q-prompt">${esc(t('who.prompt'))}</p>
      ${hint ? `<p class="who-hint">${hint}</p>` : ''}
      <div class="code-box who-input">
        <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="${esc(t('who.placeholder'))}" aria-label="${esc(t('who.prompt'))}" data-who-input />
        <button class="btn btn--accent" data-act="who-submit">${esc(t('who.submit'))}</button>
      </div>`;
    const img = body.querySelector('.who-img');
    img.src = q.image;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const input = body.querySelector('[data-who-input]');
    const submit = () => answerWho(input.value, node);
    body.querySelector('[data-act="who-submit"]').onclick = submit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  } else if (q.mode === 'speed') {
    body.innerHTML = `
      <p class="q-prompt">${esc(t('speed.prompt'))}</p>
      <p class="speed-note">${esc(t('speed.note'))}</p>`;
    optWrap.classList.add('options--poke');
    q.options.forEach((p, i) => {
      const b = pokeOption(p, i);
      b.onclick = () => answer(i, node);
      optWrap.appendChild(b);
    });
  } else {
    body.innerHTML = `
      <div class="matchup">
        ${badge(q.atk, true)}
        <span class="matchup__vs">→</span>
        <span class="matchup__defs">${q.def.map((d) => badge(d, true)).join('')}</span>
      </div>
      <p class="q-prompt">${esc(t('quiz.prompt'))}</p>`;
    q.options.forEach((opt, i) => {
      const b = el(`<button class="btn option" data-i="${i}">${esc(formatMultiplier(opt))}</button>`);
      b.onclick = () => answer(i, node);
      optWrap.appendChild(b);
    });
  }

  setView(node);
  if (q.mode === 'who') node.querySelector('[data-who-input]')?.focus();
}

// 地區形態的中文前綴：提示時整段直接顯示（露「阿」這種前綴第一個字沒意義）。
const REGION_ZH = { alola: '阿羅拉', galar: '伽勒爾', hisui: '洗翠', paldea: '帕底亞' };
function regionPrefixOf(q) {
  for (const tag in REGION_ZH) {
    if (q.key && q.key.includes(`-${tag}`) && q.nameZh.startsWith(REGION_ZH[tag])) return REGION_ZH[tag];
  }
  return '';
}

// 我是誰提示：veryeasy/easy 露第一個字、其餘 ○；normal 全 ○；hard 無提示。
// 地區形態：前綴（阿羅拉/洗翠…）整段直接顯示，提示套用在前綴後的本體名。
function whoHint(q, difficulty) {
  if (difficulty === 'hard') return '';
  const prefix = regionPrefixOf(q);
  const lead = prefix ? `<strong>${esc(prefix)}</strong> ` : '';
  const chars = Array.from(prefix ? q.nameZh.slice(prefix.length) : q.nameZh);
  if (difficulty === 'veryeasy' || difficulty === 'easy') {
    return lead + chars.map((c, i) => (i === 0 ? `<strong>${esc(c)}</strong>` : '○')).join(' ');
  }
  if (difficulty === 'normal') {
    return lead + chars.map(() => '○').join(' ');
  }
  return '';
}

// 我是誰作答：比對輸入、揭曉黑影與正解名、鎖定輸入。
function answerWho(typed, node) {
  if (session.locked) return;
  session.locked = true;
  const q = session.quiz.questions[session.index];
  session.answers[session.index] = typed;
  const right = whoAnswerCorrect(q, typed, session.meta.difficulty);

  node.querySelector('.who-stage')?.classList.add('revealed');
  node.querySelectorAll('.who-input input, .who-input button').forEach((e) => { e.disabled = true; });

  const nameLine = el(`<p class="who-answer">${q.mega ? `${esc(q.nameZh)} <span class="mega-tag">MEGA</span>` : esc(q.nameZh)}</p>`);
  node.querySelector('[data-qbody]').appendChild(nameLine);

  const fb = node.querySelector('.feedback');
  fb.textContent = right ? t('who.correct', { name: q.nameZh }) : t('who.wrong', { name: q.nameZh });
  fb.classList.add(right ? 'feedback--good' : 'feedback--bad');

  const last = session.index === session.quiz.count - 1;
  const next = node.querySelector('[data-act="next"]');
  next.textContent = last ? t('quiz.finish') : t('quiz.next');
  next.hidden = false;
  next.onclick = () => {
    if (last) { go('#/result'); return; }
    session.index++;
    session.locked = false;
    render();
  };
  next.focus();
}

// ── 寶可夢大師模式（本機）：走完整個池、每隻答對前都會再出現、全對即成為大師 ──
// 今天的日期鍵（征服天數用）。
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startMaster(poolKey, difficulty) {
  const available = masterAvailable();
  // 池依難度套用 Mega 規則（hard 才含 Mega），與一般我是誰一致。
  const all = whoPool(poolKey).filter((p) => difficulty === 'hard' || !p.mega);
  if (!all.length) return viewHome();
  const rec = getMaster(poolKey); // localStorage 不可用時也會回一筆空白 rec（純記憶體用）
  // 開始這個池：補首次時間戳、回鍋次數 +1、記下今天。
  if (!rec.startedAt) rec.startedAt = Date.now();
  rec.sessions = (rec.sessions || 0) + 1;
  const today = todayKey();
  if (!rec.days.includes(today)) rec.days.push(today);
  if (available) saveMaster(poolKey, rec);

  const doneSet = new Set(rec.done);
  const byKey = new Map(all.map((p) => [p.key, p]));
  // 尚未答對者洗牌成佇列（本機隨機即可）。
  const queue = all.filter((p) => !doneSet.has(p.key)).map((p) => p.key);
  for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
  masterState = {
    poolKey, difficulty, byKey, rec, available, queue,
    total: all.length, doneCount: rec.done.length, current: null, locked: false,
  };
  nextMaster();
  go('#/master');
}

function nextMaster() {
  if (!masterState) return;
  masterState.locked = false;
  const key = masterState.queue.shift();
  if (!key) { masterState.current = null; return; }
  const p = masterState.byKey.get(key);
  masterState.current = { key: p.key, mode: 'who', nameZh: p.nameZh, nameEn: p.nameEn, image: p.image, mega: !!p.mega, dex: p.dex };
}

function viewMaster() {
  if (!masterState) return viewHome();
  const ms = masterState;
  if (!ms.current) return viewMasterDone();
  const q = ms.current;
  const hint = whoHint(q, ms.difficulty);
  const pct = Math.round((ms.doneCount / ms.total) * 100);
  const node = el(`
    <section class="card">
      <div class="quiz__meta">
        <span>${esc(t('master.progress', { done: ms.doneCount, total: ms.total }))}</span>
        <span>${esc(t('master.mistakes', { n: ms.rec.mistakes }))}</span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>
      ${ms.available ? '' : `<p class="feedback feedback--bad" style="text-align:left;min-height:0">${esc(t('master.noStore'))}</p>`}
      <div data-qbody>
        <div class="who-frame" style="--frame-fill:${frameFill(ms.poolKey, ms.doneCount + ms.rec.mistakes)}">
          <span class="who-corner who-corner--tl">${pokeballSvg()}</span>
          <span class="who-corner who-corner--tr">${pokeballSvg()}</span>
          <span class="who-corner who-corner--bl">${pokeballSvg()}</span>
          <span class="who-corner who-corner--br">${pokeballSvg()}</span>
          <div class="who-stage${ms.difficulty === 'veryeasy' ? ' revealed' : ''}"><img class="who-img" alt="" /></div>
        </div>
        <p class="q-prompt">${esc(t('who.prompt'))}</p>
        ${hint ? `<p class="who-hint">${hint}</p>` : ''}
        <div class="code-box who-input">
          <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="${esc(t('who.placeholder'))}" aria-label="${esc(t('who.prompt'))}" data-who-input />
          <button class="btn btn--accent" data-act="who-submit">${esc(t('who.submit'))}</button>
        </div>
      </div>
      <p class="feedback"></p>
      <button class="btn btn--primary" data-act="next" hidden></button>
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);
  const img = node.querySelector('.who-img');
  img.src = q.image; img.onerror = () => { img.style.visibility = 'hidden'; };
  const input = node.querySelector('[data-who-input]');
  const submit = () => answerMaster(input.value, node);
  node.querySelector('[data-act="who-submit"]').onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  setView(node);
  input.focus();
}

function answerMaster(typed, node) {
  const ms = masterState;
  if (ms.locked) return;
  ms.locked = true;
  const q = ms.current;
  const right = whoAnswerCorrect(q, typed, ms.difficulty);
  node.querySelector('.who-stage')?.classList.add('revealed');
  node.querySelectorAll('.who-input input, .who-input button').forEach((e) => { e.disabled = true; });
  node.querySelector('[data-qbody]').appendChild(
    el(`<p class="who-answer">${q.mega ? `${esc(q.nameZh)} <span class="mega-tag">MEGA</span>` : esc(q.nameZh)}</p>`));
  const fb = node.querySelector('.feedback');
  fb.textContent = right ? t('who.correct', { name: q.nameZh }) : t('who.wrong', { name: q.nameZh });
  fb.classList.add(right ? 'feedback--good' : 'feedback--bad');

  const rec = ms.rec;
  const today = todayKey();
  if (!rec.days.includes(today)) rec.days.push(today);
  if (right) {
    const firstTry = !rec.attempts[q.key]; // 該隻先前沒答錯過 → 一次命中
    if (firstTry) { rec.curStreak++; if (rec.curStreak > rec.bestStreak) rec.bestStreak = rec.curStreak; }
    else rec.curStreak = 0; // 需要重試的不算乾淨連勝
    if (!rec.done.includes(q.key)) rec.done.push(q.key);
    ms.doneCount = rec.done.length;
  } else {
    rec.mistakes++;
    rec.attempts[q.key] = (rec.attempts[q.key] || 0) + 1;
    pushWrong(rec, q.key, typed);
    rec.curStreak = 0;
    ms.queue.push(q.key); // 答錯：排到後面，之後會再出現（直到答對）
  }
  if (ms.available) saveMaster(ms.poolKey, rec);
  const next = node.querySelector('[data-act="next"]');
  next.textContent = (right && ms.queue.length === 0) ? t('quiz.finish') : t('quiz.next');
  next.hidden = false;
  next.onclick = () => { nextMaster(); render(); };
  next.focus();
}

// 稱號：依失誤數對池大小的比例分級。
function masterTitle(mistakes, total) {
  if (mistakes === 0) return t('master.title.perfect');
  if (mistakes <= total * 0.1) return t('master.title.elite');
  if (mistakes <= total * 0.3) return t('master.title.official');
  return t('master.title.rookie');
}

// 由本機紀錄＋池資料算出完成頁要秀的 fun fact。
function computeMasterFacts(ms) {
  const { rec, byKey, total } = ms;
  const f = {
    total, mistakes: rec.mistakes,
    accuracy: Math.round((total / (total + rec.mistakes)) * 100),
    streak: rec.bestStreak, days: rec.days.length, sessions: rec.sessions,
    title: masterTitle(rec.mistakes, total),
    flawlessTypes: [],
  };

  // 剋星：答錯最多次的那隻。
  let nemKey = null, nemN = 0;
  for (const k in rec.attempts) { if (rec.attempts[k] > nemN && byKey.has(k)) { nemN = rec.attempts[k]; nemKey = k; } }
  if (nemKey) f.nemesis = { entry: byKey.get(nemKey), n: nemN };

  // 所有錯字 → 算與正解的接近度（char-score 0..10）。
  const wrongList = [];
  for (const k in rec.wrongs) {
    const e = byKey.get(k); if (!e) continue;
    for (const s of rec.wrongs[k]) wrongList.push({ entry: e, str: s, score: whoCharScore({ nameZh: e.nameZh }, s) });
  }
  if (wrongList.length) {
    f.nickname = wrongList.reduce((a, b) => (b.score < a.score ? b : a)); // 最離譜的
    f.close = wrongList.filter((w) => w.score < 10 && w.score >= 5).sort((a, b) => b.score - a.score)[0] || null; // 最接近的
  }

  // 屬性零失誤制霸：該屬性池內成員（≥2）全部一次命中。
  for (const tk of TYPES) {
    const members = [...byKey.values()].filter((e) => (e.types || []).includes(tk));
    if (members.length >= 2 && members.every((e) => !rec.attempts[e.key])) f.flawlessTypes.push(typeName(tk));
  }

  // 招牌立繪：用剋星，否則隨機一隻已收服。
  f.hero = f.nemesis ? f.nemesis.entry : byKey.get(rec.done[Math.floor(Math.random() * rec.done.length)] || rec.done[0]);
  return f;
}

function viewMasterDone() {
  const ms = masterState;
  const f = computeMasterFacts(ms);
  const corners = ['tl', 'tr', 'bl', 'br'].map((c) => `<span class="who-corner who-corner--${c}">${pokeballSvg()}</span>`).join('');
  const heroFrame = `
    <div class="who-frame master-hero" style="--frame-fill:${frameFill(ms.poolKey, f.total)}">
      ${corners}
      <div class="who-stage revealed"><img class="who-img" alt="${esc(f.hero ? f.hero.nameZh : '')}" src="${esc(f.hero ? f.hero.image : '')}" /></div>
    </div>`;

  const stat = (label, val) => `<div class="master-stat"><span class="master-stat-val">${esc(val)}</span><span class="master-stat-label">${esc(label)}</span></div>`;
  const stats = [
    stat(t('master.stat.mistakes'), String(f.mistakes)),
    stat(t('master.stat.accuracy'), `${f.accuracy}%`),
    stat(t('master.stat.streak'), t('master.stat.streakVal', { n: f.streak })),
    stat(t('master.stat.journey'), t('master.stat.journeyVal', { d: f.days, s: f.sessions })),
  ].join('');

  const memCard = (cls, title, img, line) => `
    <div class="memory-card ${cls}">
      <span class="memory-title">${esc(title)}</span>
      <div class="memory-body">
        ${img ? `<img class="memory-img" alt="" src="${esc(img)}" />` : ''}
        <p class="memory-line">${line}</p>
      </div>
    </div>`;
  const mems = [];
  if (f.nemesis) mems.push(memCard('mem-nemesis', t('master.fact.nemesisTitle'), f.nemesis.entry.image,
    `<strong>${esc(f.nemesis.entry.nameZh)}</strong> ${esc(t('master.fact.nemesis', { n: f.nemesis.n }))}`));
  if (f.nickname) mems.push(memCard('mem-nick', t('master.fact.nicknameTitle'), f.nickname.entry.image,
    esc(t('master.fact.nickname', { name: f.nickname.str }))));
  if (f.close) mems.push(memCard('mem-close', t('master.fact.closeTitle'), f.close.entry.image,
    esc(t('master.fact.close', { typed: f.close.str, name: f.close.entry.nameZh }))));

  const flawlessLine = f.flawlessTypes.length
    ? `<p class="master-flawless">${esc(t('master.fact.flawless', { types: f.flawlessTypes.join('、') }))}</p>` : '';

  const node = el(`
    <section class="card master-done">
      <p class="master-congrats">${esc(t('master.congratsTitle'))}</p>
      ${heroFrame}
      <div class="master-badge">${esc(f.title)}</div>
      <p class="master-caught">${esc(t('master.caughtAll', { pool: poolLabel(ms.poolKey), n: f.total }))}</p>
      <div class="master-grid">${stats}</div>
      ${flawlessLine}
      ${mems.length ? `<p class="label master-mem-label">${esc(t('master.memTitle'))}</p><div class="master-mems">${mems.join('')}</div>` : ''}
      <p class="muted master-shot">${esc(t('master.screenshot'))}</p>
      <button class="btn btn--primary" data-act="again">${esc(t('master.again'))}</button>
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);
  node.querySelector('[data-act="again"]').onclick = () => {
    if (ms.available) resetMaster(ms.poolKey);
    startMaster(ms.poolKey, ms.difficulty);
  };
  setView(node);
}

// ── 我是誰出題 builder：自選一份清單 → 產生代碼 ───────────────────
// 出題瀏覽用的圖鑑：全國圖鑑非 Mega（剪影題以本體為主），依圖鑑編號排序。
function builderDexEntries() {
  return Object.entries(nationalDex)
    .filter(([, v]) => !v.mega)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (a.ndex || 0) - (b.ndex || 0) || (a.key < b.key ? -1 : 1));
}

function viewWhoBuilder() {
  if (!builderState) builderState = { selected: [], difficulty: DEFAULT_WHO_DIFFICULTY, scoreMode: 'count', filter: '', dexOpen: true, setOpen: true };
  const bs = builderState;
  const allEntries = builderDexEntries();
  const byKey = new Map(allEntries.map((e) => [e.key, e]));

  const node = el(`
    <section class="card">
      <h2>${esc(t('builder.title'))}</h2>
      <p class="muted">${esc(t('builder.intro'))}</p>

      <p class="label" data-sel-label></p>
      <div class="builder-selected" data-selected></div>

      <button class="collapse-head" data-toggle="set" aria-expanded="${bs.setOpen}">
        <span>${esc(t('builder.setSection'))}</span><span class="collapse-caret">${bs.setOpen ? '▾' : '▸'}</span>
      </button>
      <div class="collapse-body" data-body="set"${bs.setOpen ? '' : ' hidden'}>
        <p class="label">${esc(t('setup.difficulty'))}</p>
        <div class="season-pick" data-diff></div>
        <p class="label">${esc(t('setup.scoreMode'))}</p>
        <div class="season-pick" data-sm></div>
      </div>

      <button class="collapse-head" data-toggle="dex" aria-expanded="${bs.dexOpen}">
        <span>${esc(t('builder.dexSection'))}</span><span class="collapse-caret">${bs.dexOpen ? '▾' : '▸'}</span>
      </button>
      <div class="collapse-body" data-body="dex"${bs.dexOpen ? '' : ' hidden'}>
        <div class="code-box">
          <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="${esc(t('builder.search'))}" aria-label="${esc(t('builder.search'))}" data-filter />
        </div>
        <div class="builder-dex" data-dex></div>
      </div>

      <div class="doku-share" data-share hidden>
        <p class="label">${esc(t('builder.yourCode'))}</p>
        <div class="code-box">
          <input type="text" readonly aria-label="分享連結" data-share-url />
          <button class="btn btn--accent" data-act="copy">${esc(t('result.copy'))}</button>
        </div>
        <p class="muted" data-share-code></p>
      </div>
      <p class="muted" data-need hidden>${esc(t('builder.needOne'))}</p>
      <button class="btn btn--primary" data-act="make">${esc(t('builder.makeCode'))}</button>
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);

  const selWrap = node.querySelector('[data-selected]');
  const dexWrap = node.querySelector('[data-dex]');
  const shareWrap = node.querySelector('[data-share]');
  const needEl = node.querySelector('[data-need]');

  const renderSelected = () => {
    node.querySelector('[data-sel-label]').textContent = t('builder.selected', { n: bs.selected.length });
    selWrap.innerHTML = '';
    if (!bs.selected.length) { selWrap.innerHTML = `<p class="muted">${esc(t('builder.selectedEmpty'))}</p>`; return; }
    bs.selected.forEach((k) => {
      const p = byKey.get(k);
      if (!p) return;
      const chip = el(`<button class="builder-chip" type="button" title="${esc(p.nameZh)}"><img alt="" loading="lazy" /><span>${esc(p.nameZh)}</span><span class="builder-chip-x">${uiIcon('close')}</span></button>`);
      const im = chip.querySelector('img'); im.src = p.image; im.onerror = () => { im.style.visibility = 'hidden'; };
      chip.onclick = () => { bs.selected = bs.selected.filter((x) => x !== k); renderSelected(); renderDex(); updateMake(); };
      selWrap.appendChild(chip);
    });
  };

  const renderDex = () => {
    const q = normalizeName(bs.filter);
    const list = (q ? allEntries.filter((p) => normalizeName(p.nameZh).includes(q) || normalizeName(p.nameEn).includes(q)) : allEntries);
    dexWrap.innerHTML = '';
    const sel = new Set(bs.selected);
    list.forEach((p) => {
      const on = sel.has(p.key);
      const cellb = el(`<button class="builder-cell${on ? ' builder-cell--on' : ''}" type="button" title="${esc(p.nameZh)}"><img alt="" loading="lazy" /><span class="builder-cell-name">${esc(p.nameZh)}</span></button>`);
      const im = cellb.querySelector('img'); im.src = p.image; im.onerror = () => { im.style.visibility = 'hidden'; };
      cellb.onclick = () => {
        if (sel.has(p.key)) bs.selected = bs.selected.filter((x) => x !== p.key);
        else bs.selected = [...bs.selected, p.key];
        renderSelected(); renderDex(); updateMake();
      };
      dexWrap.appendChild(cellb);
    });
  };

  const updateMake = () => {
    if (bs.selected.length) {
      const seed = bs.codeSeed || (bs.codeSeed = newSeed());
      const code = encodeWhoCustom({ seed, keys: bs.selected, difficulty: bs.difficulty, scoreMode: bs.scoreMode });
      node.querySelector('[data-share-url]').value = shareUrlFor(code);
      node.querySelector('[data-share-code]').textContent = code;
      shareWrap.hidden = false; needEl.hidden = true;
    } else {
      shareWrap.hidden = true; needEl.hidden = false;
    }
  };

  // 難度 / 計分按鈕。
  const diffWrap = node.querySelector('[data-diff]');
  WHO_DIFFICULTIES.forEach((d) => {
    const b = el(`<button class="season-btn" aria-pressed="${bs.difficulty === d}">${esc(difficultyLabel(d))}</button>`);
    b.onclick = () => { bs.difficulty = d; bs.codeSeed = null; viewWhoBuilder(); };
    diffWrap.appendChild(b);
  });
  const smWrap = node.querySelector('[data-sm]');
  scoreModesFor('who').forEach((sm) => {
    const b = el(`<button class="season-btn" aria-pressed="${bs.scoreMode === sm}">${esc(t(`score.${sm}`))}</button>`);
    b.onclick = () => { bs.scoreMode = sm; bs.codeSeed = null; viewWhoBuilder(); };
    smWrap.appendChild(b);
  });

  // 收合區塊。
  node.querySelectorAll('[data-toggle]').forEach((h) => {
    h.onclick = () => {
      const which = h.dataset.toggle;
      if (which === 'set') bs.setOpen = !bs.setOpen; else bs.dexOpen = !bs.dexOpen;
      viewWhoBuilder();
    };
  });

  const filterInput = node.querySelector('[data-filter]');
  filterInput.addEventListener('input', () => { bs.filter = filterInput.value; renderDex(); });
  node.querySelector('[data-act="make"]').onclick = () => { if (!bs.selected.length) { needEl.hidden = false; return; } updateMake(); shareWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const copyBtn = node.querySelector('[data-act="copy"]');
  copyBtn.onclick = async () => {
    const input = node.querySelector('[data-share-url]');
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    copyBtn.textContent = t('result.copied');
    setTimeout(() => (copyBtn.textContent = t('result.copy')), 1500);
  };

  renderSelected();
  renderDex();
  updateMake();
  setView(node);
}

// 自訂題庫挑戰：用代碼帶的清單組一份我是誰直接開始。
function startCustomWho(decoded) {
  const pool = decoded.keys.map((k) => (nationalDex[k] ? { key: k, ...nationalDex[k] } : null)).filter(Boolean);
  if (!pool.length) return viewHome();
  let quiz;
  try { quiz = generateWhoQuizFromKeys(decoded.seed, pool, decoded.difficulty); }
  catch (e) { console.error(e); return viewHome(); }
  session = { quiz, answers: [], index: 0, locked: false, challenge: null, saved: false, meta: { mode: 'who', season: '', difficulty: decoded.difficulty, count: quiz.count, scoreMode: decoded.scoreMode } };
  go('#/quiz');
}

function answer(choice, node) {
  if (session.locked) return;
  session.locked = true;
  const q = session.quiz.questions[session.index];
  session.answers[session.index] = choice;

  node.querySelectorAll('.option').forEach((b, i) => {
    b.disabled = true;
    if (i === q.correctIndex) b.classList.add('option--correct');
    else if (i === choice) b.classList.add('option--wrong');
  });

  const right = choice === q.correctIndex;
  const fb = node.querySelector('.feedback');
  if (q.mode === 'speed') {
    node.querySelectorAll('[data-speed]').forEach((s) => { s.hidden = false; });
    const faster = q.options[q.correctIndex];
    fb.textContent = (right ? '答對了！' : '答錯了，') + t('speed.fasterIs', { name: faster.nameZh, speed: faster.speed });
  } else {
    fb.textContent = right ? t('quiz.correct') : t('quiz.wrong', { answer: formatMultiplier(q.correct) });
  }
  fb.classList.add(right ? 'feedback--good' : 'feedback--bad');

  const last = session.index === session.quiz.count - 1;
  const next = node.querySelector('[data-act="next"]');
  next.textContent = last ? t('quiz.finish') : t('quiz.next');
  next.hidden = false;
  next.onclick = () => {
    if (last) { go('#/result'); return; }
    session.index++;
    session.locked = false;
    render();
  };
  next.focus();
}

// ── 結果區塊（測驗完成頁與歷史詳情頁共用）──────────────────────
function reviewItem(q, ok, userAnswer, mark) {
  let detail;
  if (q.mode === 'who') {
    const typed = String(userAnswer == null ? '' : userAnswer).trim();
    detail = `
      <img class="rv-img" alt="" src="${esc(q.image)}" />
      <span class="rv-poke">${esc(q.nameZh)}${q.mega ? ' <span class="mega-tag">MEGA</span>' : ''}</span>
      <span class="rv-tail">${typed ? esc(typed) : '—'}</span>`;
  } else if (q.mode === 'speed') {
    const [a, b] = q.pair;
    const faster = q.options[q.correctIndex];
    detail = `
      <span class="rv-poke">${esc(a.nameZh)} <em>${a.speed}</em></span>
      <span class="matchup__vs">vs</span>
      <span class="rv-poke">${esc(b.nameZh)} <em>${b.speed}</em></span>
      <span class="rv-tail">${esc(faster.nameZh)} 快</span>`;
  } else {
    detail = `
      ${badge(q.atk)} <span class="matchup__vs">→</span> ${q.def.map((d) => badge(d)).join(' ')}
      <span class="rv-tail">${esc(formatMultiplier(q.correct))}</span>`;
  }
  const markClass = mark ? `review__mark--${mark.tone}` : (ok ? 'review__mark--ok' : 'review__mark--no');
  const markText = mark ? esc(mark.text) : (ok ? '✓' : '✗');
  const item = el(`
    <div class="review__item">
      <span class="review__mark ${markClass}">${markText}</span>
      ${detail}
    </div>`);
  if (q.mode === 'who') {
    const im = item.querySelector('.rv-img');
    if (im) im.onerror = () => { im.style.visibility = 'hidden'; };
  }
  return item;
}

function buildResultSection(quiz, answers, opts = {}) {
  const meta = opts.meta || { mode: quiz.mode || 'type', season: '', difficulty: quiz.difficulty || 'all' };
  const difficulty = meta.difficulty || 'all';
  const sm = (meta.mode === 'who' ? meta.scoreMode : (meta.scoreMode === 'char' ? 'count' : meta.scoreMode)) || 'count';
  const charScore = sm === 'char';
  const score100 = sm === 'normal';
  const usePct = charScore || score100; // 顯示 /100（不計分顯示題數）
  const total = quiz.count;

  const correct = scoreQuiz(quiz, answers);
  // 不計分/正常計分：算對幾題（正常計分換算 /100）。按字計分：各題 whoCharScore 加總換算 /100。
  const pct = charScore ? charPct(quiz, answers) : (correct / total) * 100;

  const code = encodeResult({ mode: meta.mode, season: meta.season, seed: quiz.seed, total, score: charScore ? pct : correct, difficulty, charScore, score100 });
  const shareUrl = shareUrlFor(code);

  let challengeHtml = '';
  if (opts.challenge) {
    const th = opts.challenge;
    const themPct = pctOf({ charScore: th.charScore, score: th.score, total: th.total });
    const themUsePct = th.charScore || th.score100;
    const you = usePct ? fmtPct(pct) : String(correct);
    const them = themUsePct ? fmtPct(themPct) : String(th.score);
    const eps = 1e-9;
    let msg;
    if (pct > themPct + eps) msg = t('challenge.beat', { you, them });
    else if (Math.abs(pct - themPct) <= eps) msg = t('challenge.tie', { you });
    else msg = t('challenge.lose', { you, them });
    challengeHtml = `<div class="banner"><p style="font-weight:800;font-size:1.2rem">${esc(msg)}</p></div>`;
  }

  const title = opts.history ? '這次紀錄' : t('result.title');
  // 不計分：寫「答對 X / Y 題」；正常/按字計分：顯示 /100。
  const bigScore = usePct ? `${esc(fmtPct(pct))} / 100` : `${correct} / ${total}`;
  const scoreSub = charScore ? t('result.scoreChar', { total }) : t('result.score', { score: correct, total });

  const node = el(`
    <section>
      ${challengeHtml}
      <div class="card">
        <h2>${esc(title)}</h2>
        <p class="score-sub" style="margin-bottom:4px">${esc(quizLabel(meta.mode, meta.season, difficulty))}${sm !== 'count' ? ' · ' + esc(t('score.' + sm)) : ''}</p>
        <div class="score-big">${bigScore}</div>
        <p class="score-sub">${esc(scoreSub)}</p>

        <p class="label">${esc(t('result.yourCode'))}</p>
        <div class="code-box">
          <input type="text" readonly value="${esc(shareUrl)}" aria-label="分享連結" />
          <button class="btn btn--accent" data-act="copy">${esc(t('result.copy'))}</button>
        </div>
        <p class="muted">${esc(code)}</p>

        <button class="btn btn--primary" data-act="retry" style="margin-top:14px">${esc(t('result.retry'))}</button>
        <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
      </div>

      <div class="card">
        <h2>${esc(t('result.review'))}</h2>
        <div class="review"></div>
      </div>
    </section>`);

  const reviewWrap = node.querySelector('.review');
  quiz.questions.forEach((q, i) => {
    if (charScore && q.mode === 'who') {
      const s = whoCharScore(q, answers[i]);
      reviewWrap.appendChild(reviewItem(q, s >= 10, answers[i], { text: fmtPct(s), tone: s >= 10 ? 'ok' : s > 0 ? 'mid' : 'no' }));
    } else {
      const ok = q.mode === 'who' ? whoAnswerCorrect(q, answers[i]) : answers[i] === q.correctIndex;
      reviewWrap.appendChild(reviewItem(q, ok, answers[i]));
    }
  });

  const copyBtn = node.querySelector('[data-act="copy"]');
  copyBtn.onclick = async () => {
    const input = node.querySelector('.code-box input');
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    copyBtn.textContent = t('result.copied');
    setTimeout(() => (copyBtn.textContent = t('result.copy')), 1500);
  };
  node.querySelector('[data-act="retry"]').onclick = () =>
    startQuiz({ mode: meta.mode, season: meta.season, seed: newSeed(), difficulty, count: total, scoreMode: sm });

  return { node, pct, correct, total, scoreMode: sm, charScore, code };
}

// ── 結果畫面（剛完成的測驗）────────────────────────────────────
function viewResult() {
  if (!session || session.answers.length < session.quiz.count) return viewHome();
  const { quiz, answers, challenge, meta } = session;
  const { node, pct, correct, total, scoreMode, charScore, code } = buildResultSection(quiz, answers, { challenge, meta });

  if (!session.saved) {
    addHistory({
      mode: meta.mode, season: meta.season, difficulty: meta.difficulty || 'all', seed: quiz.seed,
      total, scoreMode, score: charScore ? pct : correct, answers: answers.slice(), code, ts: Date.now(),
    });
    session.saved = true;
  }

  setView(node);
}

// ── 歷史詳情畫面 ───────────────────────────────────────────────
function viewHistoryDetail() {
  const rec = viewingHistory;
  if (!rec) return viewHome();
  const meta = { mode: rec.mode || 'type', season: rec.season || '', difficulty: rec.difficulty || 'all', scoreMode: rec.scoreMode || 'count' };
  let quiz;
  try {
    quiz = buildQuiz({ mode: meta.mode, season: meta.season, seed: rec.seed, total: rec.total, difficulty: meta.difficulty });
  } catch {
    return viewHome();
  }
  const { node } = buildResultSection(quiz, rec.answers, { history: true, meta });
  setView(node);
}

// ── 挑戰邀請畫面（從成績碼連結 / 輸入代碼進來）─────────────────
function viewChallenge(decoded) {
  // 自訂題庫挑戰：用作者精選的清單玩一份我是誰。
  if (decoded.mode === 'who-custom') {
    const node = el(`
      <section class="card">
        <h2>${esc(t('builder.challengeTitle'))}</h2>
        <p class="score-sub" style="margin-bottom:8px">${esc(t('quiz.who.title'))}</p>
        <p class="lead">${esc(t('builder.challengeBody', { n: decoded.keys.length, difficulty: difficultyLabel(decoded.difficulty) }))}</p>
        <button class="btn btn--primary" data-act="accept">${esc(t('builder.challengeStart'))}</button>
        <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
      </section>`);
    node.querySelector('[data-act="accept"]').onclick = () => startCustomWho(decoded);
    return setView(node);
  }
  // 挖坑挑戰：帶 seed 進同一盤，9 個坑要避開、每格選別的合法解。
  if (decoded.mode === 'doku-trap') {
    const node = el(`
      <section class="card">
        <h2>${esc(t('doku.trap.challengeTitle'))}</h2>
        <p class="score-sub" style="margin-bottom:8px">${esc(t('quiz.doku.title'))}</p>
        <p class="lead">${esc(t('doku.trap.challengeBody'))}</p>
        <button class="btn btn--primary" data-act="accept">${esc(t('doku.trap.challengeStart'))}</button>
        <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
      </section>`);
    node.querySelector('[data-act="accept"]').onclick = () => {
      dokuState = { seed: decoded.seed, hintMode: decoded.hintMode || 'hint', play: 'trap-solve', pits: decoded.pits, challenge: null };
      go('#/doku');
    };
    return setView(node);
  }
  // 數獨：獨立盤面，不走線性測驗的 startQuiz；帶 seed 進盤、保留對手分數作完局比較。
  if (decoded.mode === 'doku') {
    const coplayD = decoded.score === 0;
    const node = el(`
      <section class="card">
        <h2>${esc(coplayD ? t('doku.coplayTitle') : t('doku.challengeTitle'))}</h2>
        <p class="score-sub" style="margin-bottom:8px">${esc(t('quiz.doku.title'))}</p>
        <p class="lead">${esc(coplayD ? t('doku.coplayBody') : t('doku.challengeBody', { score: decoded.score }))}</p>
        <button class="btn btn--primary" data-act="accept">${esc(coplayD ? t('doku.coplayStart') : t('doku.challengeStart'))}</button>
        <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
      </section>`);
    node.querySelector('[data-act="accept"]').onclick = () => {
      dokuState = { seed: decoded.seed, challenge: coplayD ? null : { score: decoded.score } };
      go('#/doku');
    };
    return setView(node);
  }
  const coplay = decoded.score === 0;
  const title = coplay ? t('challenge.coplayTitle') : t('challenge.title');
  const body = coplay
    ? t('challenge.coplayBody', { total: decoded.total })
    : ((decoded.charScore || decoded.score100)
        ? t('challenge.bodyPct', { score: fmtPct(pctOf(decoded)) })
        : t('challenge.body', { score: decoded.score, total: decoded.total }));
  const startLabel = coplay ? t('challenge.coplayStart') : t('challenge.start');

  const node = el(`
    <section class="card">
      <h2>${esc(title)}</h2>
      <p class="score-sub" style="margin-bottom:8px">${esc(quizLabel(decoded.mode, decoded.season, decoded.difficulty))}</p>
      <p class="lead">${esc(body)}</p>
      <button class="btn btn--primary" data-act="accept">${esc(startLabel)}</button>
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);
  node.querySelector('[data-act="accept"]').onclick = () =>
    startQuiz({
      mode: decoded.mode,
      season: decoded.season,
      difficulty: decoded.difficulty,
      seed: decoded.seed,
      count: decoded.total,
      scoreMode: decoded.charScore ? 'char' : decoded.score100 ? 'normal' : 'count',
      challenge: coplay ? null : { total: decoded.total, score: decoded.score, charScore: !!decoded.charScore, score100: !!decoded.score100 },
    });
  setView(node);
}

// ── 相剋查詢畫面 ───────────────────────────────────────────────
let chartState = { atk: 'fire', def: ['grass'] };

function viewChart() {
  const node = el(`
    <section>
      <div class="card">
        <h2>${esc(t('chart.title'))}</h2>
        <div class="chart-controls">
          <div>
            <p class="label">${esc(t('chart.attack'))}</p>
            <div class="type-grid" data-grid="atk"></div>
          </div>
          <div>
            <p class="label">${esc(t('chart.defense'))}（1～2 個）</p>
            <div class="type-grid" data-grid="def"></div>
          </div>
        </div>
        <div class="chart-result"></div>
        <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
      </div>

      <div class="card">
        <h2>完整相剋表</h2>
        <p class="muted">${esc(t('chart.gridHint'))}</p>
        <div class="table-wrap"></div>
      </div>
    </section>`);

  const atkGrid = node.querySelector('[data-grid="atk"]');
  const defGrid = node.querySelector('[data-grid="def"]');
  const resultBox = node.querySelector('.chart-result');

  const renderResult = () => {
    const m = multiplier(chartState.atk, chartState.def);
    const atkN = typeName(chartState.atk);
    const defN = chartState.def.map(typeName).join(' / ');
    resultBox.innerHTML = `${esc(formatMultiplier(m))}<small>${esc(atkN)} → ${esc(defN)}</small>`;
  };

  TYPES.forEach((tk) => {
    const m = TYPE_META[tk];
    const a = el(`<button class="type-pick" style="background:${m.color}" aria-pressed="${chartState.atk === tk}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    a.onclick = () => {
      chartState.atk = tk;
      atkGrid.querySelectorAll('.type-pick').forEach((b, i) =>
        b.setAttribute('aria-pressed', String(TYPES[i] === tk)));
      renderResult();
    };
    atkGrid.appendChild(a);

    const d = el(`<button class="type-pick" style="background:${m.color}" aria-pressed="${chartState.def.includes(tk)}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    d.onclick = () => {
      const has = chartState.def.includes(tk);
      if (has) {
        if (chartState.def.length > 1) chartState.def = chartState.def.filter((x) => x !== tk);
      } else {
        chartState.def = [...chartState.def, tk].slice(-2);
      }
      defGrid.querySelectorAll('.type-pick').forEach((b, i) =>
        b.setAttribute('aria-pressed', String(chartState.def.includes(TYPES[i]))));
      renderResult();
    };
    defGrid.appendChild(d);
  });

  renderResult();
  node.querySelector('.table-wrap').appendChild(buildChartTable());
  setView(node);
}

function buildChartTable() {
  const cls = (m) => m === 0 ? 'm0' : m === 0.5 ? 'm05' : m === 2 ? 'm2' : 'm1';
  let head = '<tr><th style="background:var(--c-muted)" title="攻↓ 防→">↘</th>';
  for (const d of TYPES) head += `<th style="background:${TYPE_META[d].color}" title="${esc(typeName(d))}">${esc(typeName(d)[0])}</th>`;
  head += '</tr>';

  let rows = '';
  for (const a of TYPES) {
    rows += `<tr><th style="background:${TYPE_META[a].color}" title="${esc(typeName(a))}">${esc(typeName(a)[0])}</th>`;
    for (const d of TYPES) {
      const m = multiplier(a, [d]);
      rows += `<td class="${cls(m)}" title="${esc(typeName(a))}→${esc(typeName(d))} ${formatMultiplier(m)}">${m === 1 ? '' : formatMultiplier(m).replace('×', '')}</td>`;
    }
    rows += '</tr>';
  }
  return el(`<table class="chart">${head}${rows}</table>`);
}

// ── 速度線表（種族值 → Lv50 實數值，依賽季）─────────────────────
function viewSpeedChart() {
  app.classList.add('app--wide'); // 大螢幕放寬版面，寬表格更好讀
  // 入口只在「誰比較快」的 setup；直接帶網址進來時補一個預設賽季狀態。
  if (!setupState || setupState.mode !== 'speed') {
    setupState = { mode: 'speed', season: defaultSeason(), difficulty: DEFAULT_SPEED_DIFFICULTY, seed: newSeed() };
  }
  const season = setupState.season;

  const node = el(`
    <section>
      <div class="card">
        <div class="spd-head">
          <h2>${esc(t('speedline.title'))}</h2>
          <p class="muted">${esc(t('speedline.hint'))}</p>
          <div class="season-pick" data-seasons></div>
          <div class="code-box spd-search">
            <input type="text" inputmode="text" autocomplete="off" spellcheck="false"
                   placeholder="${esc(t('speedline.search'))}" aria-label="${esc(t('speedline.searchBtn'))}" data-spd-search />
            <button class="btn btn--accent" data-act="spd-go" aria-label="${esc(t('speedline.searchBtn'))}">${uiIcon('search')}</button>
          </div>
          <p class="feedback feedback--bad spd-search__msg" data-spd-msg hidden></p>
          <div class="spd-perrow">
            <span class="spd-perrow-label">${esc(t('speedline.perRow'))}</span>
            <button class="season-btn" data-perrow="5" aria-pressed="${spdPerRow === 5}">${esc(t('speedline.perRowUnit', { n: 5 }))}</button>
            <button class="season-btn" data-perrow="10" aria-pressed="${spdPerRow === 10}">${esc(t('speedline.perRowUnit', { n: 10 }))}</button>
          </div>
        </div>
        <div class="table-wrap" data-table></div>
        <p class="muted spd-legend">${esc(t('speedline.legend'))}</p>
        <button class="btn btn--ghost" data-nav="setup">${esc(t('common.back'))}</button>
      </div>
      <button class="spd-top" data-act="spd-top" aria-label="${esc(t('speedline.toTop'))}">${uiIcon('up')}</button>
    </section>`);

  const seasonWrap = node.querySelector('[data-seasons]');
  seasonKeys().forEach((key) => {
    const b = el(`<button class="season-btn" aria-pressed="${season === key}">${esc(seasonLabel(key))}</button>`);
    b.onclick = () => { setupState.season = key; viewSpeedChart(); };
    seasonWrap.appendChild(b);
  });

  node.querySelector('[data-table]').appendChild(buildSpeedTable(season, spdPerRow));

  node.querySelectorAll('[data-perrow]').forEach((b) => {
    b.onclick = () => {
      spdPerRow = Number(b.dataset.perrow) === 5 ? 5 : 10;
      try { localStorage.setItem(SPD_PERROW_KEY, String(spdPerRow)); } catch { /* 存不了就只在本次有效 */ }
      viewSpeedChart();
    };
  });

  // 模糊搜尋：子序列比對抓出所有符合者，按搜尋逐一切下一個、到底循環回第一個。
  const pool = seasonPool(season);
  const input = node.querySelector('[data-spd-search]');
  const msg = node.querySelector('[data-spd-msg]');
  let lastQ = '', matchIdx = -1;
  const doSearch = () => {
    const q = normalizeName(input.value);
    if (!q) return;
    const qa = Array.from(q);
    // 子序列：查詢字依序出現即可、中間可跳字（「阿九尾」→ 阿羅拉九尾）。
    const subseq = (n) => {
      let i = 0;
      for (const ch of Array.from(n)) { if (ch === qa[i] && ++i === qa.length) return true; }
      return false;
    };
    // 所有符合者，依表格顯示順序（速度高→低、同速依中文名）排序。
    const matches = pool
      .filter((p) => subseq(normalizeName(p.nameZh)) || subseq(normalizeName(p.nameEn)))
      .sort((a, b) => b.speed - a.speed || (a.nameZh < b.nameZh ? -1 : a.nameZh > b.nameZh ? 1 : 0));
    if (!matches.length) {
      msg.textContent = t('speedline.noMatch');
      msg.classList.add('feedback--bad'); msg.classList.remove('spd-search__msg--info');
      msg.hidden = false;
      return;
    }
    // 同一查詢：往下一個切、到底循環；換查詢：回第一個。
    if (q === lastQ) matchIdx = (matchIdx + 1) % matches.length;
    else { lastQ = q; matchIdx = 0; }
    const target = matches[matchIdx];

    if (matches.length > 1) {
      msg.textContent = t('speedline.matchNth', { i: matchIdx + 1, n: matches.length });
      msg.classList.remove('feedback--bad'); msg.classList.add('spd-search__msg--info');
      msg.hidden = false;
    } else { msg.hidden = true; }

    const row = node.querySelector(`tr[data-spe="${target.speed}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('row-hl');
    void row.offsetWidth; // 強制 reflow，讓動畫可重複觸發
    row.classList.add('row-hl');
    row.addEventListener('animationend', () => row.classList.remove('row-hl'), { once: true });
    // 同速多隻時，標出目前這一隻立繪。
    node.querySelectorAll('.spd-img--hl').forEach((im) => im.classList.remove('spd-img--hl'));
    const im = [...row.querySelectorAll('.spd-img')].find((x) => x.alt === target.nameZh);
    if (im) im.classList.add('spd-img--hl');
  };
  node.querySelector('[data-act="spd-go"]').onclick = doSearch;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  input.addEventListener('input', () => { msg.hidden = true; });
  node.querySelector('[data-act="spd-top"]').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  setView(node);
}

// 同速排一列；每欄為該種族值在 Lv50 的實數值換算。
function buildSpeedTable(season, perRow = 10) {
  const pool = seasonPool(season);
  // 容器寬度＝恰好 perRow 隻立繪（32px + 2px gap），第 perRow+1 隻自動換行。
  const wrapW = perRow * 32 + (perRow - 1) * 2 + 2;
  const bySpeed = new Map();
  for (const p of pool) {
    if (!bySpeed.has(p.speed)) bySpeed.set(p.speed, []);
    bySpeed.get(p.speed).push(p);
  }
  const speeds = [...bySpeed.keys()].sort((a, b) => b - a);

  const cols = [
    ['max', '最速'], ['neu', '準速'], ['noInv', '無振'], ['neg', '減速'],
    ['scarfMax', '圍巾·最速'], ['scarfNeu', '圍巾·準速'],
    ['twMax', '順風·最速'], ['twNeu', '順風·準速'], ['twNoInv', '順風·無振'],
  ];

  // 種族值第一欄；立繪第二欄加寬（同速一整排不換行）；其後接各速度線。
  let head = `<tr><th class="spd-base">種族</th><th class="spd-mons">寶可夢</th>`;
  for (const [, label] of cols) head += `<th>${esc(label)}</th>`;
  head += '</tr>';

  let rows = '';
  for (const spe of speeds) {
    const ln = speedLines(spe);
    const mons = bySpeed.get(spe)
      .slice()
      .sort((a, b) => (a.nameZh < b.nameZh ? -1 : a.nameZh > b.nameZh ? 1 : 0))
      .map((p) => `<img class="spd-img" src="${esc(p.image)}" alt="${esc(p.nameZh)}" title="${esc(p.nameZh)}" loading="lazy" />`)
      .join('');
    rows += `<tr data-spe="${spe}"><th class="spd-base">${spe}</th><td class="spd-mons"><div class="spd-mons-wrap" style="width:${wrapW}px">${mons}</div></td>`;
    for (const [k] of cols) rows += `<td>${ln[k]}</td>`;
    rows += '</tr>';
  }
  const table = el(`<table class="chart spd">${head}${rows}</table>`);
  table.querySelectorAll('.spd-img').forEach((im) => { im.onerror = () => { im.style.visibility = 'hidden'; }; });
  return table;
}

// ── 圖鑑（題庫預覽：縮圖牆 + 類別/屬性過濾）─────────────────────
let dexState = { group: 'gen', poolKey: 'g1', type: '' };
function dexCategories() {
  return dexState.group === 'gen' ? [...GENERATIONS.map((g) => g.key), 'hisui'] : seasonKeys();
}
function dexCatLabel(key) {
  return dexState.group === 'gen' ? poolLabel(key) : seasonLabel(key);
}

function viewDex() {
  if (!dexCategories().includes(dexState.poolKey)) dexState.poolKey = dexCategories()[0];
  // 世代/地區 → nationalDex；賽制 → 賽季名單。兩者皆走 whoPool。依圖鑑編號排序。
  const pool = whoPool(dexState.poolKey)
    .slice()
    .sort((a, b) => (a.ndex || a.dex || 0) - (b.ndex || b.dex || 0) || (a.key < b.key ? -1 : 1));

  const node = el(`
    <section>
      <div class="card">
        <h2>${esc(t('dex.title'))}</h2>
        <div class="dex-groups">
          <button class="seg" data-group="gen" aria-pressed="${dexState.group === 'gen'}">${esc(t('dex.group.gen'))}</button>
          <button class="seg" data-group="season" aria-pressed="${dexState.group === 'season'}">${esc(t('dex.group.season'))}</button>
        </div>
        <div class="tab-scroll" data-cats></div>
        <div class="dex-types" data-types></div>
        <p class="muted" data-count></p>
        <div class="dex-grid" data-grid></div>
        <button class="btn btn--ghost" data-nav="setup">${esc(t('common.back'))}</button>
      </div>
      <button class="spd-top" data-act="dex-top" aria-label="${esc(t('speedline.toTop'))}">${uiIcon('up')}</button>
    </section>`);

  node.querySelectorAll('[data-group]').forEach((b) => {
    b.onclick = () => {
      if (dexState.group === b.dataset.group) return;
      dexState.group = b.dataset.group;
      dexState.poolKey = dexCategories()[0];
      dexState.type = '';
      viewDex();
    };
  });

  const catWrap = node.querySelector('[data-cats]');
  dexCategories().forEach((key) => {
    const b = el(`<button class="season-btn" aria-pressed="${dexState.poolKey === key}">${esc(dexCatLabel(key))}</button>`);
    b.onclick = () => { dexState.poolKey = key; dexState.type = ''; viewDex(); };
    catWrap.appendChild(b);
  });

  // 屬性過濾（全部 + 18 屬性，單選）
  const typeWrap = node.querySelector('[data-types]');
  const allChip = el(`<button class="dex-type-chip dex-type-chip--all" data-type="">${esc(t('dex.type.all'))}</button>`);
  typeWrap.appendChild(allChip);
  TYPES.forEach((tk) => {
    const m = TYPE_META[tk];
    const c = el(`<button class="dex-type-chip" data-type="${tk}" style="background:${m.color}" title="${esc(typeName(tk))}" aria-label="${esc(typeName(tk))}">${typeIcon(tk)}</button>`);
    typeWrap.appendChild(c);
  });

  // 縮圖牆
  const grid = node.querySelector('[data-grid]');
  const countEl = node.querySelector('[data-count]');
  let toastTimer = null, activeName = null;
  const showName = (nameEl) => {
    if (activeName && activeName !== nameEl) activeName.classList.remove('show');
    if (toastTimer) clearTimeout(toastTimer);
    activeName = nameEl;
    nameEl.classList.add('show');
    toastTimer = setTimeout(() => { nameEl.classList.remove('show'); activeName = null; }, 5000);
  };
  pool.forEach((p) => {
    const cell = el(`
      <button class="dex-cell" data-types="${esc((p.types || []).join(' '))}">
        <img class="dex-thumb" alt="${esc(p.nameZh)}" loading="lazy" />
        <span class="dex-name">${esc(p.nameZh)}${p.mega ? ' <span class="mega-tag">MEGA</span>' : ''}</span>
      </button>`);
    const img = cell.querySelector('img');
    img.src = p.image;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    cell.onclick = () => showName(cell.querySelector('.dex-name'));
    grid.appendChild(cell);
  });

  // 屬性過濾：切換 cell 顯示（不重繪、不重載圖）
  const cells = [...grid.querySelectorAll('.dex-cell')];
  const chips = [...typeWrap.querySelectorAll('.dex-type-chip')];
  const applyType = (tk) => {
    dexState.type = tk;
    chips.forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.type === tk)));
    let shown = 0;
    cells.forEach((c) => {
      const ok = tk === '' || c.dataset.types.split(' ').includes(tk);
      c.hidden = !ok;
      if (ok) shown++;
    });
    countEl.textContent = t('dex.count', { n: shown });
  };
  chips.forEach((ch) => { ch.onclick = () => applyType(ch.dataset.type); });
  applyType(dexState.type);

  node.querySelector('[data-act="dex-top"]').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  setView(node);
}

// ── 寶可夢數獨（PokeDoku-style 3×3 盤面）─────────────────────────
// 軸標籤：屬性用 type-badge，其餘（地區/純單屬性/Mega/名字字數）用文字 pill。
function dokuTag(cat) {
  return cat.kind === 'type' ? badge(cat.value) : `<span class="doku-tag">${esc(cat.label)}</span>`;
}
// 搜尋彈窗標頭的條件文字（純文字，不放 badge）。
function condText(cat) {
  return cat.kind === 'type' ? typeName(cat.value) : cat.label;
}

function viewDoku() {
  if (!dokuState || !dokuState.seed) dokuState = { seed: newSeed(), hintMode: 'hint', play: 'practice', pits: null, challenge: null };
  // 同 seed → 同盤；換 seed 才重算並清空作答。
  if (!dokuState.puzzle || dokuState.puzzle.seed !== String(dokuState.seed)) {
    dokuState.puzzle = generateDoku(dokuState.seed, nationalDex);
    dokuState.picks = Array(9).fill(null);
    dokuState.revealed = false;
  }
  const pz = dokuState.puzzle;
  const hintMode = dokuState.hintMode || 'hint';
  const isAuthor = dokuState.play === 'trap-author';
  const isSolve = dokuState.play === 'trap-solve';
  const introText = isAuthor ? t('doku.trap.authoringHint') : isSolve ? t('doku.trap.challengeBody') : t('doku.intro');

  const node = el(`
    <section>
      <div data-cmp hidden></div>
      <div class="card">
        <h2>${esc(t('doku.title'))}</h2>
        <p class="muted">${esc(introText)}</p>
        <div class="doku" data-board></div>
        <p class="doku-score" data-score></p>
        <div class="doku-share" data-share hidden>
          <p class="label" data-share-label></p>
          <div class="code-box">
            <input type="text" readonly aria-label="分享連結" data-share-url />
            <button class="btn btn--accent" data-act="copy-doku">${esc(t('result.copy'))}</button>
          </div>
          <p class="muted" data-share-code></p>
        </div>
        <p class="muted" data-trap-need hidden>${esc(t('doku.trap.needFill'))}</p>
        <button class="btn btn--ghost" data-act="reveal" hidden></button>
        <button class="btn btn--primary" data-act="newpuzzle">${esc(t('doku.newPuzzle'))}</button>
        <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
        <p class="doku-ref"><a href="https://pokedoku.com/" target="_blank" rel="noopener noreferrer">${esc(t('doku.ref'))}</a></p>
      </div>
    </section>`);

  const board = node.querySelector('[data-board]');
  const scoreEl = node.querySelector('[data-score]');
  const revealBtn = node.querySelector('[data-act="reveal"]');
  const cmpEl = node.querySelector('[data-cmp]');
  const shareWrap = node.querySelector('[data-share]');
  const trapNeed = node.querySelector('[data-trap-need]');

  const rebuild = () => { renderBoard(); updateStatus(); };

  // 開啟作答：提示＝搜尋清單、無提示＝純打字；挖坑挑戰要排除該格的「坑」。
  const fillCell = (idx) => {
    const pit = isSolve && dokuState.pits ? dokuState.pits[idx] : null;
    if (hintMode === 'nohint') openDokuTextInput(idx, rebuild, pit);
    else openDokuPicker(idx, rebuild, pit);
  };

  function buildDokuCell(idx) {
    const pick = dokuState.picks[idx];
    // #3：揭露參考答案放在獨立小條，不蓋掉使用者原本填的（只在一般練習、答錯或空白時顯示）。
    const ref = dokuState.revealed && (!pick || !pick.correct) ? pz.cells[idx] : null;
    const refStrip = ref ? `
      <span class="doku-ref-ans">
        <span class="doku-ref-label">${esc(t('doku.refLabel'))}</span>
        <img class="doku-ref-img" alt="" src="${esc(ref.canonicalImage)}" />
        <span class="doku-ref-name">${esc(ref.canonicalName)}</span>
      </span>` : '';
    if (!pick) {
      const cell = el(`<button class="doku-cell doku-cell--empty" data-cell="${idx}" aria-label="${esc(t('doku.cellEmpty'))}">${refStrip}</button>`);
      cell.onclick = () => fillCell(idx);
      return cell;
    }
    const tone = pick.correct ? 'ok' : 'no';
    // #2 無提示：查無對應寶可夢時顯示使用者打的字，而非立繪縮圖。
    const main = pick.typed
      ? `<span class="doku-cell-name doku-cell-name--typed">${esc(pick.name)}</span>`
      : `<img class="doku-thumb" alt="${esc(pick.name)}" /><span class="doku-cell-name">${esc(pick.name)}${pick.mega ? ' <span class="mega-tag">MEGA</span>' : ''}</span>`;
    const cell = el(`<div class="doku-cell doku-cell--${tone}${isAuthor ? ' doku-cell--editable' : ''}">${main}${refStrip}</div>`);
    const img = cell.querySelector('.doku-thumb');
    if (img) { img.src = pick.image; img.onerror = () => { img.style.visibility = 'hidden'; }; }
    // 挖坑出題：未鎖定，點任一格可改填，直到滿意再產生代碼。
    if (isAuthor) cell.onclick = () => fillCell(idx);
    return cell;
  }

  function renderBoard() {
    board.innerHTML = '';
    board.appendChild(el(`<div class="doku-corner">${uiIcon('grid')}</div>`));
    pz.cols.forEach((c) => board.appendChild(el(`<div class="doku-axis doku-axis--col">${dokuTag(c)}</div>`)));
    for (let r = 0; r < 3; r++) {
      board.appendChild(el(`<div class="doku-axis doku-axis--row">${dokuTag(pz.rows[r])}</div>`));
      for (let c = 0; c < 3; c++) board.appendChild(buildDokuCell(r * 3 + c));
    }
  }

  function updateStatus() {
    const picks = dokuState.picks;
    const filled = picks.filter(Boolean).length;
    const ok = picks.filter((p) => p && p.correct).length;
    const allFilled = picks.every(Boolean);

    if (isAuthor) {
      // 坑必須是真實寶可夢（無提示打錯字的 typed 格 key 為 null，不能當坑）。
      const allValid = allFilled && picks.every((p) => p.key);
      scoreEl.textContent = t('doku.progress', { n: filled, ok });
      scoreEl.className = 'doku-score';
      trapNeed.hidden = allValid;
      revealBtn.hidden = false;       // 出題時隨機補滿可重複按（每次重抽不同的坑）
      revealBtn.textContent = t('doku.trap.fillReveal');
      if (allValid) {
        // 坑＝每格填的那隻；全填滿且皆有效才產生挖坑代碼。
        const code = encodeDokuTrap({ seed: pz.seed, pits: picks.map((p) => p.key), hintMode });
        shareWrap.querySelector('[data-share-label]').textContent = t('doku.trap.yourCode');
        node.querySelector('[data-share-url]').value = shareUrlFor(code);
        node.querySelector('[data-share-code]').textContent = code;
      }
      shareWrap.hidden = !allValid;
      cmpEl.hidden = true;
      return;
    }

    if (isSolve) {
      scoreEl.textContent = allFilled ? t('doku.trap.done', { ok }) : t('doku.trap.progress', { n: filled, ok });
      scoreEl.className = 'doku-score' + (allFilled ? ' doku-score--done' : '');
      revealBtn.hidden = true;       // 避坑挑戰不提供揭露（會破壞挑戰）
      shareWrap.hidden = true;
      trapNeed.hidden = true;
      cmpEl.hidden = true;
      return;
    }

    // 一般練習
    scoreEl.textContent = allFilled ? t('doku.done', { ok }) : t('doku.progress', { n: filled, ok });
    scoreEl.className = 'doku-score' + (allFilled ? ' doku-score--done' : '');
    revealBtn.hidden = dokuState.revealed || (allFilled && ok === 9);
    revealBtn.textContent = t('doku.reveal');
    trapNeed.hidden = true;

    const code = encodeResult({ mode: 'doku', season: '', seed: pz.seed, total: 9, score: ok, difficulty: 'all' });
    shareWrap.querySelector('[data-share-label]').textContent = t('doku.yourCode');
    node.querySelector('[data-share-url]').value = shareUrlFor(code);
    node.querySelector('[data-share-code]').textContent = code;
    shareWrap.hidden = false;

    if (allFilled && dokuState.challenge) {
      const them = dokuState.challenge.score;
      const msg = ok > them ? t('challenge.beat', { you: ok, them })
        : ok === them ? t('challenge.tie', { you: ok })
          : t('challenge.lose', { you: ok, them });
      cmpEl.innerHTML = `<div class="banner"><p style="font-weight:800;font-size:1.2rem">${esc(msg)}</p></div>`;
      cmpEl.hidden = false;
    } else {
      cmpEl.hidden = true;
    }
  }

  revealBtn.onclick = () => {
    if (isAuthor) {
      // 隨機補滿／重抽：手動填的格子保留，空格與先前「隨機填」的格子重抽新的合法解。
      // 可重複按 → 每次重新洗出不同的坑（手動指定的不動）。
      const used = new Set(dokuState.picks.filter((p) => p && !p.byReveal).map((p) => p.ndex));
      dokuState.picks = dokuState.picks.map((p, i) => {
        if (p && !p.byReveal) return p;
        const cands = cellEntries(i).filter((e) => !used.has(e.ndex));
        const pool = cands.length ? cands : cellEntries(i);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        used.add(pick.ndex);
        return { key: pick.key, ndex: pick.ndex, name: pick.nameZh, image: pick.image, mega: !!pick.mega, correct: true, byReveal: true };
      });
    } else {
      dokuState.revealed = true;     // 一般練習：顯示參考答案（不蓋掉原本填的）
    }
    rebuild();
  };
  node.querySelector('[data-act="newpuzzle"]').onclick = () => {
    dokuState = { seed: newSeed(), hintMode, play: isAuthor ? 'trap-author' : 'practice', pits: null, challenge: null };
    viewDoku();
  };

  const copyBtn = node.querySelector('[data-act="copy-doku"]');
  copyBtn.onclick = async () => {
    const input = node.querySelector('[data-share-url]');
    try { await navigator.clipboard.writeText(input.value); }
    catch { input.select(); document.execCommand('copy'); }
    copyBtn.textContent = t('result.copied');
    setTimeout(() => (copyBtn.textContent = t('result.copy')), 1500);
  };

  rebuild();
  setView(node);
}

// 數獨格子搜尋彈窗：即時過濾全國圖鑑（中／英子字串）→ 每筆附小立繪 → 點選驗證填入。
// 重用 normalizeName 比對、dex 立繪渲染；互動照 searchable-select 合約（自動聚焦／↑↓／Enter／Esc），
// 並套 ime-safe 合約（中文組字中的 Enter 屬於 IME，不誤送）。
function openDokuPicker(idx, onPicked, pit = null) {
  if (!dokuState || !dokuState.puzzle) return;
  const pz = dokuState.puzzle;
  const rowCat = pz.rows[Math.floor(idx / 3)], colCat = pz.cols[idx % 3];
  const usedNdex = new Set(dokuState.picks.filter(Boolean).map((p) => p.ndex));
  // 挖坑挑戰：把出題人挖的坑從候選中濾掉，朋友就不會（也不能）選到同一隻。
  const entries = Object.entries(nationalDex).map(([key, v]) => ({ key, ...v })).filter((p) => !pit || p.key !== pit);

  const overlay = el(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="${esc(t('doku.title'))}">
      <div class="modal-panel">
        <div class="modal-head">
          <span class="doku-cond">${esc(condText(rowCat))}<span class="doku-cond-plus">＋</span>${esc(condText(colCat))}</span>
          <button class="modal-close" data-act="close" aria-label="關閉">${uiIcon('close')}</button>
        </div>
        <div class="code-box">
          <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="${esc(t('doku.searchPlaceholder'))}" aria-label="${esc(t('doku.searchPlaceholder'))}" data-pick-search />
        </div>
        <p class="feedback feedback--bad doku-pick-msg" data-pick-msg hidden></p>
        <div class="doku-results" data-results></div>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const input = overlay.querySelector('[data-pick-search]');
  const results = overlay.querySelector('[data-results]');
  const msg = overlay.querySelector('[data-pick-msg]');
  let shown = [], activeIdx = -1;

  const close = () => {
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };

  const choose = (p) => {
    if (usedNdex.has(p.ndex)) { msg.textContent = t('doku.usedAlready', { name: p.nameZh }); msg.hidden = false; return; }
    dokuState.picks[idx] = {
      key: p.key, ndex: p.ndex, name: p.nameZh, image: p.image, mega: !!p.mega,
      correct: cellSatisfied(p, rowCat, colCat),
    };
    close();
    onPicked();
  };

  const rankName = (p, q) => (normalizeName(p.nameZh).startsWith(q) ? 0 : normalizeName(p.nameEn).startsWith(q) ? 1 : 2);

  const setActive = (i) => {
    const rows = [...results.querySelectorAll('.doku-result')];
    if (!rows.length) { activeIdx = -1; return; }
    activeIdx = (i + rows.length) % rows.length;
    rows.forEach((r, j) => r.classList.toggle('doku-result--active', j === activeIdx));
    rows[activeIdx].scrollIntoView({ block: 'nearest' });
  };

  const renderResults = () => {
    const q = normalizeName(input.value);
    results.innerHTML = '';
    shown = []; activeIdx = -1;
    if (!q) { results.innerHTML = `<p class="muted doku-results-hint">${esc(t('doku.searchHint'))}</p>`; return; }
    const matches = entries
      .filter((p) => normalizeName(p.nameZh).includes(q) || normalizeName(p.nameEn).includes(q))
      .sort((a, b) => rankName(a, q) - rankName(b, q) || (a.ndex || 0) - (b.ndex || 0) || (a.key < b.key ? -1 : 1))
      .slice(0, PICK_RESULT_LIMIT);
    if (!matches.length) { results.innerHTML = `<p class="muted doku-results-hint">${esc(t('doku.noResult'))}</p>`; return; }
    matches.forEach((p) => {
      const row = el(`
        <button class="doku-result" type="button">
          <img class="doku-result-img" alt="" loading="lazy" />
          <span class="doku-result-name">${esc(p.nameZh)}${p.mega ? ' <span class="mega-tag">MEGA</span>' : ''}</span>
          <span class="doku-result-en">${esc(p.nameEn)}</span>
        </button>`);
      const im = row.querySelector('img');
      im.src = p.image; im.onerror = () => { im.style.visibility = 'hidden'; };
      row.onclick = () => choose(p);
      results.appendChild(row);
      shown.push(p);
    });
  };

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    // 中文 IME 組字中：Enter/方向鍵屬於 IME（選字／送出候選），不要攔。
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && shown[activeIdx]) choose(shown[activeIdx]);
      else if (shown.length === 1) choose(shown[0]);
    } else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
  }

  input.addEventListener('input', () => { msg.hidden = true; renderResults(); });
  document.addEventListener('keydown', onKey, true);
  overlay.querySelector('[data-act="close"]').onclick = close;
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  renderResults();
  setTimeout(() => input.focus(), 0);
}

// 某格所有合法解（全國圖鑑中同時滿足該列與該行條件者）。供挖坑揭露隨機補滿用。
function cellEntries(idx) {
  const pz = dokuState.puzzle;
  const rowCat = pz.rows[Math.floor(idx / 3)], colCat = pz.cols[idx % 3];
  return Object.entries(nationalDex).map(([key, v]) => ({ key, ...v })).filter((p) => cellSatisfied(p, rowCat, colCat));
}

// 無提示作答彈窗：純文字輸入、不給候選清單；查無對應寶可夢時，格子顯示使用者打的字。
function openDokuTextInput(idx, onPicked, pit = null) {
  if (!dokuState || !dokuState.puzzle) return;
  const pz = dokuState.puzzle;
  const rowCat = pz.rows[Math.floor(idx / 3)], colCat = pz.cols[idx % 3];
  const usedNdex = new Set(dokuState.picks.filter(Boolean).map((p) => p.ndex));
  const entries = Object.entries(nationalDex).map(([key, v]) => ({ key, ...v }));

  const overlay = el(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="${esc(t('doku.title'))}">
      <div class="modal-panel">
        <div class="modal-head">
          <span class="doku-cond">${esc(condText(rowCat))}<span class="doku-cond-plus">＋</span>${esc(condText(colCat))}</span>
          <button class="modal-close" data-act="close" aria-label="關閉">${uiIcon('close')}</button>
        </div>
        <div class="code-box">
          <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="${esc(t('doku.nohint.placeholder'))}" aria-label="${esc(t('doku.nohint.placeholder'))}" data-nh-input />
          <button class="btn btn--accent" data-act="nh-submit">${esc(t('doku.nohint.submit'))}</button>
        </div>
        <p class="feedback feedback--bad doku-pick-msg" data-nh-msg hidden></p>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
  const input = overlay.querySelector('[data-nh-input]');
  const msg = overlay.querySelector('[data-nh-msg]');

  const close = () => {
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };

  const submit = () => {
    const raw = input.value.trim();
    if (!raw) return;
    const norm = normalizeName(raw);
    const match = entries.find((p) => normalizeName(p.nameZh) === norm || normalizeName(p.nameEn) === norm);
    if (match) {
      if (pit && match.key === pit) { msg.textContent = t('doku.trap.isPit', { name: match.nameZh }); msg.hidden = false; return; }
      if (usedNdex.has(match.ndex)) { msg.textContent = t('doku.usedAlready', { name: match.nameZh }); msg.hidden = false; return; }
      dokuState.picks[idx] = { key: match.key, ndex: match.ndex, name: match.nameZh, image: match.image, mega: !!match.mega, correct: cellSatisfied(match, rowCat, colCat) };
    } else {
      // 查無這隻：照規格在格子顯示使用者打的字（非立繪），視為未答對。
      dokuState.picks[idx] = { key: null, ndex: null, name: raw, image: null, mega: false, correct: false, typed: true };
    }
    close();
    onPicked();
  };

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.isComposing || e.keyCode === 229) return; // 中文 IME 組字中的 Enter 不誤送
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  }
  overlay.querySelector('[data-act="nh-submit"]').onclick = submit;
  input.addEventListener('input', () => { msg.hidden = true; });
  overlay.querySelector('[data-act="close"]').onclick = close;
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => input.focus(), 0);
}

// ── 數獨準備畫面：選玩法（一般練習／挖坑出題）＋作答方式（提示／無提示）──
function viewDokuSetup() {
  if (!dokuSetup) dokuSetup = { play: 'practice', hintMode: 'hint', seed: newSeed() };
  const { play, hintMode } = dokuSetup;

  const optBtn = (val, cur, label, note) => `
    <button class="season-btn doku-opt" aria-pressed="${val === cur}" data-val="${val}">
      <span class="doku-opt-title">${esc(label)}</span>
      <span class="doku-opt-note">${esc(note)}</span>
    </button>`;

  const node = el(`
    <section class="card">
      <h2>${esc(t('doku.setup.title'))}</h2>
      <p class="label">${esc(t('doku.setup.mode'))}</p>
      <div class="season-pick doku-opt-pick" data-pick="play">
        ${optBtn('practice', play, t('doku.mode.practice'), t('doku.mode.practice.note'))}
        ${optBtn('trap', play, t('doku.mode.trap'), t('doku.mode.trap.note'))}
      </div>
      <p class="label">${esc(t('doku.setup.hint'))}</p>
      <div class="season-pick doku-opt-pick" data-pick="hint">
        ${optBtn('hint', hintMode, t('doku.hint.hint'), t('doku.hint.hint.note'))}
        ${optBtn('nohint', hintMode, t('doku.hint.nohint'), t('doku.hint.nohint.note'))}
      </div>
      <button class="btn btn--primary" data-act="start">${esc(t('doku.start'))}</button>
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);

  node.querySelectorAll('[data-pick="play"] [data-val]').forEach((b) => {
    b.onclick = () => { dokuSetup.play = b.dataset.val; viewDokuSetup(); };
  });
  node.querySelectorAll('[data-pick="hint"] [data-val]').forEach((b) => {
    b.onclick = () => { dokuSetup.hintMode = b.dataset.val; viewDokuSetup(); };
  });
  node.querySelector('[data-act="start"]').onclick = () => {
    dokuState = {
      seed: newSeed(), hintMode: dokuSetup.hintMode,
      play: dokuSetup.play === 'trap' ? 'trap-author' : 'practice',
      pits: null, challenge: null,
    };
    go('#/doku');
  };
  setView(node);
}

// ── 路由 ────────────────────────────────────────────────────────
function render() {
  app.classList.remove('app--wide'); // 預設窄版；需要寬版的頁面（速度線表）自行加回
  const params = new URLSearchParams(location.search);
  const code = params.get('c');
  const hash = location.hash;

  // 帶成績碼進站且尚未開始挑戰 → 顯示戰帖。消費掉 ?c= 避免站內導覽重複攔截。
  if (code && !session && hash !== '#/quiz' && hash !== '#/result') {
    const decoded = decodeShare(code);
    history.replaceState(null, '', location.pathname + (hash || '#/'));
    if (decoded) return viewChallenge(decoded);
  }

  switch (hash) {
    case '#/setup': return viewSetup();
    case '#/quiz': return viewQuiz();
    case '#/result': return viewResult();
    case '#/history': return viewHistoryDetail();
    case '#/chart': return viewChart();
    case '#/speedline': return viewSpeedChart();
    case '#/dex': return viewDex();
    case '#/doku-setup': return viewDokuSetup();
    case '#/doku': return viewDoku();
    case '#/master': return viewMaster();
    case '#/who-builder': return viewWhoBuilder();
    default: return viewHome();
  }
}

// 導覽
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (!nav) return;
  const dest = nav.dataset.nav;
  if (dest === 'home') { session = null; setupState = null; dokuState = null; dokuSetup = null; masterState = null; builderState = null; go('#/'); }
  else go('#/' + dest);
});

window.addEventListener('hashchange', render);

// ── 啟動：載入靜態資料後首次渲染 ───────────────────────────────
// 量測 sticky 標頭高度 → 設成 CSS 變數，讓頁內 sticky 區塊（如速度線表搜尋列）剛好接在它下面。
function setTopbarVar() {
  const tb = document.querySelector('.topbar');
  if (tb) document.documentElement.style.setProperty('--topbar-h', `${tb.offsetHeight}px`);
}

async function init() {
  initTheme();
  setTopbarVar();
  window.addEventListener('resize', setTopbarVar);
  try {
    const [dexRes, seasonsRes, natRes] = await Promise.all([
      fetch('./src/data/pokedex.json'),
      fetch('./src/data/seasons.json'),
      fetch('./src/data/dex-national.json'),
    ]);
    pokedex = await dexRes.json();
    seasonsData = await seasonsRes.json();
    nationalDex = await natRes.json();
  } catch (e) {
    console.error('資料載入失敗', e);
  }
  render();
}
init();
