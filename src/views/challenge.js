// 收到分享碼的戰帖畫面（各種模式）。
import { gaEvent, go } from '../core.js';
import { t } from '../i18n.js';
import { difficultyLabel, quizLabel } from '../pool.js';
import { fmtPct, pctOf } from '../score.js';
import { state } from '../state.js';
import { el, esc, setView } from '../ui.js';
import { startCustomWho } from './builder.js';
import { startQuiz } from './quiz.js';


// ── 挑戰邀請畫面（從成績碼連結 / 輸入代碼進來）─────────────────
export function viewChallenge(decoded) {
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
