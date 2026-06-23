// 瀏覽器端主程式：hash 路由 + 成績碼網址處理 + 各畫面渲染。
import { TYPES, TYPE_META, multiplier, singleMultiplier, formatMultiplier } from './data/typechart.js';
import { generateTypeQuiz, generateSpeedQuiz, generateWhoQuiz, generateWhoQuizFromKeys, whoAnswerCorrect, whoCharScore, normalizeName, speedLines, scoreQuiz, newSeed, DEFAULT_QUESTION_COUNT, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT, SPEED_DIFFICULTIES, DEFAULT_SPEED_DIFFICULTY, WHO_DIFFICULTIES, DEFAULT_WHO_DIFFICULTY } from './quiz.js';
import { generateDoku, cellSatisfied, PICK_RESULT_LIMIT } from './doku.js';
import { encodeResult, decodeResult, encodeDokuTrap, encodeWhoCustom } from './share.js';
import { scoreModesFor, charPct, pctOf, fmtPct } from './score.js';
import { state, DATA, SPD_PERROW_KEY } from './state.js';
import { shareUrlFor, relTime, initTheme, setTopbarVar, setRenderer, go, gaEvent, gaPageView } from './core.js';
import { getHistory, addHistory } from './history.js';
import { masterAvailable, getMaster, saveMaster, resetMaster, pushWrong } from './master.js';
import { t, typeName } from './i18n.js';
import { el, esc, clamp, typeIcon, uiIcon, pokeballSvg, unownLogo, frameFill, badge, appEl, setView, keepInputVisible, loadWhoImage, prefetchImages } from './ui.js';

// 共享狀態與離線資料移到 state.js（state / DATA holder）。

// ── 賽季 / 測驗組裝 ──────────────────────────────────────────────
function seasonLabel(key) {
  return DATA.seasonsData.seasons[key]?.label || key;
}
function seasonKeys() {
  return Object.keys(DATA.seasonsData.seasons);
}
function defaultSeason() {
  const keys = seasonKeys();
  return keys.includes('m-b') ? 'm-b' : keys[0];
}
// 由賽季組出已排序的寶可夢池（穩定排序 → 速度測驗可決定性重現）。
function seasonPool(key) {
  const members = DATA.seasonsData.seasons[key]?.members || [];
  return members
    .filter((k) => DATA.pokedex[k])
    .map((k) => ({ key: k, ...DATA.pokedex[k] }))
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
  const hasNonMega = (poolKey) => Object.keys(DATA.nationalDex).some((k) => !DATA.nationalDex[k].mega && genKeyOf(k, DATA.nationalDex[k]) === poolKey);
  const gens = GENERATIONS.map((g) => g.key).filter(hasNonMega);
  const hisui = hasNonMega('hisui') ? ['hisui'] : [];
  return ['all', ...gens, ...hisui, defaultSeason()];
}
function defaultWhoPool() {
  return whoPoolKeys()[0] || defaultSeason();
}
// 由池鍵組出穩定排序的寶可夢池：
//   賽季鍵（冠軍最新賽季）→ Champions 名單 DATA.pokedex；'all' / 世代 / 地區鍵 → 全國圖鑑 DATA.nationalDex。
function whoPool(poolKey) {
  if (DATA.seasonsData.seasons[poolKey]) return seasonPool(poolKey);
  const keys = poolKey === 'all'
    ? Object.keys(DATA.nationalDex)
    : Object.keys(DATA.nationalDex).filter((k) => genKeyOf(k, DATA.nationalDex[k]) === poolKey);
  return keys
    .map((k) => ({ key: k, ...DATA.nationalDex[k] }))
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



// 解碼任一種分享碼：一般成績碼 / 挖坑碼 / 自訂題庫碼都由 decodeResult 統一處理。
function decodeShare(code) {
  return decodeResult(code);
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
      gaEvent('select_mode', { mode });
      // 數獨走自己的 setup（選玩法：一般練習／挖坑出題；作答方式：提示／無提示）。
      if (mode === 'doku') { state.dokuSetup = { play: 'practice', hintMode: 'hint', seed: newSeed() }; go('#/doku-setup'); return; }
      let season = '', difficulty = 'all';
      if (mode === 'speed') { season = defaultSeason(); difficulty = DEFAULT_SPEED_DIFFICULTY; }
      else if (mode === 'who') { season = defaultWhoPool(); difficulty = DEFAULT_WHO_DIFFICULTY; }
      state.setupState = { mode, season, difficulty, seed: newSeed() };
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
      item.onclick = () => { state.viewingHistory = rec; go('#/history'); };
      histWrap.appendChild(item);
    });
  }

  setView(node);
}

// ── 準備畫面：選賽季 + 顯示本局題目碼（開局前就能分享一起測）──────
function viewSetup() {
  if (!state.setupState) return viewHome();
  const { mode } = state.setupState;
  if (mode === 'speed') {
    if (!state.setupState.season) state.setupState.season = defaultSeason();
    if (!state.setupState.difficulty) state.setupState.difficulty = DEFAULT_SPEED_DIFFICULTY;
  } else if (mode === 'who') {
    if (!state.setupState.season) state.setupState.season = defaultWhoPool();
    if (!state.setupState.difficulty) state.setupState.difficulty = DEFAULT_WHO_DIFFICULTY;
  }
  if (state.setupState.count == null) state.setupState.count = DEFAULT_QUESTION_COUNT;
  if (state.setupState.scoreMode == null) state.setupState.scoreMode = 'count';
  if (mode !== 'who' && state.setupState.scoreMode === 'char') state.setupState.scoreMode = 'count';
  const season = mode === 'type' ? '' : state.setupState.season;
  const difficulty = mode === 'type' ? 'all' : state.setupState.difficulty;
  const seed = state.setupState.seed;
  // 題數（10–20）與計分方式套用所有模式；按字計分（char）僅我是誰可選。
  const count = state.setupState.count;
  const scoreMode = state.setupState.scoreMode;
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
      <div class="setup-tools">
        <button class="btn btn--ghost" data-nav="chart">${esc(t('home.openChart'))}</button>
        <button class="btn btn--ghost" data-nav="coverage">${esc(t('chart.tool.openBtn'))}</button>
      </div>` : ''}
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
      b.onclick = () => { state.setupState.season = key; viewSetup(); };
      pickWrap.appendChild(b);
    });

    const diffWrap = node.querySelector('.difficulty-pick');
    // UI 只給三檔（'all' 為相容舊碼的內部值，不對外呈現）。
    SPEED_DIFFICULTIES.filter((d) => d !== 'all').forEach((d) => {
      const b = el(`<button class="season-btn" aria-pressed="${difficulty === d}">${esc(difficultyLabel(d))}</button>`);
      b.onclick = () => { state.setupState.difficulty = d; viewSetup(); };
      diffWrap.appendChild(b);
    });
  }

  if (mode === 'who') {
    const poolWrap = node.querySelector('.pool-pick');
    whoPoolKeys().forEach((pk) => {
      const b = el(`<button class="season-btn" aria-pressed="${season === pk}">${esc(poolLabel(pk))}</button>`);
      b.onclick = () => { state.setupState.season = pk; viewSetup(); };
      poolWrap.appendChild(b);
    });

    const diffWrap = node.querySelector('.difficulty-pick');
    WHO_DIFFICULTIES.forEach((d) => {
      const b = el(`<button class="season-btn" aria-pressed="${difficulty === d}">${esc(difficultyLabel(d))}</button>`);
      b.onclick = () => { state.setupState.difficulty = d; viewSetup(); };
      diffWrap.appendChild(b);
    });

    // 寶可夢大師模式 + 出題模式入口（衍生玩法）：放到「換一份題目」連結之下。
    const masterWrap = el(`
      <div class="master-entry">
        <button class="btn btn--ghost" data-act="master">${esc(t('master.btn'))}</button>
        <p class="muted">${esc(t('master.btnNote'))}</p>
        <button class="btn btn--ghost" data-act="builder">${esc(t('builder.btn'))}</button>
      </div>`);
    masterWrap.querySelector('[data-act="master"]').onclick = () => startMaster(state.setupState.season, state.setupState.difficulty);
    masterWrap.querySelector('[data-act="builder"]').onclick = () => { state.builderState = null; go('#/who-builder'); };
    const rerollP = node.querySelector('[data-act="reroll"]')?.closest('p');
    if (rerollP) rerollP.after(masterWrap);
    else node.querySelector('[data-act="start"]').before(masterWrap);
  }

  const smWrap = node.querySelector('[data-scoremodes]');
  if (smWrap) scoreModesFor(mode).forEach((sm) => {
    const b = el(`<button class="season-btn" aria-pressed="${scoreMode === sm}">${esc(t(`score.${sm}`))}</button>`);
    b.onclick = () => { state.setupState.scoreMode = sm; viewSetup(); };
    smWrap.appendChild(b);
  });

  node.querySelectorAll('[data-count-step]').forEach((b) => {
    b.onclick = () => {
      const next = clamp(state.setupState.count + Number(b.dataset.countStep), MIN_QUESTION_COUNT, MAX_QUESTION_COUNT);
      if (next !== state.setupState.count) { state.setupState.count = next; viewSetup(); }
    };
  });

  node.querySelector('[data-act="start"]').onclick = () => startQuiz({ mode, season, seed, difficulty, count, scoreMode });

  const shareBtn = node.querySelector('[data-act="copy-share"]');
  shareBtn.onclick = async () => {
    gaEvent('share_code', { kind: 'setup', mode });
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

  node.querySelector('[data-act="reroll"]').onclick = () => { state.setupState.seed = newSeed(); viewSetup(); };

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
  state.session = { quiz, answers: [], index: 0, locked: false, challenge, saved: false, meta: { mode, season, difficulty, count: total, scoreMode: sm } };
  // 一開局就背景預載全部題目立繪（我是誰黑影、速度題兩隻），之後換題免等。
  if (mode === 'who') prefetchImages(quiz.questions.map((q) => q.image));
  else if (mode === 'speed') prefetchImages(quiz.questions.flatMap((q) => q.options.map((o) => o.image)));
  gaEvent('quiz_start', { mode, season, difficulty, count: total, score_mode: sm, is_challenge: !!challenge });
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
  if (!state.session) return viewHome();
  const { quiz, index } = state.session;
  const q = quiz.questions[index];
  const pct = Math.round((index / quiz.count) * 100);

  const node = el(`
    <section class="card">
      <div class="quiz__meta">
        <span>${esc(t('quiz.progress', { n: index + 1, total: quiz.count }))}</span>
        <span>${state.session.challenge ? uiIcon('swords') : ''}</span>
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
    const hint = whoHint(q, state.session.meta.difficulty);
    body.innerHTML = `
      <div class="who-frame" style="--frame-fill:${frameFill(quiz.seed, index)}">
        <span class="who-corner who-corner--tl">${pokeballSvg()}</span>
        <span class="who-corner who-corner--tr">${pokeballSvg()}</span>
        <span class="who-corner who-corner--bl">${pokeballSvg()}</span>
        <span class="who-corner who-corner--br">${pokeballSvg()}</span>
        <span class="who-spinner" aria-hidden="true"></span>
        <div class="who-stage${state.session.meta.difficulty === 'veryeasy' ? ' revealed' : ''}"><img class="who-img" alt="" /></div>
      </div>
      ${hint ? `<p class="who-hint">${hint}</p>` : ''}
      <div class="code-box who-input">
        <span class="who-label">${esc(t('who.label'))}</span>
        <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="${esc(t('who.placeholder'))}" aria-label="${esc(t('who.prompt'))}" data-who-input />
        <button class="btn btn--accent" data-act="who-submit">${esc(t('who.submit'))}</button>
      </div>`;
    const input = body.querySelector('[data-who-input]');
    keepInputVisible(input);
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
  if (q.mode === 'who') loadWhoImage(node, q, whoHint(q, state.session.meta.difficulty), { focus: true });
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

// 我是誰：原地換到下一題（不重建整頁、不捲到頂），避免換題時的大跳動與鍵盤抖動。
function repaintWho(node) {
  const { quiz, index } = state.session;
  const q = quiz.questions[index];
  const body = node.querySelector('[data-qbody]');
  node.querySelector('.quiz__meta span').textContent = t('quiz.progress', { n: index + 1, total: quiz.count });
  node.querySelector('.progress__bar').style.width = `${Math.round((index / quiz.count) * 100)}%`;
  const frame = body.querySelector('.who-frame');
  if (frame) frame.style.setProperty('--frame-fill', frameFill(quiz.seed, index));
  body.querySelector('.who-stage')?.classList.toggle('revealed', state.session.meta.difficulty === 'veryeasy');
  body.querySelector('.who-answer')?.remove();
  body.querySelector('[data-who-input]').value = '';
  const submitBtn = body.querySelector('[data-act="who-submit"]');
  if (submitBtn) submitBtn.disabled = false;
  const fb = node.querySelector('.feedback'); fb.textContent = ''; fb.className = 'feedback';
  const next = node.querySelector('[data-act="next"]'); next.hidden = true; next.onclick = null;
  loadWhoImage(node, q, whoHint(q, state.session.meta.difficulty), { focus: true }); // 等新立繪載好才解鎖、聚焦
}

// 我是誰作答：比對輸入、揭曉黑影與正解名、鎖定輸入。
function answerWho(typed, node) {
  if (state.session.locked) return;
  state.session.locked = true;
  const q = state.session.quiz.questions[state.session.index];
  state.session.answers[state.session.index] = typed;
  const right = whoAnswerCorrect(q, typed, state.session.meta.difficulty);

  node.querySelector('.who-stage')?.classList.add('revealed');
  node.querySelectorAll('.who-input input, .who-input button').forEach((e) => { e.disabled = true; });

  const nameLine = el(`<p class="who-answer">${q.mega ? `${esc(q.nameZh)} <span class="mega-tag">MEGA</span>` : esc(q.nameZh)}</p>`);
  node.querySelector('[data-qbody]').appendChild(nameLine);

  const fb = node.querySelector('.feedback');
  fb.textContent = right ? t('who.correct', { name: q.nameZh }) : t('who.wrong', { name: q.nameZh });
  fb.classList.add(right ? 'feedback--good' : 'feedback--bad');

  const last = state.session.index === state.session.quiz.count - 1;
  const next = node.querySelector('[data-act="next"]');
  next.textContent = last ? t('quiz.finish') : t('quiz.next');
  next.hidden = false;
  next.onclick = () => {
    if (last) { go('#/result'); return; }
    state.session.index++;
    state.session.locked = false;
    repaintWho(node); // 原地換題，不走 render() → 不捲到頂、不重建 DOM
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
  state.masterState = {
    poolKey, difficulty, byKey, rec, available, queue,
    total: all.length, doneCount: rec.done.length, current: null, locked: false,
  };
  nextMaster();
  go('#/master');
}

function nextMaster() {
  if (!state.masterState) return;
  state.masterState.locked = false;
  const key = state.masterState.queue.shift();
  if (!key) { state.masterState.current = null; return; }
  const p = state.masterState.byKey.get(key);
  state.masterState.current = { key: p.key, mode: 'who', nameZh: p.nameZh, nameEn: p.nameEn, image: p.image, mega: !!p.mega, dex: p.dex };
  // 背景預載接下來幾隻的立繪（池可能很大 → 用滑動視窗，不一次全抓）。
  prefetchImages([p.image, ...state.masterState.queue.slice(0, 10).map((k) => state.masterState.byKey.get(k)?.image)].filter(Boolean));
}

function viewMaster() {
  if (!state.masterState) return viewHome();
  const ms = state.masterState;
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
          <span class="who-spinner" aria-hidden="true"></span>
          <div class="who-stage${ms.difficulty === 'veryeasy' ? ' revealed' : ''}"><img class="who-img" alt="" /></div>
        </div>
        ${hint ? `<p class="who-hint">${hint}</p>` : ''}
        <div class="code-box who-input">
          <span class="who-label">${esc(t('who.label'))}</span>
          <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="${esc(t('who.placeholder'))}" aria-label="${esc(t('who.prompt'))}" data-who-input />
          <button class="btn btn--accent" data-act="who-submit">${esc(t('who.submit'))}</button>
        </div>
      </div>
      <p class="feedback"></p>
      <button class="btn btn--primary" data-act="next" hidden></button>
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);
  const input = node.querySelector('[data-who-input]');
  keepInputVisible(input);
  const submit = () => answerMaster(input.value, node);
  node.querySelector('[data-act="who-submit"]').onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  setView(node);
  loadWhoImage(node, q, hint, { focus: true }); // 等立繪載好才解鎖、聚焦
}

// 寶可夢大師：原地換到下一隻（同我是誰，不重建整頁、不捲到頂）。
function repaintMaster(node) {
  const ms = state.masterState;
  const q = ms.current;
  const body = node.querySelector('[data-qbody]');
  const metaSpans = node.querySelectorAll('.quiz__meta span');
  if (metaSpans[0]) metaSpans[0].textContent = t('master.progress', { done: ms.doneCount, total: ms.total });
  if (metaSpans[1]) metaSpans[1].textContent = t('master.mistakes', { n: ms.rec.mistakes });
  node.querySelector('.progress__bar').style.width = `${Math.round((ms.doneCount / ms.total) * 100)}%`;
  const frame = body.querySelector('.who-frame');
  if (frame) frame.style.setProperty('--frame-fill', frameFill(ms.poolKey, ms.doneCount + ms.rec.mistakes));
  body.querySelector('.who-stage')?.classList.toggle('revealed', ms.difficulty === 'veryeasy');
  body.querySelector('.who-answer')?.remove();
  body.querySelector('[data-who-input]').value = '';
  const submitBtn = body.querySelector('[data-act="who-submit"]');
  if (submitBtn) submitBtn.disabled = false;
  const fb = node.querySelector('.feedback'); fb.textContent = ''; fb.className = 'feedback';
  const next = node.querySelector('[data-act="next"]'); next.hidden = true; next.onclick = null;
  loadWhoImage(node, q, whoHint(q, ms.difficulty), { focus: true }); // 等新立繪載好才解鎖、聚焦
}

function answerMaster(typed, node) {
  const ms = state.masterState;
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
  next.onclick = () => { nextMaster(); if (!state.masterState.current) render(); else repaintMaster(node); };
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
  const ms = state.masterState;
  const f = computeMasterFacts(ms);
  if (!ms.completeTracked) {
    ms.completeTracked = true;
    gaEvent('master_complete', { pool: ms.poolKey, difficulty: ms.difficulty, total: f.total, mistakes: f.mistakes, best_streak: f.streak });
  }
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
// 出題題數限制：下限 5、上限 20。
const WHO_CUSTOM_MIN = 5;
const WHO_CUSTOM_MAX = 20;
// 出題瀏覽用的圖鑑：全國圖鑑非 Mega（剪影題以本體為主），依圖鑑編號排序。
function builderDexEntries() {
  return Object.entries(DATA.nationalDex)
    .filter(([, v]) => !v.mega)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (a.ndex || 0) - (b.ndex || 0) || (a.key < b.key ? -1 : 1));
}

function viewWhoBuilder() {
  if (!state.builderState) state.builderState = { selected: [], difficulty: DEFAULT_WHO_DIFFICULTY, scoreMode: 'count', filter: '', dexOpen: true, setOpen: true };
  const bs = state.builderState;
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
      <p class="muted" data-need hidden>${esc(t('builder.needRange', { min: WHO_CUSTOM_MIN, max: WHO_CUSTOM_MAX }))}</p>
      <button class="btn btn--primary" data-act="make">${esc(t('builder.makeCode'))}</button>
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);

  const selWrap = node.querySelector('[data-selected]');
  const dexWrap = node.querySelector('[data-dex]');
  const shareWrap = node.querySelector('[data-share]');
  const needEl = node.querySelector('[data-need]');

  const renderSelected = () => {
    node.querySelector('[data-sel-label]').textContent = t('builder.selected', { n: bs.selected.length, max: WHO_CUSTOM_MAX });
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
        if (sel.has(p.key)) {
          bs.selected = bs.selected.filter((x) => x !== p.key);
        } else if (bs.selected.length >= WHO_CUSTOM_MAX) {
          needEl.textContent = t('builder.maxReached', { max: WHO_CUSTOM_MAX });
          needEl.hidden = false;
          return; // 已達上限，不再加入
        } else {
          bs.selected = [...bs.selected, p.key];
        }
        renderSelected(); renderDex(); updateMake();
      };
      dexWrap.appendChild(cellb);
    });
  };

  const updateMake = () => {
    if (bs.selected.length >= WHO_CUSTOM_MIN) {
      const seed = bs.codeSeed || (bs.codeSeed = newSeed());
      const code = encodeWhoCustom({ seed, keys: bs.selected, difficulty: bs.difficulty, scoreMode: bs.scoreMode });
      node.querySelector('[data-share-url]').value = shareUrlFor(code);
      node.querySelector('[data-share-code]').textContent = code;
      shareWrap.hidden = false; needEl.hidden = true;
    } else {
      shareWrap.hidden = true;
      needEl.textContent = t('builder.needRange', { min: WHO_CUSTOM_MIN, max: WHO_CUSTOM_MAX });
      needEl.hidden = false;
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
  node.querySelector('[data-act="make"]').onclick = () => {
    if (bs.selected.length < WHO_CUSTOM_MIN) {
      needEl.textContent = t('builder.needRange', { min: WHO_CUSTOM_MIN, max: WHO_CUSTOM_MAX });
      needEl.hidden = false;
      return;
    }
    gaEvent('builder_create', { count: bs.selected.length, difficulty: bs.difficulty, score_mode: bs.scoreMode });
    updateMake(); shareWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const copyBtn = node.querySelector('[data-act="copy"]');
  copyBtn.onclick = async () => {
    gaEvent('share_code', { kind: 'builder' });
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
  const pool = decoded.keys.map((k) => (DATA.nationalDex[k] ? { key: k, ...DATA.nationalDex[k] } : null)).filter(Boolean);
  if (!pool.length) return viewHome();
  let quiz;
  try { quiz = generateWhoQuizFromKeys(decoded.seed, pool, decoded.difficulty); }
  catch (e) { console.error(e); return viewHome(); }
  state.session = { quiz, answers: [], index: 0, locked: false, challenge: null, saved: false, meta: { mode: 'who', season: '', difficulty: decoded.difficulty, count: quiz.count, scoreMode: decoded.scoreMode } };
  prefetchImages(quiz.questions.map((q) => q.image)); // 背景預載自訂題庫立繪
  go('#/quiz');
}

function answer(choice, node) {
  if (state.session.locked) return;
  state.session.locked = true;
  const q = state.session.quiz.questions[state.session.index];
  state.session.answers[state.session.index] = choice;

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

  const last = state.session.index === state.session.quiz.count - 1;
  const next = node.querySelector('[data-act="next"]');
  next.textContent = last ? t('quiz.finish') : t('quiz.next');
  next.hidden = false;
  next.onclick = () => {
    if (last) { go('#/result'); return; }
    state.session.index++;
    state.session.locked = false;
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
    gaEvent('share_code', { kind: 'result' });
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
  if (!state.session || state.session.answers.length < state.session.quiz.count) return viewHome();
  const { quiz, answers, challenge, meta } = state.session;
  const { node, pct, correct, total, scoreMode, charScore, code } = buildResultSection(quiz, answers, { challenge, meta });

  if (!state.session.saved) {
    addHistory({
      mode: meta.mode, season: meta.season, difficulty: meta.difficulty || 'all', seed: quiz.seed,
      total, scoreMode, score: charScore ? pct : correct, answers: answers.slice(), code, ts: Date.now(),
    });
    gaEvent('quiz_finish', {
      mode: meta.mode, season: meta.season, difficulty: meta.difficulty || 'all',
      score_mode: scoreMode, correct, total, percent: Math.round(pct), is_challenge: !!challenge,
    });
    state.session.saved = true;
  }

  setView(node);
}

// ── 歷史詳情畫面 ───────────────────────────────────────────────
function viewHistoryDetail() {
  const rec = state.viewingHistory;
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
    node.querySelector('[data-act="accept"]').onclick = () => { gaEvent('challenge_accept', { kind: 'who-custom' }); startCustomWho(decoded); };
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
      gaEvent('challenge_accept', { kind: 'doku-trap' });
      state.dokuState = { seed: decoded.seed, hintMode: decoded.hintMode || 'hint', play: 'trap-solve', pits: decoded.pits, challenge: null };
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
      gaEvent('challenge_accept', { kind: coplayD ? 'doku-coplay' : 'doku' });
      state.dokuState = { seed: decoded.seed, challenge: coplayD ? null : { score: decoded.score } };
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
        <button class="btn btn--ghost" data-nav="back">${esc(t('common.back'))}</button>
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
    const m = multiplier(state.chartState.atk, state.chartState.def);
    const atkN = typeName(state.chartState.atk);
    const defN = state.chartState.def.map(typeName).join(' / ');
    resultBox.innerHTML = `${esc(formatMultiplier(m))}<small>${esc(atkN)} → ${esc(defN)}</small>`;
  };

  TYPES.forEach((tk) => {
    const m = TYPE_META[tk];
    const a = el(`<button class="type-pick" style="background:${m.color}" aria-pressed="${state.chartState.atk === tk}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    a.onclick = () => {
      state.chartState.atk = tk;
      atkGrid.querySelectorAll('.type-pick').forEach((b, i) =>
        b.setAttribute('aria-pressed', String(TYPES[i] === tk)));
      renderResult();
    };
    atkGrid.appendChild(a);

    const d = el(`<button class="type-pick" style="background:${m.color}" aria-pressed="${state.chartState.def.includes(tk)}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    d.onclick = () => {
      const has = state.chartState.def.includes(tk);
      if (has) {
        if (state.chartState.def.length > 1) state.chartState.def = state.chartState.def.filter((x) => x !== tk);
      } else {
        state.chartState.def = [...state.chartState.def, tk].slice(-2);
      }
      defGrid.querySelectorAll('.type-pick').forEach((b, i) =>
        b.setAttribute('aria-pressed', String(state.chartState.def.includes(TYPES[i]))));
      renderResult();
    };
    defGrid.appendChild(d);
  });

  renderResult();
  node.querySelector('.table-wrap').appendChild(buildChartTable());
  setView(node);
}

// ── 聯防小工具：攻擊方／防守方（屬性集合綜合）＋我的隊伍（逐隻分析）─
let chartToolState = { mode: 'atk', picks: [], team: null };

// 隊伍存放：A／B／C 三隊，每隊 ≤6 隻，每隻 { def:[≤2], atk:[≤4] }；存 localStorage。
const TEAM_KEY = 'pq.coverageTeams.v1';
function emptyTeams() { return { active: 'A', sets: { A: [], B: [], C: [] } }; }
function loadTeams() {
  try {
    const o = JSON.parse(localStorage.getItem(TEAM_KEY) || 'null');
    if (o && o.sets && ['A', 'B', 'C'].every((k) => Array.isArray(o.sets[k]))) {
      // 清洗：每隻只留合法屬性、def≤2、atk≤4。
      for (const k of ['A', 'B', 'C']) {
        o.sets[k] = o.sets[k].slice(0, 6).map((m) => ({
          def: (m.def || []).filter((x) => TYPES.includes(x)).slice(0, 2),
          atk: (m.atk || []).filter((x) => TYPES.includes(x)).slice(0, 4),
          hidden: !!m.hidden,
        }));
      }
      if (!['A', 'B', 'C'].includes(o.active)) o.active = 'A';
      return o;
    }
  } catch { /* 略過損毀資料 */ }
  return emptyTeams();
}
function saveTeams(ts) { try { localStorage.setItem(TEAM_KEY, JSON.stringify(ts)); } catch { /* 略過（無痕/額滿） */ } }

function viewCoverage() {
  const node = el(`
    <section>
      <div class="card chart-tool"></div>
      <button class="btn btn--ghost" data-nav="back">${esc(t('common.back'))}</button>
    </section>`);
  node.querySelector('.chart-tool').replaceWith(buildChartTool());
  setView(node);
}

function buildChartTool() {
  const card = el(`
    <div class="card chart-tool">
      <h2>${esc(t('chart.tool.title'))}</h2>
      <p class="muted">${esc(t('chart.tool.hint'))}</p>
      <div class="ct-seg">
        <button class="seg" data-mode="atk">${esc(t('chart.tool.asAtk'))}</button>
        <button class="seg" data-mode="def">${esc(t('chart.tool.asDef'))}</button>
        <button class="seg" data-mode="team">${esc(t('chart.tool.asTeam'))}</button>
      </div>
      <div class="ct-body"></div>
    </div>`);
  const segBtns = card.querySelectorAll('.seg');
  const body = card.querySelector('.ct-body');
  const syncSeg = () => segBtns.forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.mode === chartToolState.mode)));
  const renderMode = () => {
    syncSeg();
    body.innerHTML = '';
    body.appendChild(chartToolState.mode === 'team' ? buildTeamTool() : buildSetTool());
  };
  segBtns.forEach((b) => { b.onclick = () => { chartToolState.mode = b.dataset.mode; renderMode(); }; });
  renderMode();
  return card;
}

// 攻擊方／防守方：選一組屬性，當成隊伍綜合（攻取 min＝最不痛一擊、防取 max＝最痛被打）。
function buildSetTool() {
  const wrap = el(`
    <div class="ct-set">
      <p class="label ct-picked-label"></p>
      <div class="ct-picked"></div>
      <p class="muted ct-add-hint">${esc(t('chart.tool.add'))}</p>
      <div class="type-grid ct-grid"></div>
      <div class="ct-result"></div>
    </div>`);
  const pickedLabel = wrap.querySelector('.ct-picked-label');
  const pickedBox = wrap.querySelector('.ct-picked');
  const grid = wrap.querySelector('.ct-grid');
  const resultBox = wrap.querySelector('.ct-result');
  const isAtk = () => chartToolState.mode === 'atk';

  const syncGrid = () => grid.querySelectorAll('.type-pick').forEach((b, i) =>
    b.setAttribute('aria-pressed', String(chartToolState.picks.includes(TYPES[i]))));

  const togglePick = (tk) => {
    chartToolState.picks = chartToolState.picks.includes(tk)
      ? chartToolState.picks.filter((x) => x !== tk)
      : [...chartToolState.picks, tk];
    syncGrid();
    renderPicked();
    renderResult();
  };

  const renderPicked = () => {
    pickedLabel.textContent = t('chart.tool.picked', { n: chartToolState.picks.length });
    pickedBox.innerHTML = '';
    if (!chartToolState.picks.length) {
      pickedBox.appendChild(el(`<span class="ct-empty">${esc(t('chart.tool.empty'))}</span>`));
      return;
    }
    chartToolState.picks.forEach((tk) => {
      const m = TYPE_META[tk];
      const chip = el(`<button class="ct-chip" style="background:${m.color}" aria-label="${esc(t('chart.tool.remove', { name: typeName(tk) }))}">${typeIcon(tk)}<span>${esc(typeName(tk))}</span>${uiIcon('close')}</button>`);
      chip.onclick = () => togglePick(tk);
      pickedBox.appendChild(chip);
    });
  };

  // 把選的屬性當成一個隊伍綜合：對每個「對手屬性」聚合成單一倍率。
  // 攻擊方取 min（最不痛的一擊打多少）、防守方取 max（最痛被打多少）；對我方不利的那桶 highlight。
  const buildCombined = () => {
    const atk = isAtk();
    const aggOf = (other) => {
      const vals = chartToolState.picks.map((p) =>
        atk ? singleMultiplier(p, other) : singleMultiplier(other, p));
      return atk ? Math.min(...vals) : Math.max(...vals);
    };
    // 每桶：倍率、危險與否、好（安全）與否、文案；依危險度排序（危險者在前）。
    const buckets = atk
      ? [
          { v: 0,   danger: true,  key: 'chart.tool.cov.none' },
          { v: 0.5, danger: true,  key: 'chart.tool.cov.weak' },
          { v: 1,   key: 'chart.tool.cov.ok1' },
          { v: 2,   good: true,    key: 'chart.tool.cov.good' },
        ]
      : [
          { v: 2,   danger: true,  key: 'chart.tool.def.hurt' },
          { v: 1,   key: 'chart.tool.def.plain' },
          { v: 0.5, good: true,    key: 'chart.tool.def.resist' },
          { v: 0,   good: true,    key: 'chart.tool.def.immune' },
        ];
    const wrap = el('<div class="ct-combined"></div>');
    wrap.appendChild(el(`<p class="ct-explain">${esc(atk ? t('chart.tool.atkExplain') : t('chart.tool.defExplain'))}</p>`));
    buckets.forEach((b) => {
      const list = TYPES.filter((other) => aggOf(other) === b.v);
      if (!list.length) return;
      const cls = b.danger ? ' ct-bucket--danger' : b.good ? ' ct-bucket--safe' : '';
      wrap.appendChild(el(`<div class="ct-bucket${cls}">
        <span class="ct-bucket__k">${esc(formatMultiplier(b.v))}<small>${esc(t(b.key))}</small></span>
        <span class="ct-bucket__v">${list.map((o) => badge(o)).join('')}</span>
      </div>`));
    });
    return wrap;
  };

  const renderResult = () => {
    resultBox.innerHTML = '';
    if (!chartToolState.picks.length) {
      resultBox.appendChild(el(`<p class="ct-hint">${esc(t('chart.tool.pickPrompt'))}</p>`));
      return;
    }
    resultBox.appendChild(buildCombined());
  };

  TYPES.forEach((tk) => {
    const m = TYPE_META[tk];
    const b = el(`<button class="type-pick" style="background:${m.color}" aria-pressed="${chartToolState.picks.includes(tk)}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    b.onclick = () => togglePick(tk);
    grid.appendChild(b);
  });

  renderPicked();
  renderResult();
  return wrap;
}

// 共用：屬性多選器（行內展開用），就地增刪 selected 陣列、達上限忽略新增。
function buildTypeChooser(selected, max, onChange) {
  const g = el('<div class="ct-chooser"></div>');
  TYPES.forEach((tk) => {
    const m = TYPE_META[tk];
    const b = el(`<button class="type-pick type-pick--sm" style="background:${m.color}" aria-pressed="${selected.includes(tk)}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    b.onclick = () => {
      const i = selected.indexOf(tk);
      if (i >= 0) selected.splice(i, 1);
      else if (selected.length < max) selected.push(tk);
      else return; // 達上限
      onChange();
    };
    g.appendChild(b);
  });
  return g;
}

// 一個倍率分桶列（共用 .ct-bucket 樣式）。types 為空則不產生。
// headOverride 有值時用它當標頭（總評用「N 種」而非單一倍率）。
function ctBucketRow(mult, labelKey, types, kind, headOverride) {
  if (!types.length) return '';
  const cls = kind === 'danger' ? ' ct-bucket--danger' : kind === 'safe' ? ' ct-bucket--safe' : kind === 'warn' ? ' ct-bucket--warn' : '';
  const head = headOverride != null ? esc(headOverride) : esc(formatMultiplier(mult));
  return `<div class="ct-bucket${cls}">
    <span class="ct-bucket__k">${head}<small>${esc(t(labelKey))}</small></span>
    <span class="ct-bucket__v">${types.map((o) => badge(o)).join('')}</span>
  </div>`;
}

// 我的隊伍：A/B/C 三隊、逐隻防/攻分析、隊伍總評。
function buildTeamTool() {
  if (!chartToolState.team) chartToolState.team = loadTeams();
  const ts = chartToolState.team;
  const mons = () => ts.sets[ts.active];
  let expanded = -1; // 目前展開的隻 index（-1＝全收合）

  const wrap = el(`
    <div class="ct-team">
      <p class="ct-explain">${esc(t('chart.tool.team.explain'))}</p>
      <div class="ct-teamtabs"></div>
      <div class="ct-mons"></div>
      <div class="ct-team-summary"></div>
    </div>`);
  const tabsBox = wrap.querySelector('.ct-teamtabs');
  const monsBox = wrap.querySelector('.ct-mons');
  const sumBox = wrap.querySelector('.ct-team-summary');

  const persist = () => saveTeams(ts);
  const refresh = () => { persist(); renderMons(); renderSummary(); syncTabs(); };
  // 攻擊倍率含屬修（本系 STAB）：招式屬性與該隻自身屬性相同 → ×1.5（本系剋制可達 3×）。
  const atkMult = (mon, mv, d) => singleMultiplier(mv, d) * (mon.def.includes(mv) ? 1.5 : 1);

  ['A', 'B', 'C'].forEach((k) => {
    const b = el(`<button class="seg ct-teamtab"><span>${k}</span><small></small></button>`);
    b.onclick = () => { ts.active = k; expanded = -1; refresh(); };
    tabsBox.appendChild(b);
  });
  const syncTabs = () => tabsBox.querySelectorAll('.ct-teamtab').forEach((b, i) => {
    const k = ['A', 'B', 'C'][i];
    b.setAttribute('aria-pressed', String(ts.active === k));
    b.querySelector('small').textContent = ts.sets[k].length ? ts.sets[k].length : '';
  });

  // 單隻：被各攻擊屬性打的倍率（雙屬性取乘積）＋招式打不動哪些。
  const buildMonAnalysis = (mon) => {
    const box = el('<div class="ct-mon__ana"></div>');
    // 防禦：對 18 個攻擊屬性的倍率
    if (mon.def.length) {
      const quad = [], weak = [], resist = [], qresist = [], immune = [];
      TYPES.forEach((a) => {
        const m = multiplier(a, mon.def);
        if (m === 4) quad.push(a);
        else if (m === 2) weak.push(a);
        else if (m === 0) immune.push(a);
        else if (m === 0.25) qresist.push(a);
        else if (m === 0.5) resist.push(a);
      });
      box.insertAdjacentHTML('beforeend', `<p class="ct-mini">${esc(t('chart.tool.team.defFace'))}</p>`);
      box.insertAdjacentHTML('beforeend',
        ctBucketRow(4, 'chart.tool.team.monQuad', quad, 'danger') +
        ctBucketRow(2, 'chart.tool.team.monHurt', weak, 'danger') +
        ctBucketRow(0.5, 'chart.tool.team.monResist', resist, 'safe') +
        ctBucketRow(0.25, 'chart.tool.team.monQResist', qresist, 'safe') +
        ctBucketRow(0, 'chart.tool.team.monImmune', immune, 'safe'));
    } else {
      box.insertAdjacentHTML('beforeend', `<p class="ct-mini ct-muted">${esc(t('chart.tool.team.defEmpty'))}</p>`);
    }
    // 攻擊：每招倍率含屬修（本系 STAB ×1.5），每個防守屬性取最佳招式倍率。
    // 本系剋制可達 3×（1.5×2）＝最痛；列出能 3× 的、打不動（被抵抗）、完全沒效。
    if (mon.atk.length) {
      const strong = [], resisted = [], noeffect = [];
      TYPES.forEach((d) => {
        const best = Math.max(...mon.atk.map((mv) => atkMult(mon, mv, d)));
        if (best === 0) noeffect.push(d);
        else if (best >= 3) strong.push(d);
        else if (best < 1) resisted.push(d);
      });
      box.insertAdjacentHTML('beforeend', `<p class="ct-mini">${esc(t('chart.tool.team.atkFace'))}</p>`);
      const rows = ctBucketRow(3, 'chart.tool.team.monStrong', strong, 'safe') +
        ctBucketRow(0.5, 'chart.tool.team.monNoHit', resisted, 'danger') +
        ctBucketRow(0, 'chart.tool.team.monNoEffect', noeffect, 'danger');
      box.insertAdjacentHTML('beforeend', rows || `<p class="ct-mini ct-muted">${esc(t('chart.tool.team.atkPlain'))}</p>`);
    } else {
      box.insertAdjacentHTML('beforeend', `<p class="ct-mini ct-muted">${esc(t('chart.tool.team.atkEmpty'))}</p>`);
    }
    return box;
  };

  const buildMonRow = (mon, i) => {
    const open = expanded === i;
    const row = el(`<div class="ct-mon${open ? ' is-open' : ''}${mon.hidden ? ' is-off' : ''}"></div>`);
    const defSum = mon.def.length
      ? mon.def.map((tk) => `<span class="type-badge" style="background:${TYPE_META[tk].color}">${typeIcon(tk)}${esc(typeName(tk))}</span>`).join('')
      : `<span class="ct-empty">${esc(t('chart.tool.team.noType'))}</span>`;
    const head = el(`<div class="ct-mon__head"></div>`);
    // 左側眼睛：張開＝納入總評，閉上＝暫時忽略這隻（不刪除）。
    const eye = el(`<button class="ct-mon__eye" aria-pressed="${!mon.hidden}" aria-label="${esc(t(mon.hidden ? 'chart.tool.team.eyeOff' : 'chart.tool.team.eyeOn'))}">${uiIcon(mon.hidden ? 'eyeOff' : 'eye')}</button>`);
    eye.onclick = () => { mon.hidden = !mon.hidden; refresh(); };
    const main = el(`
      <button class="ct-mon__main">
        <span class="ct-mon__no">#${i + 1}</span>
        <span class="ct-mon__sum">${defSum}<span class="ct-mon__atkn">${esc(t('chart.tool.team.atkN', { n: mon.atk.length }))}</span></span>
        <span class="ct-mon__chev">${uiIcon(open ? 'up' : 'grid')}</span>
      </button>`);
    main.onclick = () => { expanded = open ? -1 : i; renderMons(); };
    head.appendChild(eye);
    head.appendChild(main);
    row.appendChild(head);
    if (open) {
      const bodyEl = el('<div class="ct-mon__body"></div>');
      bodyEl.insertAdjacentHTML('beforeend', `<p class="label">${esc(t('chart.tool.team.defLabel'))}</p>`);
      bodyEl.appendChild(buildTypeChooser(mon.def, 2, refresh));
      bodyEl.insertAdjacentHTML('beforeend', `<p class="label">${esc(t('chart.tool.team.atkLabel'))}</p>`);
      bodyEl.appendChild(buildTypeChooser(mon.atk, 4, refresh));
      bodyEl.appendChild(buildMonAnalysis(mon));
      const del = el(`<button class="linklike ct-mon__del">${esc(t('chart.tool.team.removeMon'))}</button>`);
      del.onclick = () => { mons().splice(i, 1); expanded = -1; refresh(); };
      bodyEl.appendChild(del);
      row.appendChild(bodyEl);
    }
    return row;
  };

  const renderMons = () => {
    monsBox.innerHTML = '';
    if (!mons().length) monsBox.insertAdjacentHTML('beforeend', `<p class="ct-hint">${esc(t('chart.tool.team.empty'))}</p>`);
    mons().forEach((mon, i) => monsBox.appendChild(buildMonRow(mon, i)));
    if (mons().length < 6) {
      const add = el(`<button class="btn btn--ghost ct-addmon">${esc(t('chart.tool.team.addMon'))}</button>`);
      add.onclick = () => { mons().push({ def: [], atk: [], hidden: false }); expanded = mons().length - 1; refresh(); };
      monsBox.appendChild(add);
    }
  };

  // 隊伍總評：只算「眼睛張開」的隻。點出聯防漏洞（被什麼打全隊沒人能抗）
  // 與覆蓋（攻擊含屬修＝本系 3×）：全隊打不到 2 倍＝硬漏洞、打得到 2 倍但沒人 3 倍＝本系剋制不足。
  const renderSummary = () => {
    sumBox.innerHTML = '';
    const team = mons().filter((m) => !m.hidden);
    const withDef = team.filter((m) => m.def.length);
    const withAtk = team.filter((m) => m.atk.length);
    if (!withDef.length && !withAtk.length) return;

    const card = el(`<div class="ct-summary"><h3>${esc(t('chart.tool.team.sumTitle'))}</h3></div>`);
    let defHoles = [], offHoles = []; // 給 meta 補洞建議共用

    // 聯防：每個攻擊屬性，全隊沒人抵抗（無 ≤½×）即為漏洞。
    if (withDef.length) {
      defHoles = TYPES.filter((a) => !withDef.some((m) => multiplier(a, m.def) <= 0.5));
      const verdict = defHoles.length
        ? t('chart.tool.team.sumDefNote', { n: defHoles.length })
        : t('chart.tool.team.sumDefOk');
      card.insertAdjacentHTML('beforeend', `<p class="ct-verdict${defHoles.length ? ' is-bad' : ' is-ok'}">${esc(verdict)}</p>`);
      card.insertAdjacentHTML('beforeend', ctBucketRow(null, 'chart.tool.team.sumNoResist', defHoles, 'danger', t('chart.tool.team.nKinds', { n: defHoles.length })));
      // 集中弱點：同一攻擊屬性被 ≥3 隻打弱（≥2×）即為缺點——即使有人能抗，被一招壓制多隻仍危險。
      const STACK_MIN = 3;
      const stacked = TYPES
        .map((a) => ({ a, n: withDef.filter((m) => multiplier(a, m.def) >= 2).length }))
        .filter((x) => x.n >= STACK_MIN)
        .sort((x, y) => y.n - x.n);
      if (stacked.length) {
        card.insertAdjacentHTML('beforeend', `<p class="ct-verdict is-bad">${esc(t('chart.tool.team.sumStackNote', { n: stacked.length }))}</p>`);
        const items = stacked.map(({ a, n }) => `<span class="ct-stack">${badge(a)}<span class="ct-stack__n">×${n}</span></span>`).join('');
        card.insertAdjacentHTML('beforeend', `<div class="ct-bucket ct-bucket--danger"><span class="ct-bucket__k">${esc(t('chart.tool.team.nKinds', { n: stacked.length }))}<small>${esc(t('chart.tool.team.sumStacked'))}</small></span><span class="ct-bucket__v">${items}</span></div>`);
      }
    }
    // 覆蓋：每個防守屬性取全隊最佳招式倍率（含屬修）。<2＝硬漏洞、[2,3)＝沒人 3 倍。
    if (withAtk.length) {
      const bestOf = (d) => Math.max(0, ...withAtk.flatMap((m) => m.atk.map((mv) => atkMult(m, mv, d))));
      offHoles = TYPES.filter((d) => bestOf(d) < 2);
      const soft = TYPES.filter((d) => { const b = bestOf(d); return b >= 2 && b < 3; });
      if (offHoles.length) {
        card.insertAdjacentHTML('beforeend', `<p class="ct-verdict is-bad">${esc(t('chart.tool.team.sumAtkNote', { n: offHoles.length }))}</p>`);
        card.insertAdjacentHTML('beforeend', ctBucketRow(null, 'chart.tool.team.sumNoCover', offHoles, 'danger', t('chart.tool.team.nKinds', { n: offHoles.length })));
      }
      if (soft.length) {
        card.insertAdjacentHTML('beforeend', `<p class="ct-verdict is-warn">${esc(t('chart.tool.team.sumSoftNote', { n: soft.length }))}</p>`);
        card.insertAdjacentHTML('beforeend', ctBucketRow(null, 'chart.tool.team.sumNo3x', soft, 'warn', t('chart.tool.team.nKinds', { n: soft.length })));
      }
      if (!offHoles.length && !soft.length) {
        card.insertAdjacentHTML('beforeend', `<p class="ct-verdict is-ok">${esc(t('chart.tool.team.sumAtkOk'))}</p>`);
      }
    }
    sumBox.appendChild(card);
    const rec = buildUsageRecommender(defHoles, offHoles);
    if (rec) sumBox.appendChild(rec);
  };

  syncTabs();
  renderMons();
  renderSummary();
  return wrap;
}

// 從 meta top-50（Champions Lab, VGC 雙打）挑最能補本隊攻守破洞的人，並點名補哪一招。
// 防守補＝候選屬性抵抗（≤0.5×）某防守洞；攻擊補＝候選某招（含本系 STAB）打某攻擊洞 ≥2×。
// 綜合分 = 防守補數 + 攻擊補數，兩邊都補再 ×1.5（優先度更高）。取 top 5。
function buildUsageRecommender(defHoles, offHoles) {
  const list = DATA.usageData && DATA.usageData.list;
  if (!list || !list.length) return null;
  if (!defHoles.length && !offHoles.length) return null;

  const scored = [];
  for (const c of list) {
    const types = c.types || [];
    const defFix = defHoles.filter((a) => multiplier(a, types) <= 0.5);
    const offFix = [];
    for (const d of offHoles) {
      let best = null;
      for (const mv of c.moves || []) {
        const mult = singleMultiplier(mv.type, d) * (types.includes(mv.type) ? 1.5 : 1);
        if (mult >= 2 && (!best || mult > best.mult)) best = { hole: d, move: mv, mult };
      }
      if (best) offFix.push(best);
    }
    if (!defFix.length && !offFix.length) continue;
    const dual = defFix.length > 0 && offFix.length > 0;
    const score = (defFix.length + offFix.length) * (dual ? 1.5 : 1);
    scored.push({ c, defFix, offFix, score, dual });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || (b.c.usagePct || 0) - (a.c.usagePct || 0));

  const card = el(`<div class="ct-summary ct-rec">
    <h3>${esc(t('chart.tool.team.recTitle'))}</h3>
    <p class="ct-rec__sub">${esc(t('chart.tool.team.recSub'))}</p>
  </div>`);
  scored.slice(0, 5).forEach((s, i) => {
    const c = s.c;
    const img = (DATA.pokedex[c.key] && DATA.pokedex[c.key].image) || '';
    const dualTag = s.dual ? `<span class="ct-rec__dual">${esc(t('chart.tool.team.recDual'))}</span>` : '';
    const row = el(`<div class="ct-rec__row">
      <div class="ct-rec__head">
        <span class="ct-rec__rank">#${i + 1}</span>
        ${img ? `<img class="ct-rec__art" src="${esc(img)}" alt="${esc(c.nameZh)}" loading="lazy" />` : ''}
        <span class="ct-rec__name">${esc(c.nameZh)}</span>
        <span class="ct-rec__use">${esc(t('chart.tool.team.recUse', { p: (c.usagePct ?? 0).toFixed(1) }))}</span>
        ${dualTag}
      </div>
    </div>`);
  const body = el('<div class="ct-rec__body"></div>');
    if (s.defFix.length) {
      body.insertAdjacentHTML('beforeend',
        `<div class="ct-rec__line"><span class="ct-rec__k ct-rec__k--def">${esc(t('chart.tool.team.recDef'))}</span><span class="ct-rec__v">${s.defFix.map((a) => badge(a)).join('')}</span></div>`);
    }
    if (s.offFix.length) {
      const items = s.offFix.map((f) =>
        `<span class="ct-rec__atk">${badge(f.hole)}<span class="ct-rec__via">${esc(t('chart.tool.team.recVia'))}</span><span class="ct-rec__move" style="background:${TYPE_META[f.move.type].color}">${typeIcon(f.move.type)}${esc(f.move.nameZh || f.move.nameEn)}</span></span>`).join('');
      body.insertAdjacentHTML('beforeend',
        `<div class="ct-rec__line"><span class="ct-rec__k ct-rec__k--atk">${esc(t('chart.tool.team.recAtk'))}</span><span class="ct-rec__v">${items}</span></div>`);
    }
    row.appendChild(body);
    card.appendChild(row);
  });
  card.insertAdjacentHTML('beforeend', `<p class="ct-rec__src">${esc(t('chart.tool.team.recSrc'))}</p>`);
  return card;
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
  appEl.classList.add('app--wide'); // 大螢幕放寬版面，寬表格更好讀
  // 入口只在「誰比較快」的 setup；直接帶網址進來時補一個預設賽季狀態。
  if (!state.setupState || state.setupState.mode !== 'speed') {
    state.setupState = { mode: 'speed', season: defaultSeason(), difficulty: DEFAULT_SPEED_DIFFICULTY, seed: newSeed() };
  }
  const season = state.setupState.season;

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
            <button class="season-btn" data-perrow="5" aria-pressed="${state.spdPerRow === 5}">${esc(t('speedline.perRowUnit', { n: 5 }))}</button>
            <button class="season-btn" data-perrow="10" aria-pressed="${state.spdPerRow === 10}">${esc(t('speedline.perRowUnit', { n: 10 }))}</button>
          </div>
        </div>
        <div class="table-wrap" data-table></div>
        <div class="muted spd-legend">
          <p class="spd-legend__line"><b>投資</b>：最速＝速度能力點數 32（滿）＋加速性格 ×1.1；準速＝點數 32、無性格修正；無振＝點數 0；減速＝點數 0＋減速性格 ×0.9。</p>
          <p class="spd-legend__line"><b>道具・場地</b>：圍巾（講究圍巾）×1.5；順風 ×2。</p>
          <p class="spd-legend__line"><b>《冠軍》與舊世代差異</b>：舊作的「努力值」（單項最多 252、合計 510、每 4 點 +1）與「個體值」，在《冠軍》改成「能力點數」——每隻固定 66 點、單項上限 32，直接加進 Lv50 實數值（每點 +1），個體值一律視為最大（31）。Lv50 下 32 點的效果剛好等於舊作 252 努力值、0 點等於 0 努力，故本表數字兩制相同。</p>
          <p class="spd-legend__line"><b>日文詞源</b>：「最速」速度拉到最高；「準速」準＝次一階，滿投但不靠性格 ×1.1；「無振」振り＝分配點數，無振＝完全不投。</p>
        </div>
        <button class="btn btn--ghost" data-nav="back">${esc(t('common.back'))}</button>
      </div>
      <button class="spd-top" data-act="spd-top" aria-label="${esc(t('speedline.toTop'))}">${uiIcon('up')}</button>
    </section>`);

  const seasonWrap = node.querySelector('[data-seasons]');
  seasonKeys().forEach((key) => {
    const b = el(`<button class="season-btn" aria-pressed="${season === key}">${esc(seasonLabel(key))}</button>`);
    b.onclick = () => { state.setupState.season = key; viewSpeedChart(); };
    seasonWrap.appendChild(b);
  });

  node.querySelector('[data-table]').appendChild(buildSpeedTable(season, state.spdPerRow));

  node.querySelectorAll('[data-perrow]').forEach((b) => {
    b.onclick = () => {
      state.spdPerRow = Number(b.dataset.perrow) === 5 ? 5 : 10;
      try { localStorage.setItem(SPD_PERROW_KEY, String(state.spdPerRow)); } catch { /* 存不了就只在本次有效 */ }
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

// ── 共用浮動提示（速度線表欄首說明）─────────────────────────────
// 參考 ui collection 的 hover-tooltip：單一 bubble 掛在 <body>，避開表格 overflow 裁切；
// 桌機（可 hover、精準指標）hover/focus 顯示並在欄首附 info icon；觸控裝置點擊切換、不顯 icon 省空間。
const CAN_HOVER = typeof matchMedia === 'function'
  ? matchMedia('(hover: hover) and (pointer: fine)').matches : true;
let _tipEl = null, _tipArrow = null, _tipBody = null, _tipActive = null;
function ensureTip() {
  if (_tipEl) return;
  _tipEl = document.createElement('div');
  _tipEl.className = 'ui-tip';
  _tipEl.id = 'ui-tip-shared';
  _tipEl.setAttribute('role', 'tooltip');
  _tipArrow = document.createElement('div'); _tipArrow.className = 'ui-tip__arrow';
  _tipBody = document.createElement('div'); _tipBody.className = 'ui-tip__body';
  _tipEl.append(_tipArrow, _tipBody);
  document.body.appendChild(_tipEl);
  // 捲動 / 點空白處收起（觸控模式靠它關閉）
  window.addEventListener('scroll', hideTip, { passive: true, capture: true });
  document.addEventListener('click', (e) => {
    if (_tipActive && !e.target.closest('[data-coltip]')) hideTip();
  });
}
function positionTip(rect) {
  const tw = _tipEl.offsetWidth, th = _tipEl.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight, margin = 10, gap = 8;
  let left = rect.left + rect.width / 2 - tw / 2;   // 置中於欄首
  if (left + tw > vw - margin) left = vw - tw - margin;
  if (left < margin) left = margin;
  let top = rect.bottom + gap, above = false;
  if (top + th > vh - margin) { top = rect.top - th - gap; above = true; } // 下方超出 → 翻到上方
  _tipEl.classList.toggle('is-above', above);
  _tipEl.style.left = `${Math.round(left)}px`;
  _tipEl.style.top = `${Math.round(top)}px`;
  const center = rect.left + rect.width / 2 - left;  // 箭頭仍指向欄首中心
  _tipArrow.style.left = `${Math.round(Math.max(12, Math.min(center, tw - 12)))}px`;
}
function showTip(trigger, text) {
  ensureTip();
  _tipBody.textContent = text;
  _tipEl.classList.add('is-visible');
  _tipActive = trigger;
  positionTip(trigger.getBoundingClientRect());
}
function hideTip() { if (_tipEl) _tipEl.classList.remove('is-visible'); _tipActive = null; }
function attachColTip(thEl, text) {
  if (!text) return;
  thEl.setAttribute('aria-describedby', 'ui-tip-shared');
  thEl.tabIndex = 0;
  if (CAN_HOVER) {
    thEl.addEventListener('mouseenter', () => showTip(thEl, text));
    thEl.addEventListener('mouseleave', hideTip);
    thEl.addEventListener('focus', () => showTip(thEl, text));
    thEl.addEventListener('blur', hideTip);
  } else {
    thEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_tipActive === thEl) hideTip(); else showTip(thEl, text);
    });
  }
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

  // 每欄：[key, 標籤, 欄首說明]。說明在桌機 hover、手機點擊欄首時浮現。
  // 定義採《冠軍》制度：能力點數（取代努力值，單項上限 32、直接加實數值），個體值固定最大。
  const cols = [
    ['max', '最速', '速度能力點數 32（滿）＋加速性格（×1.1）。「最速」＝速度衝到最高。'],
    ['neu', '準速', '速度能力點數 32（滿）、性格無修正。「準速」＝差最速一階，沒吃性格的 ×1.1。'],
    ['noInv', '無振', '速度能力點數 0、性格無修正。「無振」源自日文「振り（分配點數）」，無振＝完全不投速度。'],
    ['neg', '減速', '速度能力點數 0＋減速性格（×0.9）。'],
    ['scarfMax', '圍巾·最速', '最速再 ×1.5（講究圍巾）。'],
    ['scarfNeu', '圍巾·準速', '準速再 ×1.5（講究圍巾）。'],
    ['twMax', '順風·最速', '最速再 ×2（順風）。'],
    ['twNeu', '順風·準速', '準速再 ×2（順風）。'],
    ['twNoInv', '順風·無振', '無振再 ×2（順風）。'],
  ];

  // 種族值第一欄；立繪第二欄加寬（同速一整排不換行）；其後接各速度線。
  // 欄首包成 .spd-th，桌機再附 info icon（觸控不顯、省空間）；說明文字存在 data-coltip。
  const tipIcon = CAN_HOVER ? `<span class="spd-th__i">${uiIcon('info')}</span>` : '';
  const thCell = (cls, label, tip) =>
    `<th class="${cls}" data-coltip="${esc(tip)}"><span class="spd-th">${esc(label)}${tipIcon}</span></th>`;
  let head = '<tr>'
    + thCell('spd-base', '種族', '速度種族值，是換算各速度線的基準')
    + thCell('spd-mons', '寶可夢', '擁有此速度種族值的寶可夢，同速排成一列')
    + cols.map(([, label, tip]) => thCell('', label, tip)).join('')
    + '</tr>';

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
  table.querySelectorAll('th[data-coltip]').forEach((th) => attachColTip(th, th.getAttribute('data-coltip')));
  return table;
}

// ── 圖鑑（題庫預覽：縮圖牆 + 類別/屬性過濾）─────────────────────
function dexCategories() {
  return state.dexState.group === 'gen' ? [...GENERATIONS.map((g) => g.key), 'hisui'] : seasonKeys();
}
function dexCatLabel(key) {
  return state.dexState.group === 'gen' ? poolLabel(key) : seasonLabel(key);
}

function viewDex() {
  if (!dexCategories().includes(state.dexState.poolKey)) state.dexState.poolKey = dexCategories()[0];
  // 世代/地區 → DATA.nationalDex；賽制 → 賽季名單。兩者皆走 whoPool。依圖鑑編號排序。
  const pool = whoPool(state.dexState.poolKey)
    .slice()
    .sort((a, b) => (a.ndex || a.dex || 0) - (b.ndex || b.dex || 0) || (a.key < b.key ? -1 : 1));

  const node = el(`
    <section>
      <div class="card">
        <h2>${esc(t('dex.title'))}</h2>
        <div class="dex-groups">
          <button class="seg" data-group="gen" aria-pressed="${state.dexState.group === 'gen'}">${esc(t('dex.group.gen'))}</button>
          <button class="seg" data-group="season" aria-pressed="${state.dexState.group === 'season'}">${esc(t('dex.group.season'))}</button>
        </div>
        <div class="tab-scroll" data-cats></div>
        <div class="dex-types" data-types></div>
        <div class="dex-search">
          <span class="dex-search__icon" aria-hidden="true">${uiIcon('search')}</span>
          <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="${esc(t('dex.search'))}" aria-label="${esc(t('dex.search'))}" data-dex-search />
        </div>
        <p class="muted" data-count></p>
        <div class="dex-grid" data-grid></div>
        <button class="btn btn--ghost" data-nav="back">${esc(t('common.back'))}</button>
      </div>
      <button class="spd-top" data-act="dex-top" aria-label="${esc(t('speedline.toTop'))}">${uiIcon('up')}</button>
    </section>`);

  node.querySelectorAll('[data-group]').forEach((b) => {
    b.onclick = () => {
      if (state.dexState.group === b.dataset.group) return;
      state.dexState.group = b.dataset.group;
      state.dexState.poolKey = dexCategories()[0];
      state.dexState.type = '';
      state.dexState.q = '';
      viewDex();
    };
  });

  const catWrap = node.querySelector('[data-cats]');
  dexCategories().forEach((key) => {
    const b = el(`<button class="season-btn" aria-pressed="${state.dexState.poolKey === key}">${esc(dexCatLabel(key))}</button>`);
    b.onclick = () => { state.dexState.poolKey = key; state.dexState.type = ''; state.dexState.q = ''; viewDex(); };
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
      <button class="dex-cell" data-types="${esc((p.types || []).join(' '))}" data-zh="${esc(normalizeName(p.nameZh))}" data-en="${esc(normalizeName(p.nameEn || ''))}">
        <img class="dex-thumb" alt="${esc(p.nameZh)}" loading="lazy" />
        <span class="dex-name">${esc(p.nameZh)}${p.mega ? ' <span class="mega-tag">MEGA</span>' : ''}</span>
      </button>`);
    const img = cell.querySelector('img');
    img.src = p.image;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    cell.onclick = () => showName(cell.querySelector('.dex-name'));
    grid.appendChild(cell);
  });

  // 過濾：屬性（單選）＋名字模糊搜尋（中／英子序列，可跳字），兩者 AND；
  // 只切換 cell 顯示，不重繪、不重載圖。
  const cells = [...grid.querySelectorAll('.dex-cell')];
  const chips = [...typeWrap.querySelectorAll('.dex-type-chip')];
  const applyFilters = () => {
    const tk = state.dexState.type;
    const qa = Array.from(normalizeName(state.dexState.q || ''));
    const subseq = (n) => {
      let i = 0;
      for (const ch of Array.from(n)) { if (ch === qa[i] && ++i === qa.length) return true; }
      return false;
    };
    chips.forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.type === tk)));
    let shown = 0;
    cells.forEach((c) => {
      const typeOk = tk === '' || c.dataset.types.split(' ').includes(tk);
      const nameOk = !qa.length || subseq(c.dataset.zh) || subseq(c.dataset.en);
      const ok = typeOk && nameOk;
      c.hidden = !ok;
      if (ok) shown++;
    });
    countEl.textContent = t('dex.count', { n: shown });
  };
  chips.forEach((ch) => { ch.onclick = () => { state.dexState.type = ch.dataset.type; applyFilters(); }; });

  const searchInput = node.querySelector('[data-dex-search]');
  searchInput.value = state.dexState.q || '';
  searchInput.addEventListener('input', () => { state.dexState.q = searchInput.value; applyFilters(); });

  applyFilters();

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
  if (!state.dokuState || !state.dokuState.seed) state.dokuState = { seed: newSeed(), hintMode: 'hint', play: 'practice', pits: null, challenge: null };
  // 同 seed → 同盤；換 seed 才重算並清空作答。
  if (!state.dokuState.puzzle || state.dokuState.puzzle.seed !== String(state.dokuState.seed)) {
    state.dokuState.puzzle = generateDoku(state.dokuState.seed, DATA.nationalDex);
    state.dokuState.picks = Array(9).fill(null);
    state.dokuState.revealed = false;
  }
  const pz = state.dokuState.puzzle;
  const hintMode = state.dokuState.hintMode || 'hint';
  const isAuthor = state.dokuState.play === 'trap-author';
  const isSolve = state.dokuState.play === 'trap-solve';
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
    const pit = isSolve && state.dokuState.pits ? state.dokuState.pits[idx] : null;
    if (hintMode === 'nohint') openDokuTextInput(idx, rebuild, pit);
    else openDokuPicker(idx, rebuild, pit);
  };

  function buildDokuCell(idx) {
    const pick = state.dokuState.picks[idx];
    // #3：揭露參考答案放在獨立小條，不蓋掉使用者原本填的（只在一般練習、答錯或空白時顯示）。
    const ref = state.dokuState.revealed && (!pick || !pick.correct) ? pz.cells[idx] : null;
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
    const picks = state.dokuState.picks;
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
        if (!state.dokuState.trapTracked) { state.dokuState.trapTracked = true; gaEvent('trap_create', { hint_mode: hintMode }); }
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
      if (allFilled && !state.dokuState.solveTracked) { state.dokuState.solveTracked = true; gaEvent('trap_solve_finish', { ok }); }
      scoreEl.textContent = allFilled ? t('doku.trap.done', { ok }) : t('doku.trap.progress', { n: filled, ok });
      scoreEl.className = 'doku-score' + (allFilled ? ' doku-score--done' : '');
      revealBtn.hidden = true;       // 避坑挑戰不提供揭露（會破壞挑戰）
      shareWrap.hidden = true;
      trapNeed.hidden = true;
      cmpEl.hidden = true;
      return;
    }

    // 一般練習
    if (allFilled && !state.dokuState.tracked) { state.dokuState.tracked = true; gaEvent('doku_complete', { ok, hint_mode: hintMode }); }
    scoreEl.textContent = allFilled ? t('doku.done', { ok }) : t('doku.progress', { n: filled, ok });
    scoreEl.className = 'doku-score' + (allFilled ? ' doku-score--done' : '');
    revealBtn.hidden = state.dokuState.revealed || (allFilled && ok === 9);
    revealBtn.textContent = t('doku.reveal');
    trapNeed.hidden = true;

    const code = encodeResult({ mode: 'doku', season: '', seed: pz.seed, total: 9, score: ok, difficulty: 'all' });
    shareWrap.querySelector('[data-share-label]').textContent = t('doku.yourCode');
    node.querySelector('[data-share-url]').value = shareUrlFor(code);
    node.querySelector('[data-share-code]').textContent = code;
    shareWrap.hidden = false;

    if (allFilled && state.dokuState.challenge) {
      const them = state.dokuState.challenge.score;
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
      const used = new Set(state.dokuState.picks.filter((p) => p && !p.byReveal).map((p) => p.ndex));
      state.dokuState.picks = state.dokuState.picks.map((p, i) => {
        if (p && !p.byReveal) return p;
        const cands = cellEntries(i).filter((e) => !used.has(e.ndex));
        const pool = cands.length ? cands : cellEntries(i);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        used.add(pick.ndex);
        return { key: pick.key, ndex: pick.ndex, name: pick.nameZh, image: pick.image, mega: !!pick.mega, correct: true, byReveal: true };
      });
    } else {
      state.dokuState.revealed = true;     // 一般練習：顯示參考答案（不蓋掉原本填的）
    }
    rebuild();
  };
  node.querySelector('[data-act="newpuzzle"]').onclick = () => {
    state.dokuState = { seed: newSeed(), hintMode, play: isAuthor ? 'trap-author' : 'practice', pits: null, challenge: null };
    viewDoku();
  };

  const copyBtn = node.querySelector('[data-act="copy-doku"]');
  copyBtn.onclick = async () => {
    gaEvent('share_code', { kind: state.dokuState.play === 'trap-author' ? 'doku-trap' : 'doku' });
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
  if (!state.dokuState || !state.dokuState.puzzle) return;
  const pz = state.dokuState.puzzle;
  const rowCat = pz.rows[Math.floor(idx / 3)], colCat = pz.cols[idx % 3];
  const usedNdex = new Set(state.dokuState.picks.filter(Boolean).map((p) => p.ndex));
  // 挖坑挑戰：把出題人挖的坑從候選中濾掉，朋友就不會（也不能）選到同一隻。
  const entries = Object.entries(DATA.nationalDex).map(([key, v]) => ({ key, ...v })).filter((p) => !pit || p.key !== pit);

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
    state.dokuState.picks[idx] = {
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
  const pz = state.dokuState.puzzle;
  const rowCat = pz.rows[Math.floor(idx / 3)], colCat = pz.cols[idx % 3];
  return Object.entries(DATA.nationalDex).map(([key, v]) => ({ key, ...v })).filter((p) => cellSatisfied(p, rowCat, colCat));
}

// 無提示作答彈窗：純文字輸入、不給候選清單；查無對應寶可夢時，格子顯示使用者打的字。
function openDokuTextInput(idx, onPicked, pit = null) {
  if (!state.dokuState || !state.dokuState.puzzle) return;
  const pz = state.dokuState.puzzle;
  const rowCat = pz.rows[Math.floor(idx / 3)], colCat = pz.cols[idx % 3];
  const usedNdex = new Set(state.dokuState.picks.filter(Boolean).map((p) => p.ndex));
  const entries = Object.entries(DATA.nationalDex).map(([key, v]) => ({ key, ...v }));

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
      state.dokuState.picks[idx] = { key: match.key, ndex: match.ndex, name: match.nameZh, image: match.image, mega: !!match.mega, correct: cellSatisfied(match, rowCat, colCat) };
    } else {
      // 查無這隻：照規格在格子顯示使用者打的字（非立繪），視為未答對。
      state.dokuState.picks[idx] = { key: null, ndex: null, name: raw, image: null, mega: false, correct: false, typed: true };
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
  if (!state.dokuSetup) state.dokuSetup = { play: 'practice', hintMode: 'hint', seed: newSeed() };
  const { play, hintMode } = state.dokuSetup;

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
    b.onclick = () => { state.dokuSetup.play = b.dataset.val; viewDokuSetup(); };
  });
  node.querySelectorAll('[data-pick="hint"] [data-val]').forEach((b) => {
    b.onclick = () => { state.dokuSetup.hintMode = b.dataset.val; viewDokuSetup(); };
  });
  node.querySelector('[data-act="start"]').onclick = () => {
    state.dokuState = {
      seed: newSeed(), hintMode: state.dokuSetup.hintMode,
      play: state.dokuSetup.play === 'trap' ? 'trap-author' : 'practice',
      pits: null, challenge: null,
    };
    go('#/doku');
  };
  setView(node);
}

// ── 路由 ────────────────────────────────────────────────────────
// ── 分流外殼：母頁（Zarbi）/ 快問快答 / 寶冠軍工具箱 ───────────────
// 純加法的最外層分流：母頁兩個入口、工具箱集中既有工具頁的入口（不重做工具本身）。
// 三個 section 各有首頁；左上品牌名與返回行為依當前 section 決定。
// 接縫提示：此區塊（常數 + sectionOf + paintBrand + viewMother/viewTools）日後可整段抽成 nav.js。
const ROUTE_QUIZ_HOME = '#/q';
const ROUTE_TOOLS_HOME = '#/tools';
const TOOL_ROUTES = new Set(['#/chart', '#/coverage', '#/speedline', '#/dex']);
const SECTION_HOME = { mother: '#/', quiz: ROUTE_QUIZ_HOME, tools: ROUTE_TOOLS_HOME };
const BRAND_NAME = { mother: 'Zarbi', quiz: '寶可夢快問快答', tools: '寶冠軍工具箱' };

function sectionOf(hash) {
  if (!hash || hash === '#/') return 'mother';
  if (hash === ROUTE_TOOLS_HOME || TOOL_ROUTES.has(hash)) return 'tools';
  return 'quiz'; // setup/quiz/result/history/doku*/master/who-builder/#/q
}

// 工具頁返回「來源」：點進工具前記下當下的 hash（從 setup 進＝回 setup，從工具箱進＝回工具箱）。
let toolReferrer = ROUTE_TOOLS_HOME;

// 依當前 section 更新左上品牌名（母頁 Zarbi、快問快答內頁、工具箱內頁各自名）。
function paintBrand() {
  const nameEl = document.querySelector('.brand__name');
  if (nameEl) nameEl.textContent = BRAND_NAME[sectionOf(location.hash)];
}

// 母頁：最外層分流，左工具箱、右快問快答。
function viewMother() {
  const node = el(`
    <section class="mother">
      <div class="mother-brand">
        <span class="mother-logo">${unownLogo()}</span>
        <h1>Zarbi</h1>
      </div>
      <p class="lead">選一個入口開始。</p>
      <div class="mother-grid">
        <button class="mother-card" data-nav="tools">
          <span class="mother-card__icon">${uiIcon('search')}</span>
          <span class="mother-card__title">寶冠軍工具箱</span>
          <span class="mother-card__desc">相剋表、聯防小工具、速度線表、圖鑑</span>
        </button>
        <button class="mother-card" data-nav="q">
          <span class="mother-card__icon">${uiIcon('who')}</span>
          <span class="mother-card__title">寶可夢快問快答</span>
          <span class="mother-card__desc">屬性相剋、速度、我是誰、數獨等隨機測驗</span>
        </button>
      </div>
    </section>`);
  setView(node);
}

// 寶冠軍工具箱：集中入口，連到既有工具頁（複製入口即可，不動工具本身）。
function viewTools() {
  const tools = [
    { nav: 'chart', icon: 'shield', title: t('chart.title'), desc: '查任意攻防屬性的傷害倍率，附完整相剋表' },
    { nav: 'coverage', icon: 'swords', title: t('chart.tool.title'), desc: '把屬性或隊伍當整體，評估攻守覆蓋與漏洞' },
    { nav: 'speedline', icon: 'bolt', title: t('speedline.title'), desc: '依賽季列出各速度種族值在 50 級的實數值' },
    { nav: 'dex', icon: 'search', title: t('dex.title'), desc: '依世代／賽制瀏覽寶可夢立繪與名字' },
  ];
  const node = el(`
    <section class="card">
      <h1>寶冠軍工具箱</h1>
      <p class="lead">查表與分析小工具，不計分、隨時用。</p>
      ${tools.map((x) => `
        <button class="quiz-card" data-nav="${x.nav}">
          <span class="quiz-card__emoji" aria-hidden="true">${uiIcon(x.icon)}</span>
          <span class="quiz-card__text">
            <span class="quiz-card__title">${esc(x.title)}</span>
            <span class="quiz-card__desc">${esc(x.desc)}</span>
          </span>
          <span class="hist-chevron" aria-hidden="true">›</span>
        </button>`).join('')}
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);
  setView(node);
}

function render() {
  paintBrand(); // 任何畫面（含 ?c= 戰帖早返回）都先校正左上品牌名
  appEl.classList.remove('app--wide'); // 預設窄版；需要寬版的頁面（速度線表）自行加回
  const params = new URLSearchParams(location.search);
  const code = params.get('c');
  const hash = location.hash;

  // 帶成績碼進站且尚未開始挑戰 → 顯示戰帖。消費掉 ?c= 避免站內導覽重複攔截。
  if (code && !state.session && hash !== '#/quiz' && hash !== '#/result') {
    const decoded = decodeShare(code);
    history.replaceState(null, '', location.pathname + (hash || '#/'));
    if (decoded) { gaPageView('/challenge'); gaEvent('challenge_view', { kind: decoded.mode }); return viewChallenge(decoded); }
  }

  gaPageView();

  switch (hash) {
    case '#/q': return viewHome();
    case '#/tools': return viewTools();
    case '#/setup': return viewSetup();
    case '#/quiz': return viewQuiz();
    case '#/result': return viewResult();
    case '#/history': return viewHistoryDetail();
    case '#/chart': return viewChart();
    case '#/coverage': return viewCoverage();
    case '#/speedline': return viewSpeedChart();
    case '#/dex': return viewDex();
    case '#/doku-setup': return viewDokuSetup();
    case '#/doku': return viewDoku();
    case '#/master': return viewMaster();
    case '#/who-builder': return viewWhoBuilder();
    default: return viewMother();
  }
}

// 導覽
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (!nav) return;
  const dest = nav.dataset.nav;
  if (dest === 'home') {
    // 回當前 section 首頁；已在 section 首頁則再上一層回母頁。重設進行中狀態。
    state.session = null; state.setupState = null; state.dokuState = null; state.dokuSetup = null; state.masterState = null; state.builderState = null;
    const home = SECTION_HOME[sectionOf(location.hash)];
    go(location.hash === home ? '#/' : home);
  } else if (dest === 'back') {
    // 工具頁返回來源（不重設狀態，保留 setup 等進行中內容）。
    go(toolReferrer || ROUTE_TOOLS_HOME);
  } else {
    const target = '#/' + dest;
    if (TOOL_ROUTES.has(target)) toolReferrer = location.hash || '#/'; // 記下從哪進工具，供「返回」回到來源
    go(target);
  }
});

window.addEventListener('hashchange', render);

// ── 啟動：載入靜態資料後首次渲染 ───────────────────────────────
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
    DATA.pokedex = await dexRes.json();
    DATA.seasonsData = await seasonsRes.json();
    DATA.nationalDex = await natRes.json();
  } catch (e) {
    console.error('資料載入失敗', e);
  }
  // 使用率資料為次要功能（聯防補洞建議）；載入失敗不影響核心，靜默退化。
  try {
    DATA.usageData = await (await fetch('./src/data/usage.json')).json();
  } catch { /* 無 usage.json → 聯防不顯示補洞建議 */ }
  render();
}
setRenderer(render);
init();
