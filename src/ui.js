// 無狀態的呈現／DOM helper：建立節點、跳脫、屬性 icon、SVG 圖示、立繪載入與預載。
// 不持有任何測驗/資料模組狀態（只吃參數與 typechart/i18n 的純查詢），可被任一 view 重用。
import { TYPE_META } from './data/typechart.js';
import { typeName } from './i18n.js';

// 由 HTML 字串建出第一個元素節點。
export const el = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
};

// HTML 文字跳脫。
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 屬性 icon（本地 vendor 的白色字符 SVG）。
export function typeIcon(typeKey) {
  return `<img class="type-icon" src="./assets/types/${typeKey}.svg" alt="" aria-hidden="true" />`;
}

// UI 圖示一律用 SVG（本 repo 禁用 emoji）。inline 以便 currentColor 跟著文字色。
const UI_ICONS = {
  bolt: '<path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z"/>',
  shield: '<path fill="currentColor" d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4z"/>',
  swords: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 4 6V3h3l11.5 10.5M13 19l3 3M16 16l4 4M19 21l2-2M18.5 3H21v3L9.5 17.5M11 13l-2 2M5 21l4-4"/></g>',
  who: '<path fill="currentColor" d="M12 2a6 6 0 0 1 6 6c0 2.6-1.7 4-3.1 5.1-1 .8-1.4 1.3-1.4 2.4v.5h-3v-.7c0-2.1.9-3.1 2.3-4.2C14 10.3 15 9.7 15 8a3 3 0 0 0-6 0H6a6 6 0 0 1 6-6Z"/><circle cx="12" cy="20.2" r="1.8" fill="currentColor"/>',
  search: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></g>',
  up: '<path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>',
  grid: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></g>',
  close: '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/><path fill="currentColor" d="M11 10.6h2v6.4h-2z"/>',
  eye: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></g>',
  eyeOff: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7c1.7 0 3.2.5 4.5 1.2M22 12s-3.6 7-10 7c-1.7 0-3.2-.5-4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><line x1="3" y1="3" x2="21" y2="21"/></g>',
};
export function uiIcon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${UI_ICONS[name]}</svg>`;
}

// 精靈球 SVG（多色，非 currentColor）：用於「我是誰」電視動畫風格球框四角。
export function pokeballSvg() {
  return `<svg class="pokeball-svg" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#fff" stroke="#222" stroke-width="1.4"/>
    <path d="M1.2 12a10.8 10.8 0 0 1 21.6 0Z" fill="#e3350d"/>
    <line x1="1.2" y1="12" x2="22.8" y2="12" stroke="#222" stroke-width="1.8"/>
    <circle cx="12" cy="12" r="3.4" fill="#fff" stroke="#222" stroke-width="1.6"/>
    <circle cx="12" cy="12" r="1.4" fill="#fff" stroke="#222" stroke-width="1"/>
  </svg>`;
}

// Zarbi（未知圖騰 Unown）品牌標誌：沿用 topbar 同款，改用 currentColor 跟主題。
// maskId 需唯一，避免與 topbar 既有 <mask id="brand-eye"> 撞 id 導致遮罩失效。
export function unownLogo(maskId = 'unown-mother') {
  return `<svg viewBox="0 0 400 400" aria-hidden="true"><defs><mask id="${maskId}"><rect width="400" height="400" fill="#fff"/><circle cx="200" cy="160" r="50" fill="#000"/></mask></defs><g stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M 50,170 A 150,150 0 0,0 350,170"/><line x1="130" y1="230" x2="105" y2="255"/><line x1="200" y1="240" x2="200" y2="320"/><line x1="270" y1="230" x2="295" y2="255"/><line x1="200" y1="70" x2="200" y2="50"/></g><circle cx="200" cy="160" r="80" fill="currentColor" mask="url(#${maskId})"/><path d="M 175,135 C 175,110 225,110 225,135 C 225,155 200,160 200,175" stroke="currentColor" stroke-width="12" stroke-linecap="round" fill="none"/><circle cx="200" cy="195" r="7" fill="currentColor"/></svg>`;
}

// 「我是誰」球框內底色：由 seed＋題序決定（可分享 → 兩端同色），剪影是黑的故選中亮度底色。
const FRAME_COLORS = ['#9ed8a6', '#9ec9e8', '#e8c79e', '#d8a6cf', '#c0d89e', '#e89e9e', '#9ed8cf', '#c9b0e8', '#e8d99e', '#a6b8d8'];
export function frameFill(seedStr, idx) {
  let h = 0;
  for (const c of `${seedStr}:${idx}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FRAME_COLORS[h % FRAME_COLORS.length];
}

export function badge(typeKey, big = false) {
  const m = TYPE_META[typeKey];
  return `<span class="type-badge${big ? ' type-badge--lg' : ''}" style="background:${m.color}">${typeIcon(typeKey)}${esc(typeName(typeKey))}</span>`;
}

// 主畫面容器（#app）。在 module 載入時取得；index.html 的 module script 在 body 末端，元素已存在。
export const appEl = document.getElementById('app');

export function setView(node) {
  appEl.innerHTML = '';
  appEl.appendChild(node);
  window.scrollTo(0, 0);
}

// 手機：輸入框聚焦（軟鍵盤彈出）後，只在「輸入框真的被鍵盤蓋到」時補捲剛好露出它的量，
// 絕不大幅拉動視窗（搭配 viewport interactive-widget=overlays-content，鍵盤只覆蓋、不擠壓版面）。
export function keepInputVisible(input) {
  if (!input) return;
  input.addEventListener('focus', () => setTimeout(() => {
    try {
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const over = input.getBoundingClientRect().bottom - (visibleBottom - 8);
      if (over > 0) window.scrollBy({ top: over, behavior: 'smooth' }); // 只補被蓋住的那一點，讓鍵盤上緣切齊輸入框下緣
    } catch { /* 略過 */ }
  }, 280));
}

// 載入題目立繪：載入期間框內轉圈、禁止輸入、隱藏舊圖與提示，直到圖片載好（或失敗）才解鎖並聚焦，
// 避免「上面黑影還沒換、下面提示文字已換」對不上（提示是純文字會瞬間出現）。
export function loadWhoImage(node, q, hint, opts = {}) {
  const body = node.querySelector('[data-qbody]');
  const img = body.querySelector('.who-img');
  const input = body.querySelector('[data-who-input]');
  const hintEl = body.querySelector('.who-hint');
  if (hintEl) hintEl.innerHTML = hint || '';
  body.classList.add('who-loading');
  if (input) input.disabled = true;
  let settled = false;
  const finish = (ok) => {
    if (settled) return;
    settled = true;
    img.style.visibility = ok ? '' : 'hidden';
    body.classList.remove('who-loading');
    if (input) { input.disabled = false; if (opts.focus) input.focus(); }
  };
  img.onload = () => finish(true);
  img.onerror = () => finish(false);
  img.src = q.image;
  if (img.complete) finish(img.naturalWidth > 0); // 已在快取：立即完成
}

// 背景靜默預載立繪：作答當下就把後續題目的圖片偷偷下載進快取，換題時即取即顯、免轉圈等待。
// 前端外觀完全不變（new Image() 不進 DOM），只是觸發瀏覽器下載。
const prefetchedImgs = new Set();
const prefetchKeep = []; // 保留 Image 參考，避免下載中被 GC
export function prefetchImages(urls) {
  for (const u of urls) {
    if (!u || prefetchedImgs.has(u)) continue;
    prefetchedImgs.add(u);
    const im = new Image();
    im.decoding = 'async';
    im.src = u;
    prefetchKeep.push(im);
    if (prefetchKeep.length > 80) prefetchKeep.shift();
  }
}
