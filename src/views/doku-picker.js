// 寶可夢數獨：填格用的搜尋彈窗（提示清單）與純打字輸入，含候選計算 cellEntries。
import { PICK_RESULT_LIMIT, cellSatisfied } from '../doku.js';
import { t, typeName } from '../i18n.js';
import { normalizeName } from '../quiz.js';
import { DATA, state } from '../state.js';
import { el, esc, uiIcon } from '../ui.js';

// 搜尋彈窗標頭的條件文字（純文字，不放 badge）。
function condText(cat) {
  return cat.kind === 'type' ? typeName(cat.value) : cat.label;
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
