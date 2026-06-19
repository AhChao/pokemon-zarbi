// 瀏覽器端主程式：hash 路由 + 成績碼網址處理 + 各畫面渲染。
import { TYPES, TYPE_META, multiplier, formatMultiplier } from './data/typechart.js';
import { generateTypeQuiz, generateSpeedQuiz, generateWhoQuiz, whoAnswerCorrect, whoCharScore, scoreQuizChar, normalizeName, speedLines, scoreQuiz, newSeed, DEFAULT_QUESTION_COUNT, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT, SPEED_DIFFICULTIES, DEFAULT_SPEED_DIFFICULTY, WHO_DIFFICULTIES, DEFAULT_WHO_DIFFICULTY } from './quiz.js';
import { encodeResult, decodeResult } from './share.js';
import { getHistory, addHistory } from './history.js';
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
};
function uiIcon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${UI_ICONS[name]}</svg>`;
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
    const decoded = decodeResult(code);
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
      <div class="who-stage${session.meta.difficulty === 'veryeasy' ? ' revealed' : ''}"><img class="who-img" alt="" /></div>
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
  const right = whoAnswerCorrect(q, typed);

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
  // 入口只在「誰比較快」的 setup；直接帶網址進來時補一個預設賽季狀態。
  if (!setupState || setupState.mode !== 'speed') {
    setupState = { mode: 'speed', season: defaultSeason(), difficulty: DEFAULT_SPEED_DIFFICULTY, seed: newSeed() };
  }
  const season = setupState.season;

  const node = el(`
    <section>
      <div class="card">
        <h2>${esc(t('speedline.title'))}</h2>
        <p class="muted">${esc(t('speedline.hint'))}</p>
        <div class="season-pick" data-seasons></div>
        <div class="code-box spd-search">
          <input type="text" inputmode="text" autocomplete="off" spellcheck="false"
                 placeholder="${esc(t('speedline.search'))}" aria-label="${esc(t('speedline.searchBtn'))}" data-spd-search />
          <button class="btn btn--accent" data-act="spd-go" aria-label="${esc(t('speedline.searchBtn'))}">${uiIcon('search')}</button>
        </div>
        <p class="feedback feedback--bad spd-search__msg" data-spd-msg hidden></p>
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

  node.querySelector('[data-table]').appendChild(buildSpeedTable(season));

  // 模糊搜尋：找到該寶可夢所在的速度列 → 捲過去並閃兩下。
  const pool = seasonPool(season);
  const input = node.querySelector('[data-spd-search]');
  const msg = node.querySelector('[data-spd-msg]');
  const doSearch = () => {
    const q = normalizeName(input.value);
    if (!q) return;
    const hit = (test) => pool.find((p) => test(normalizeName(p.nameZh)) || test(normalizeName(p.nameEn)));
    const match = hit((n) => n === q) || hit((n) => n.startsWith(q)) || hit((n) => n.includes(q));
    if (!match) { msg.textContent = t('speedline.noMatch'); msg.hidden = false; return; }
    msg.hidden = true;
    const row = node.querySelector(`tr[data-spe="${match.speed}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('row-hl');
    void row.offsetWidth; // 強制 reflow，讓動畫可重複觸發
    row.classList.add('row-hl');
    row.addEventListener('animationend', () => row.classList.remove('row-hl'), { once: true });
  };
  node.querySelector('[data-act="spd-go"]').onclick = doSearch;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  input.addEventListener('input', () => { msg.hidden = true; });
  node.querySelector('[data-act="spd-top"]').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  setView(node);
}

// 同速排一列；每欄為該種族值在 Lv50 的實數值換算。
function buildSpeedTable(season) {
  const pool = seasonPool(season);
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
    rows += `<tr data-spe="${spe}"><th class="spd-base">${spe}</th><td class="spd-mons">${mons}</td>`;
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

// ── 路由 ────────────────────────────────────────────────────────
function render() {
  const params = new URLSearchParams(location.search);
  const code = params.get('c');
  const hash = location.hash;

  // 帶成績碼進站且尚未開始挑戰 → 顯示戰帖。消費掉 ?c= 避免站內導覽重複攔截。
  if (code && !session && hash !== '#/quiz' && hash !== '#/result') {
    const decoded = decodeResult(code);
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
    default: return viewHome();
  }
}

// 導覽
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (!nav) return;
  const dest = nav.dataset.nav;
  if (dest === 'home') { session = null; setupState = null; go('#/'); }
  else go('#/' + dest);
});

window.addEventListener('hashchange', render);

// ── 啟動：載入靜態資料後首次渲染 ───────────────────────────────
async function init() {
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
