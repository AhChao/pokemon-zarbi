// 速度線表（Lv50 實數），含欄首 tooltip。
import { go } from '../core.js';
import { t } from '../i18n.js';
import { defaultSeason, seasonKeys, seasonLabel, seasonPool } from '../pool.js';
import { DEFAULT_SPEED_DIFFICULTY, newSeed, normalizeName, speedLines } from '../quiz.js';
import { SPD_PERROW_KEY, state } from '../state.js';
import { appEl, el, esc, setView, uiIcon } from '../ui.js';


// ── 共用浮動提示（速度線表欄首說明）─────────────────────────────
// 參考 ui collection 的 hover-tooltip：單一 bubble 掛在 <body>，避開表格 overflow 裁切；
// 桌機（可 hover、精準指標）hover/focus 顯示並在欄首附 info icon；觸控裝置點擊切換、不顯 icon 省空間。
export const CAN_HOVER = typeof matchMedia === 'function'
  ? matchMedia('(hover: hover) and (pointer: fine)').matches : true;

export let _tipEl = null, _tipArrow = null, _tipBody = null, _tipActive = null;

export function ensureTip() {
  if (_tipEl) return;
  _tipEl = document.createElement('div');
  _tipEl.className = 'ui-tip';
  _tipEl.id = 'ui-tip-shared';
  _tipEl.setAttribute('role', 'tooltip');
  _tipArrow = document.createElement('div'); _tipArrow.className = 'ui-tip__arrow';
  _tipBody = document.createElement('div'); _tipBody.className = 'ui-tip__body';
  _tipEl.append(_tipArrow, _tipBody);
  document.body.appendChild(_tipEl);
  // 捲動 / 點空白處收起（觸控模式靠它關閉）
  window.addEventListener('scroll', hideTip, { passive: true, capture: true });
  document.addEventListener('click', (e) => {
    if (_tipActive && !e.target.closest('[data-coltip]')) hideTip();
  });
}

export function positionTip(rect) {
  const tw = _tipEl.offsetWidth, th = _tipEl.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight, margin = 10, gap = 8;
  let left = rect.left + rect.width / 2 - tw / 2;   // 置中於欄首
  if (left + tw > vw - margin) left = vw - tw - margin;
  if (left < margin) left = margin;
  let top = rect.bottom + gap, above = false;
  if (top + th > vh - margin) { top = rect.top - th - gap; above = true; } // 下方超出 → 翻到上方
  _tipEl.classList.toggle('is-above', above);
  _tipEl.style.left = `${Math.round(left)}px`;
  _tipEl.style.top = `${Math.round(top)}px`;
  const center = rect.left + rect.width / 2 - left;  // 箭頭仍指向欄首中心
  _tipArrow.style.left = `${Math.round(Math.max(12, Math.min(center, tw - 12)))}px`;
}

export function showTip(trigger, text) {
  ensureTip();
  _tipBody.textContent = text;
  _tipEl.classList.add('is-visible');
  _tipActive = trigger;
  positionTip(trigger.getBoundingClientRect());
}

export function hideTip() { if (_tipEl) _tipEl.classList.remove('is-visible'); _tipActive = null; }

export function attachColTip(thEl, text) {
  if (!text) return;
  thEl.setAttribute('aria-describedby', 'ui-tip-shared');
  thEl.tabIndex = 0;
  if (CAN_HOVER) {
    thEl.addEventListener('mouseenter', () => showTip(thEl, text));
    thEl.addEventListener('mouseleave', hideTip);
    thEl.addEventListener('focus', () => showTip(thEl, text));
    thEl.addEventListener('blur', hideTip);
  } else {
    thEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_tipActive === thEl) hideTip(); else showTip(thEl, text);
    });
  }
}


// 同速排一列；每欄為該種族值在 Lv50 的實數值換算。
export function buildSpeedTable(season, perRow = 10) {
  const pool = seasonPool(season);
  // 容器寬度＝恰好 perRow 隻立繪（32px + 2px gap），第 perRow+1 隻自動換行。
  const wrapW = perRow * 32 + (perRow - 1) * 2 + 2;
  const bySpeed = new Map();
  for (const p of pool) {
    if (!bySpeed.has(p.speed)) bySpeed.set(p.speed, []);
    bySpeed.get(p.speed).push(p);
  }
  const speeds = [...bySpeed.keys()].sort((a, b) => b - a);

  // 每欄：[key, 標籤, 欄首說明]。說明在桌機 hover、手機點擊欄首時浮現。
  // 定義採《冠軍》制度：能力點數（取代努力值，單項上限 32、直接加實數值），個體值固定最大。
  const cols = [
    ['max', '最速', '速度能力點數 32（滿）＋加速性格（×1.1）。「最速」＝速度衝到最高。'],
    ['neu', '準速', '速度能力點數 32（滿）、性格無修正。「準速」＝差最速一階，沒吃性格的 ×1.1。'],
    ['noInv', '無振', '速度能力點數 0、性格無修正。「無振」源自日文「振り（分配點數）」，無振＝完全不投速度。'],
    ['neg', '減速', '速度能力點數 0＋減速性格（×0.9）。'],
    ['scarfMax', '圍巾·最速', '最速再 ×1.5（講究圍巾）。'],
    ['scarfNeu', '圍巾·準速', '準速再 ×1.5（講究圍巾）。'],
    ['twMax', '順風·最速', '最速再 ×2（順風）。'],
    ['twNeu', '順風·準速', '準速再 ×2（順風）。'],
    ['twNoInv', '順風·無振', '無振再 ×2（順風）。'],
  ];

  // 種族值第一欄；立繪第二欄加寬（同速一整排不換行）；其後接各速度線。
  // 欄首包成 .spd-th，桌機再附 info icon（觸控不顯、省空間）；說明文字存在 data-coltip。
  const tipIcon = CAN_HOVER ? `<span class="spd-th__i">${uiIcon('info')}</span>` : '';
  const thCell = (cls, label, tip) =>
    `<th class="${cls}" data-coltip="${esc(tip)}"><span class="spd-th">${esc(label)}${tipIcon}</span></th>`;
  let head = '<tr>'
    + thCell('spd-base', '種族', '速度種族值，是換算各速度線的基準')
    + thCell('spd-mons', '寶可夢', '擁有此速度種族值的寶可夢，同速排成一列')
    + cols.map(([, label, tip]) => thCell('', label, tip)).join('')
    + '</tr>';

  let rows = '';
  for (const spe of speeds) {
    const ln = speedLines(spe);
    const mons = bySpeed.get(spe)
      .slice()
      .sort((a, b) => (a.nameZh < b.nameZh ? -1 : a.nameZh > b.nameZh ? 1 : 0))
      .map((p) => `<img class="spd-img" src="${esc(p.image)}" alt="${esc(p.nameZh)}" title="${esc(p.nameZh)}" loading="lazy" />`)
      .join('');
    rows += `<tr data-spe="${spe}"><th class="spd-base">${spe}</th><td class="spd-mons"><div class="spd-mons-wrap" style="width:${wrapW}px">${mons}</div></td>`;
    for (const [k] of cols) rows += `<td>${ln[k]}</td>`;
    rows += '</tr>';
  }
  const table = el(`<table class="chart spd">${head}${rows}</table>`);
  table.querySelectorAll('.spd-img').forEach((im) => { im.onerror = () => { im.style.visibility = 'hidden'; }; });
  table.querySelectorAll('th[data-coltip]').forEach((th) => attachColTip(th, th.getAttribute('data-coltip')));
  return table;
}


// ── 速度線表（種族值 → Lv50 實數值，依賽季）─────────────────────
export function viewSpeedChart() {
  appEl.classList.add('app--wide'); // 大螢幕放寬版面，寬表格更好讀
  // 入口只在「誰比較快」的 setup；直接帶網址進來時補一個預設賽季狀態。
  if (!state.setupState || state.setupState.mode !== 'speed') {
    state.setupState = { mode: 'speed', season: defaultSeason(), difficulty: DEFAULT_SPEED_DIFFICULTY, seed: newSeed() };
  }
  const season = state.setupState.season;

  const node = el(`
    <section>
      <div class="card">
        <div class="spd-head">
          <h2>${esc(t('speedline.title'))}</h2>
          <p class="muted">${esc(t('speedline.hint'))}</p>
          <div class="season-pick" data-seasons></div>
          <div class="code-box spd-search">
            <input type="text" inputmode="text" autocomplete="off" spellcheck="false"
                   placeholder="${esc(t('speedline.search'))}" aria-label="${esc(t('speedline.searchBtn'))}" data-spd-search />
            <button class="btn btn--accent" data-act="spd-go" aria-label="${esc(t('speedline.searchBtn'))}">${uiIcon('search')}</button>
          </div>
          <p class="feedback feedback--bad spd-search__msg" data-spd-msg hidden></p>
          <div class="spd-perrow">
            <span class="spd-perrow-label">${esc(t('speedline.perRow'))}</span>
            <button class="season-btn" data-perrow="5" aria-pressed="${state.spdPerRow === 5}">${esc(t('speedline.perRowUnit', { n: 5 }))}</button>
            <button class="season-btn" data-perrow="10" aria-pressed="${state.spdPerRow === 10}">${esc(t('speedline.perRowUnit', { n: 10 }))}</button>
          </div>
        </div>
        <div class="table-wrap" data-table></div>
        <div class="muted spd-legend">
          <p class="spd-legend__line"><b>投資</b>：最速＝速度能力點數 32（滿）＋加速性格 ×1.1；準速＝點數 32、無性格修正；無振＝點數 0；減速＝點數 0＋減速性格 ×0.9。</p>
          <p class="spd-legend__line"><b>道具・場地</b>：圍巾（講究圍巾）×1.5；順風 ×2。</p>
          <p class="spd-legend__line"><b>《冠軍》與舊世代差異</b>：舊作的「努力值」（單項最多 252、合計 510、每 4 點 +1）與「個體值」，在《冠軍》改成「能力點數」——每隻固定 66 點、單項上限 32，直接加進 Lv50 實數值（每點 +1），個體值一律視為最大（31）。Lv50 下 32 點的效果剛好等於舊作 252 努力值、0 點等於 0 努力，故本表數字兩制相同。</p>
          <p class="spd-legend__line"><b>日文詞源</b>：「最速」速度拉到最高；「準速」準＝次一階，滿投但不靠性格 ×1.1；「無振」振り＝分配點數，無振＝完全不投。</p>
        </div>
        <button class="btn btn--ghost" data-nav="back">${esc(t('common.back'))}</button>
      </div>
      <button class="spd-top" data-act="spd-top" aria-label="${esc(t('speedline.toTop'))}">${uiIcon('up')}</button>
    </section>`);

  const seasonWrap = node.querySelector('[data-seasons]');
  seasonKeys().forEach((key) => {
    const b = el(`<button class="season-btn" aria-pressed="${season === key}">${esc(seasonLabel(key))}</button>`);
    b.onclick = () => { state.setupState.season = key; viewSpeedChart(); };
    seasonWrap.appendChild(b);
  });

  node.querySelector('[data-table]').appendChild(buildSpeedTable(season, state.spdPerRow));

  node.querySelectorAll('[data-perrow]').forEach((b) => {
    b.onclick = () => {
      state.spdPerRow = Number(b.dataset.perrow) === 5 ? 5 : 10;
      try { localStorage.setItem(SPD_PERROW_KEY, String(state.spdPerRow)); } catch { /* 存不了就只在本次有效 */ }
      viewSpeedChart();
    };
  });

  // 模糊搜尋：子序列比對抓出所有符合者，按搜尋逐一切下一個、到底循環回第一個。
  const pool = seasonPool(season);
  const input = node.querySelector('[data-spd-search]');
  const msg = node.querySelector('[data-spd-msg]');
  let lastQ = '', matchIdx = -1;
  const doSearch = () => {
    const q = normalizeName(input.value);
    if (!q) return;
    const qa = Array.from(q);
    // 子序列：查詢字依序出現即可、中間可跳字（「阿九尾」→ 阿羅拉九尾）。
    const subseq = (n) => {
      let i = 0;
      for (const ch of Array.from(n)) { if (ch === qa[i] && ++i === qa.length) return true; }
      return false;
    };
    // 所有符合者，依表格顯示順序（速度高→低、同速依中文名）排序。
    const matches = pool
      .filter((p) => subseq(normalizeName(p.nameZh)) || subseq(normalizeName(p.nameEn)))
      .sort((a, b) => b.speed - a.speed || (a.nameZh < b.nameZh ? -1 : a.nameZh > b.nameZh ? 1 : 0));
    if (!matches.length) {
      msg.textContent = t('speedline.noMatch');
      msg.classList.add('feedback--bad'); msg.classList.remove('spd-search__msg--info');
      msg.hidden = false;
      return;
    }
    // 同一查詢：往下一個切、到底循環；換查詢：回第一個。
    if (q === lastQ) matchIdx = (matchIdx + 1) % matches.length;
    else { lastQ = q; matchIdx = 0; }
    const target = matches[matchIdx];

    if (matches.length > 1) {
      msg.textContent = t('speedline.matchNth', { i: matchIdx + 1, n: matches.length });
      msg.classList.remove('feedback--bad'); msg.classList.add('spd-search__msg--info');
      msg.hidden = false;
    } else { msg.hidden = true; }

    const row = node.querySelector(`tr[data-spe="${target.speed}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('row-hl');
    void row.offsetWidth; // 強制 reflow，讓動畫可重複觸發
    row.classList.add('row-hl');
    row.addEventListener('animationend', () => row.classList.remove('row-hl'), { once: true });
    // 同速多隻時，標出目前這一隻立繪。
    node.querySelectorAll('.spd-img--hl').forEach((im) => im.classList.remove('spd-img--hl'));
    const im = [...row.querySelectorAll('.spd-img')].find((x) => x.alt === target.nameZh);
    if (im) im.classList.add('spd-img--hl');
  };
  node.querySelector('[data-act="spd-go"]').onclick = doSearch;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  input.addEventListener('input', () => { msg.hidden = true; });
  node.querySelector('[data-act="spd-top"]').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  setView(node);
}
