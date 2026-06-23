// 首頁：選測驗、輸入代碼、最近紀錄。
import { gaEvent, go, relTime } from '../core.js';
import { getHistory } from '../history.js';
import { t } from '../i18n.js';
import { defaultSeason, defaultWhoPool, quizLabel } from '../pool.js';
import { DEFAULT_SPEED_DIFFICULTY, DEFAULT_WHO_DIFFICULTY, newSeed } from '../quiz.js';
import { fmtPct, pctOf } from '../score.js';
import { decodeResult } from '../share.js';
import { DATA, state } from '../state.js';
import { el, esc, setView, uiIcon } from '../ui.js';
import { viewChallenge } from './challenge.js';


// 共享狀態與離線資料移到 state.js（state / DATA holder）。






// ── 首頁：選測驗 + 輸入代碼 + 最近紀錄 ──────────────────────────
export function viewHome() {
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
      item.onclick = () => { state.viewingHistory = rec; go('#/history'); };
      histWrap.appendChild(item);
    });
  }

  setView(node);
}
