// 瀏覽器端主程式（facade/kernel）：hash 路由 + 成績碼網址處理 + 分流外殼，畫面實作在 views/*。
import { decodeResult } from './share.js';
import { state, DATA } from './state.js';
import { initTheme, setTopbarVar, setRenderer, go, gaEvent, gaPageView } from './core.js';
import { t } from './i18n.js';
import { el, esc, uiIcon, unownLogo, setView, appEl } from './ui.js';
import { viewHome } from './views/home.js';
import { viewSetup } from './views/setup.js';
import { viewQuiz } from './views/quiz.js';
import { viewMaster } from './views/master.js';
import { viewWhoBuilder } from './views/builder.js';
import { viewResult, viewHistoryDetail } from './views/result.js';
import { viewChallenge } from './views/challenge.js';
import { viewChart } from './views/chart.js';
import { viewCoverage } from './views/coverage.js';
import { viewSpeedChart } from './views/speedline.js';
import { viewDex } from './views/dex.js';
import { viewDoku, viewDokuSetup } from './views/doku.js';

// ── 路由 ────────────────────────────────────────────────────────
// ── 分流外殼：母頁（Zarbi）/ 快問快答 / 寶冠軍工具箱 ───────────────
// 純加法的最外層分流：母頁兩個入口、工具箱集中既有工具頁的入口（不重做工具本身）。
// 三個 section 各有首頁；左上品牌名與返回行為依當前 section 決定。
// 接縫提示：此區塊（常數 + sectionOf + paintBrand + viewMother/viewTools）日後可整段抽成 nav.js。
const ROUTE_QUIZ_HOME = '#/q';
const ROUTE_TOOLS_HOME = '#/tools';
const TOOL_ROUTES = new Set(['#/chart', '#/coverage', '#/speedline', '#/dex']);
const SECTION_HOME = { mother: '#/', quiz: ROUTE_QUIZ_HOME, tools: ROUTE_TOOLS_HOME };
const BRAND_NAME = { mother: 'Zarbi', quiz: '寶可夢快問快答', tools: '寶冠軍工具箱' };

function sectionOf(hash) {
  if (!hash || hash === '#/') return 'mother';
  if (hash === ROUTE_TOOLS_HOME || TOOL_ROUTES.has(hash)) return 'tools';
  return 'quiz'; // setup/quiz/result/history/doku*/master/who-builder/#/q
}

// 工具頁返回「來源」：點進工具前記下當下的 hash（從 setup 進＝回 setup，從工具箱進＝回工具箱）。
let toolReferrer = ROUTE_TOOLS_HOME;

// 依當前 section 更新左上品牌名（母頁 Zarbi、快問快答內頁、工具箱內頁各自名）。
function paintBrand() {
  const nameEl = document.querySelector('.brand__name');
  if (nameEl) nameEl.textContent = BRAND_NAME[sectionOf(location.hash)];
}

// 母頁：最外層分流，左工具箱、右快問快答。
function viewMother() {
  const node = el(`
    <section class="mother">
      <div class="mother-brand">
        <span class="mother-logo">${unownLogo()}</span>
        <h1>Zarbi</h1>
      </div>
      <p class="lead">選一個入口開始。</p>
      <div class="mother-grid">
        <button class="mother-card" data-nav="tools">
          <span class="mother-card__icon">${uiIcon('search')}</span>
          <span class="mother-card__title">寶冠軍工具箱</span>
          <span class="mother-card__desc">相剋表、聯防小工具、速度線表、圖鑑</span>
        </button>
        <button class="mother-card" data-nav="q">
          <span class="mother-card__icon">${uiIcon('who')}</span>
          <span class="mother-card__title">寶可夢快問快答</span>
          <span class="mother-card__desc">屬性相剋、速度、我是誰、數獨等隨機測驗</span>
        </button>
      </div>
    </section>`);
  setView(node);
}

// 寶冠軍工具箱：集中入口，連到既有工具頁（複製入口即可，不動工具本身）。
function viewTools() {
  const tools = [
    { nav: 'chart', icon: 'shield', title: t('chart.title'), desc: '查任意攻防屬性的傷害倍率，附完整相剋表' },
    { nav: 'coverage', icon: 'swords', title: t('chart.tool.title'), desc: '把屬性或隊伍當整體，評估攻守覆蓋與漏洞' },
    { nav: 'speedline', icon: 'bolt', title: t('speedline.title'), desc: '依賽季列出各速度種族值在 50 級的實數值' },
    { nav: 'dex', icon: 'search', title: t('dex.title'), desc: '依世代／賽制瀏覽寶可夢立繪與名字' },
  ];
  const node = el(`
    <section class="card">
      <h1>寶冠軍工具箱</h1>
      <p class="lead">查表與分析小工具，不計分、隨時用。</p>
      ${tools.map((x) => `
        <button class="quiz-card" data-nav="${x.nav}">
          <span class="quiz-card__emoji" aria-hidden="true">${uiIcon(x.icon)}</span>
          <span class="quiz-card__text">
            <span class="quiz-card__title">${esc(x.title)}</span>
            <span class="quiz-card__desc">${esc(x.desc)}</span>
          </span>
          <span class="hist-chevron" aria-hidden="true">›</span>
        </button>`).join('')}
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);
  setView(node);
}

function render() {
  paintBrand(); // 任何畫面（含 ?c= 戰帖早返回）都先校正左上品牌名
  appEl.classList.remove('app--wide'); // 預設窄版；需要寬版的頁面（速度線表）自行加回
  const params = new URLSearchParams(location.search);
  const code = params.get('c');
  const hash = location.hash;

  // 帶成績碼進站且尚未開始挑戰 → 顯示戰帖。消費掉 ?c= 避免站內導覽重複攔截。
  if (code && !state.session && hash !== '#/quiz' && hash !== '#/result') {
    const decoded = decodeResult(code);
    history.replaceState(null, '', location.pathname + (hash || '#/'));
    if (decoded) { gaPageView('/challenge'); gaEvent('challenge_view', { kind: decoded.mode }); return viewChallenge(decoded); }
  }

  gaPageView();

  switch (hash) {
    case '#/q': return viewHome();
    case '#/tools': return viewTools();
    case '#/setup': return viewSetup();
    case '#/quiz': return viewQuiz();
    case '#/result': return viewResult();
    case '#/history': return viewHistoryDetail();
    case '#/chart': return viewChart();
    case '#/coverage': return viewCoverage();
    case '#/speedline': return viewSpeedChart();
    case '#/dex': return viewDex();
    case '#/doku-setup': return viewDokuSetup();
    case '#/doku': return viewDoku();
    case '#/master': return viewMaster();
    case '#/who-builder': return viewWhoBuilder();
    default: return viewMother();
  }
}

// 導覽
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (!nav) return;
  const dest = nav.dataset.nav;
  if (dest === 'home') {
    // 回當前 section 首頁；已在 section 首頁則再上一層回母頁。重設進行中狀態。
    state.session = null; state.setupState = null; state.dokuState = null; state.dokuSetup = null; state.masterState = null; state.builderState = null;
    const home = SECTION_HOME[sectionOf(location.hash)];
    go(location.hash === home ? '#/' : home);
  } else if (dest === 'back') {
    // 工具頁返回來源（不重設狀態，保留 setup 等進行中內容）。
    go(toolReferrer || ROUTE_TOOLS_HOME);
  } else {
    const target = '#/' + dest;
    if (TOOL_ROUTES.has(target)) toolReferrer = location.hash || '#/'; // 記下從哪進工具，供「返回」回到來源
    go(target);
  }
});

window.addEventListener('hashchange', render);

// ── 啟動：載入靜態資料後首次渲染 ───────────────────────────────
async function init() {
  initTheme();
  setTopbarVar();
  window.addEventListener('resize', setTopbarVar);
  try {
    const [dexRes, seasonsRes, natRes] = await Promise.all([
      fetch('./src/data/pokedex.json'),
      fetch('./src/data/seasons.json'),
      fetch('./src/data/dex-national.json'),
    ]);
    DATA.pokedex = await dexRes.json();
    DATA.seasonsData = await seasonsRes.json();
    DATA.nationalDex = await natRes.json();
  } catch (e) {
    console.error('資料載入失敗', e);
  }
  // 使用率資料為次要功能（聯防補洞建議）；載入失敗不影響核心，靜默退化。
  try {
    DATA.usageData = await (await fetch('./src/data/usage.json')).json();
  } catch { /* 無 usage.json → 聯防不顯示補洞建議 */ }
  render();
}
setRenderer(render);
init();
