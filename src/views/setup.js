// 準備畫面：選賽季/範圍/難度/題數/計分，顯示本局題目碼。
import { gaEvent, go, shareUrlFor } from '../core.js';
import { t } from '../i18n.js';
import { defaultSeason, defaultWhoPool, difficultyLabel, poolLabel, seasonKeys, seasonLabel, whoPoolKeys } from '../pool.js';
import { DEFAULT_QUESTION_COUNT, DEFAULT_SPEED_DIFFICULTY, DEFAULT_WHO_DIFFICULTY, MAX_QUESTION_COUNT, MIN_QUESTION_COUNT, SPEED_DIFFICULTIES, WHO_DIFFICULTIES, newSeed } from '../quiz.js';
import { scoreModesFor } from '../score.js';
import { encodeResult } from '../share.js';
import { state } from '../state.js';
import { clamp, el, esc, setView } from '../ui.js';
import { viewHome } from './home.js';
import { startMaster } from './master.js';
import { startQuiz } from './quiz.js';


// ── 準備畫面：選賽季 + 顯示本局題目碼（開局前就能分享一起測）──────
export function viewSetup() {
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
