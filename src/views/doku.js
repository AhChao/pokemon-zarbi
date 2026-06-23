// 寶可夢數獨：盤面、作答、挖坑出題、準備畫面。
import { gaEvent, go, shareUrlFor } from '../core.js';
import { PICK_RESULT_LIMIT, cellSatisfied, generateDoku } from '../doku.js';
import { t, typeName } from '../i18n.js';
import { newSeed, normalizeName } from '../quiz.js';
import { encodeDokuTrap, encodeResult } from '../share.js';
import { DATA, state } from '../state.js';
import { badge, el, esc, setView, uiIcon } from '../ui.js';


// ── 寶可夢數獨（PokeDoku-style 3×3 盤面）─────────────────────────
// 軸標籤：屬性用 type-badge，其餘（地區/純單屬性/Mega/名字字數）用文字 pill。
export function dokuTag(cat) {
  return cat.kind === 'type' ? badge(cat.value) : `<span class="doku-tag">${esc(cat.label)}</span>`;
}

// 搜尋彈窗標頭的條件文字（純文字，不放 badge）。
export function condText(cat) {
  return cat.kind === 'type' ? typeName(cat.value) : cat.label;
}


export function viewDoku() {
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
export function openDokuPicker(idx, onPicked, pit = null) {
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
export function cellEntries(idx) {
  const pz = state.dokuState.puzzle;
  const rowCat = pz.rows[Math.floor(idx / 3)], colCat = pz.cols[idx % 3];
  return Object.entries(DATA.nationalDex).map(([key, v]) => ({ key, ...v })).filter((p) => cellSatisfied(p, rowCat, colCat));
}


// 無提示作答彈窗：純文字輸入、不給候選清單；查無對應寶可夢時，格子顯示使用者打的字。
export function openDokuTextInput(idx, onPicked, pit = null) {
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
export function viewDokuSetup() {
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
