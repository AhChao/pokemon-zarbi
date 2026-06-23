// 寶可夢大師模式（本機走完整個池）。
import { gaEvent, go, rerender } from '../core.js';
import { TYPES } from '../data/typechart.js';
import { t, typeName } from '../i18n.js';
import { getMaster, masterAvailable, pushWrong, resetMaster, saveMaster } from '../master.js';
import { poolLabel, whoPool } from '../pool.js';
import { whoAnswerCorrect, whoCharScore } from '../quiz.js';
import { state } from '../state.js';
import { badge, el, esc, frameFill, keepInputVisible, loadWhoImage, pokeballSvg, prefetchImages, setView } from '../ui.js';
import { viewHome } from './home.js';
import { answer } from './quiz.js';
import { whoHint } from '../who.js';


// ── 寶可夢大師模式（本機）：走完整個池、每隻答對前都會再出現、全對即成為大師 ──
// 今天的日期鍵（征服天數用）。
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


export function startMaster(poolKey, difficulty) {
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


export function nextMaster() {
  if (!state.masterState) return;
  state.masterState.locked = false;
  const key = state.masterState.queue.shift();
  if (!key) { state.masterState.current = null; return; }
  const p = state.masterState.byKey.get(key);
  state.masterState.current = { key: p.key, mode: 'who', nameZh: p.nameZh, nameEn: p.nameEn, image: p.image, mega: !!p.mega, dex: p.dex };
  // 背景預載接下來幾隻的立繪（池可能很大 → 用滑動視窗，不一次全抓）。
  prefetchImages([p.image, ...state.masterState.queue.slice(0, 10).map((k) => state.masterState.byKey.get(k)?.image)].filter(Boolean));
}


export function viewMaster() {
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
export function repaintMaster(node) {
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


export function answerMaster(typed, node) {
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
  next.onclick = () => { nextMaster(); if (!state.masterState.current) rerender(); else repaintMaster(node); };
  next.focus();
}


// 稱號：依失誤數對池大小的比例分級。
export function masterTitle(mistakes, total) {
  if (mistakes === 0) return t('master.title.perfect');
  if (mistakes <= total * 0.1) return t('master.title.elite');
  if (mistakes <= total * 0.3) return t('master.title.official');
  return t('master.title.rookie');
}


// 由本機紀錄＋池資料算出完成頁要秀的 fun fact。
export function computeMasterFacts(ms) {
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


export function viewMasterDone() {
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
