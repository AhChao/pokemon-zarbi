// Kernel 控制器層：路由跳轉、GA 回報、主題切換、共享小工具。
// 位於相依 DAG 底層——只用瀏覽器全域，不 import 任何 view；view 反過來 import 這裡。
// render() 住在 app.js（facade，唯一 import views 處），透過 setRenderer 注入，避免 core→views 循環。

// 分享連結（帶成績碼）：給朋友開同一份題目。
export const shareUrlFor = (code) => `${location.origin}${location.pathname}?c=${code}`;

// 相對時間文字。
export function relTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── 主題切換（瀏覽器預設 / 亮色 / 暗色）──────────────────────────
// 自繪 SVG：亮＝空心點、暗＝實心點、瀏覽器預設＝地球。偏好存 localStorage，預設跟瀏覽器。
const THEME_KEY = 'poke-quest.theme';
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_SVG = {
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="currentColor"/></svg>',
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.6" ry="8.5"/><line x1="3.5" y1="12" x2="20.5" y2="12"/><line x1="5.2" y1="7" x2="18.8" y2="7"/><line x1="5.2" y1="17" x2="18.8" y2="17"/></g></svg>',
};
const THEME_LABEL = { system: '主題：瀏覽器預設', light: '主題：亮色', dark: '主題：暗色' };

function readThemePref() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
}
function systemPrefersDark() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyTheme(pref) {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
export function initTheme() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  let pref = readThemePref();
  const paint = () => { btn.innerHTML = THEME_SVG[pref]; btn.setAttribute('aria-label', THEME_LABEL[pref]); btn.title = THEME_LABEL[pref]; };
  applyTheme(pref); paint();
  btn.onclick = () => {
    pref = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
    try { localStorage.setItem(THEME_KEY, pref); } catch { /* 存不了就只在本次有效 */ }
    applyTheme(pref); paint();
  };
  // 「瀏覽器預設」時，系統亮/暗切換要即時跟著變。
  if (typeof matchMedia === 'function') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (pref === 'system') applyTheme('system'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
}

// 量測 sticky 標頭高度 → 設成 CSS 變數，讓頁內 sticky 區塊（如速度線表搜尋列）剛好接在它下面。
export function setTopbarVar() {
  const tb = document.querySelector('.topbar');
  if (tb) document.documentElement.style.setProperty('--topbar-h', `${tb.offsetHeight}px`);
}

// ── 路由跳轉 ─────────────────────────────────────────────────────
// render 由 facade 注入（setRenderer），避免 core 反向 import views。
let _renderer = () => {};
export function setRenderer(fn) { _renderer = fn; }
export function go(hash) {
  if (location.hash === hash) _renderer();
  else location.hash = hash;
}
// 原地重繪當前畫面（hash 不變、需要重建整頁時用，例如測驗換到下一題、大師模式破關畫面）。
export function rerender() { _renderer(); }

// ── GA 事件 / 虛擬 page_view ──────────────────────────────────────
// 事件回報（無回報端時靜默略過）。
export function gaEvent(name, params) {
  try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch { /* 略過 */ }
}
const SCREEN_TITLE = {
  '/': '分流首頁', '/q': '快問快答首頁', '/tools': '寶冠軍工具箱',
  '/setup': '準備', '/quiz': '測驗中', '/result': '成績',
  '/doku-setup': '數獨準備', '/doku': '數獨', '/master': '寶可夢大師', '/who-builder': '我是誰出題',
  '/chart': '相剋表', '/coverage': '聯防小工具', '/speedline': '速度線表', '/dex': '圖鑑', '/history': '歷史',
  '/challenge': '挑戰戰帖',
};
let gaLastPath = null;
// 送虛擬 page_view。把路由放進 page_location 的「真實路徑」（GA4 會砍掉 #fragment、也不認 page_path），
// 預設「網頁和畫面」報表才會逐畫面分開。forcePath 用於 hash 無法表達的畫面（如戰帖）。
export function gaPageView(forcePath) {
  const path = forcePath || ((location.hash || '#/').replace(/^#/, '') || '/');
  if (path === gaLastPath) return; // 同畫面重繪不重複送
  gaLastPath = path;
  const base = `${location.origin}${location.pathname}`.replace(/index\.html$/, '').replace(/\/$/, '');
  const page_location = path === '/' ? `${base}/` : `${base}${path}`;
  gaEvent('page_view', { page_title: SCREEN_TITLE[path] || path, page_location });
}
