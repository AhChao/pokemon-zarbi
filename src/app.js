// 瀏覽器端主程式：hash 路由 + 成績碼網址處理 + 各畫面渲染。
import { TYPES, TYPE_META, multiplier, formatMultiplier } from './data/typechart.js';
import { generateTypeQuiz, generateSpeedQuiz, generateWhoQuiz, whoAnswerCorrect, scoreQuiz, newSeed, DEFAULT_QUESTION_COUNT, SPEED_DIFFICULTIES, DEFAULT_SPEED_DIFFICULTY, WHO_DIFFICULTIES, DEFAULT_WHO_DIFFICULTY } from './quiz.js';
import { encodeResult, decodeResult } from './share.js';
import { getHistory, addHistory } from './history.js';
import { t, typeName } from './i18n.js';

const app = document.getElementById('app');

// ── 資料（離線產生的靜態檔，啟動時載入一次）──────────────────────
let pokedex = {};
let seasonsData = { seasons: {} };

// ── 小工具 ──────────────────────────────────────────────────────
const el = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const shareUrlFor = (code) => `${location.origin}${location.pathname}?c=${code}`;

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

// Mega / 特殊高 dex（>10000）→ 取本體國家圖鑑編號來判世代。
function baseDexOf(key, entry) {
  if (entry.dex < 10000) return entry.dex;
  const base = key.replace(/-mega.*$|-primal.*$|-gmax.*$/, '');
  return pokedex[base]?.dex ?? null;
}
function genKeyOf(key, entry) {
  const bd = baseDexOf(key, entry);
  if (bd == null) return null;
  return GENERATIONS.find((g) => bd >= g.min && bd <= g.max)?.key || null;
}

// 我是誰的可選範圍：有非 Mega 成員的世代 + 冠軍最新賽季。
function whoPoolKeys() {
  const gens = GENERATIONS
    .map((g) => g.key)
    .filter((gk) => Object.keys(pokedex).some((k) => !pokedex[k].mega && genKeyOf(k, pokedex[k]) === gk));
  return [...gens, defaultSeason()];
}
function defaultWhoPool() {
  return whoPoolKeys()[0] || defaultSeason();
}
// 由池鍵組出穩定排序的寶可夢池（賽季鍵走 seasonPool，世代鍵走全圖鑑篩選）。
function whoPool(poolKey) {
  if (seasonsData.seasons[poolKey]) return seasonPool(poolKey);
  return Object.keys(pokedex)
    .filter((k) => genKeyOf(k, pokedex[k]) === poolKey)
    .map((k) => ({ key: k, ...pokedex[k] }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
function poolLabel(poolKey) {
  const g = GENERATIONS.find((x) => x.key === poolKey);
  if (g) return `第${g.cn}世代（${g.region}）`;
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
      const pct = Math.round((rec.score / rec.total) * 100);
      const tone = pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad';
      const label = quizLabel(rec.mode || 'type', rec.season || '', rec.difficulty || 'all');
      const item = el(`
        <button class="hist-item" type="button">
          <span class="hist-score hist-score--${tone}">${rec.score}/${rec.total}</span>
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
  const season = mode === 'type' ? '' : setupState.season;
  const difficulty = mode === 'type' ? 'all' : setupState.difficulty;
  const seed = setupState.seed;

  const code = encodeResult({ mode, season, seed, total: DEFAULT_QUESTION_COUNT, score: 0, difficulty });
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
      <div class="pool-pick"></div>` : ''}
      ${mode === 'speed' || mode === 'who' ? `
      <p class="label">${esc(t('setup.difficulty'))}</p>
      <div class="difficulty-pick"></div>
      <p class="muted">${esc(t(noteKey))}</p>` : ''}

      ${mode === 'type' ? `
      <button class="btn btn--ghost" data-nav="chart" style="margin-top:14px">${esc(t('home.openChart'))}</button>` : ''}

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

  node.querySelector('[data-act="start"]').onclick = () => startQuiz({ mode, season, seed, difficulty });

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
function startQuiz({ mode = 'type', season = '', seed, difficulty = 'all', challenge = null }) {
  const total = challenge ? challenge.total : DEFAULT_QUESTION_COUNT;
  let quiz;
  try {
    quiz = buildQuiz({ mode, season, seed, total, difficulty });
  } catch (e) {
    console.error(e);
    return viewHome();
  }
  session = { quiz, answers: [], index: 0, locked: false, challenge, saved: false, meta: { mode, season, difficulty } };
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
      <div class="who-stage"><img class="who-img" alt="" /></div>
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

// 我是誰提示（以圈圈呈現字數）：easy 露第一個字、其餘 ○；normal 全 ○；hard 無提示。
function whoHint(q, difficulty) {
  const chars = Array.from(q.nameZh);
  if (difficulty === 'easy') {
    return chars.map((c, i) => (i === 0 ? `<strong>${esc(c)}</strong>` : '○')).join(' ');
  }
  if (difficulty === 'normal') {
    return chars.map(() => '○').join(' ');
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
function reviewItem(q, ok, userAnswer) {
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
  const item = el(`
    <div class="review__item">
      <span class="review__mark ${ok ? 'review__mark--ok' : 'review__mark--no'}">${ok ? '✓' : '✗'}</span>
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
  const score = scoreQuiz(quiz, answers);
  const total = quiz.count;
  const code = encodeResult({ mode: meta.mode, season: meta.season, seed: quiz.seed, total, score, difficulty });
  const shareUrl = shareUrlFor(code);

  let challengeHtml = '';
  if (opts.challenge) {
    const you = score, them = opts.challenge.score;
    let msg;
    if (you > them) msg = t('challenge.beat', { you, them });
    else if (you === them) msg = t('challenge.tie', { you });
    else msg = t('challenge.lose', { you, them });
    challengeHtml = `<div class="banner"><p style="font-weight:800;font-size:1.2rem">${esc(msg)}</p></div>`;
  }

  const title = opts.history ? '這次紀錄' : t('result.title');

  const node = el(`
    <section>
      ${challengeHtml}
      <div class="card">
        <h2>${esc(title)}</h2>
        <p class="score-sub" style="margin-bottom:4px">${esc(quizLabel(meta.mode, meta.season, difficulty))}</p>
        <div class="score-big">${score} / ${total}</div>
        <p class="score-sub">${esc(t('result.score', { score, total }))}</p>

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
    const ok = q.mode === 'who' ? whoAnswerCorrect(q, answers[i]) : answers[i] === q.correctIndex;
    reviewWrap.appendChild(reviewItem(q, ok, answers[i]));
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
    startQuiz({ mode: meta.mode, season: meta.season, seed: newSeed(), difficulty });

  return { node, score, total, code };
}

// ── 結果畫面（剛完成的測驗）────────────────────────────────────
function viewResult() {
  if (!session || session.answers.length < session.quiz.count) return viewHome();
  const { quiz, answers, challenge, meta } = session;
  const { node, score, total, code } = buildResultSection(quiz, answers, { challenge, meta });

  if (!session.saved) {
    addHistory({
      mode: meta.mode, season: meta.season, difficulty: meta.difficulty || 'all', seed: quiz.seed,
      total, score, answers: answers.slice(), code, ts: Date.now(),
    });
    session.saved = true;
  }

  setView(node);
}

// ── 歷史詳情畫面 ───────────────────────────────────────────────
function viewHistoryDetail() {
  const rec = viewingHistory;
  if (!rec) return viewHome();
  const meta = { mode: rec.mode || 'type', season: rec.season || '', difficulty: rec.difficulty || 'all' };
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
    : t('challenge.body', { score: decoded.score, total: decoded.total });
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
      challenge: coplay ? null : { total: decoded.total, score: decoded.score },
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
    const [dexRes, seasonsRes] = await Promise.all([
      fetch('./src/data/pokedex.json'),
      fetch('./src/data/seasons.json'),
    ]);
    pokedex = await dexRes.json();
    seasonsData = await seasonsRes.json();
  } catch (e) {
    console.error('資料載入失敗', e);
  }
  render();
}
init();
