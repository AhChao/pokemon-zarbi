// 成績畫面與逐題檢討（buildResultSection 共用）。
import { gaEvent, shareUrlFor } from '../core.js';
import { formatMultiplier } from '../data/typechart.js';
import { addHistory } from '../history.js';
import { t } from '../i18n.js';
import { buildQuiz, quizLabel } from '../pool.js';
import { newSeed, scoreQuiz, whoAnswerCorrect, whoCharScore } from '../quiz.js';
import { charPct, fmtPct, pctOf } from '../score.js';
import { encodeResult } from '../share.js';
import { state } from '../state.js';
import { badge, el, esc, setView } from '../ui.js';
import { viewHome } from './home.js';
import { startQuiz } from './quiz.js';


// ── 結果區塊（測驗完成頁與歷史詳情頁共用）──────────────────────
export function reviewItem(q, ok, userAnswer, mark) {
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


export function buildResultSection(quiz, answers, opts = {}) {
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
export function viewResult() {
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
export function viewHistoryDetail() {
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
