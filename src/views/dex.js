// 圖鑑：縮圖牆 + 類別/屬性過濾 + 名字模糊搜尋。
import { TYPES, TYPE_META } from '../data/typechart.js';
import { t, typeName } from '../i18n.js';
import { poolLabel, seasonKeys, seasonLabel, whoPool } from '../pool.js';
import { normalizeName } from '../quiz.js';
import { DATA, state } from '../state.js';
import { el, esc, setView, typeIcon, uiIcon } from '../ui.js';


// ── 圖鑑（題庫預覽：縮圖牆 + 類別/屬性過濾）─────────────────────
export function dexCategories() {
  return state.dexState.group === 'gen' ? [...GENERATIONS.map((g) => g.key), 'hisui'] : seasonKeys();
}

export function dexCatLabel(key) {
  return state.dexState.group === 'gen' ? poolLabel(key) : seasonLabel(key);
}


export function viewDex() {
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
