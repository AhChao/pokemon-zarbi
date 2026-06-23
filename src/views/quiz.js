// 測驗進行：題型/速度/我是誰作答與計分流程（startQuiz 起一局）。
import { gaEvent, go, rerender } from '../core.js';
import { formatMultiplier } from '../data/typechart.js';
import { t } from '../i18n.js';
import { buildQuiz } from '../pool.js';
import { DEFAULT_QUESTION_COUNT, MAX_QUESTION_COUNT, MIN_QUESTION_COUNT, whoAnswerCorrect } from '../quiz.js';
import { state } from '../state.js';
import { badge, clamp, el, esc, frameFill, keepInputVisible, loadWhoImage, pokeballSvg, prefetchImages, setView, uiIcon } from '../ui.js';
import { viewHome } from './home.js';
import { whoHint } from '../who.js';


// ── 開始測驗 ────────────────────────────────────────────────────
export function startQuiz({ mode = 'type', season = '', seed, difficulty = 'all', count = DEFAULT_QUESTION_COUNT, scoreMode = 'count', challenge = null }) {
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
export function pokeOption(p, i) {
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


export function viewQuiz() {
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



// 我是誰：原地換到下一題（不重建整頁、不捲到頂），避免換題時的大跳動與鍵盤抖動。
export function repaintWho(node) {
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
export function answerWho(typed, node) {
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


export function answer(choice, node) {
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
    rerender();
  };
  next.focus();
}
