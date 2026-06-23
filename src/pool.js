// 賽季 / 池 / 世代-地區推導與測驗組裝。讀 DATA（離線資料 holder）與 i18n，
// 把純規則（genKeyOf 的世代歸屬等）與資料查詢集中於此，view 只負責呈現。
import { DATA } from './state.js';
import { t } from './i18n.js';
import { generateTypeQuiz, generateSpeedQuiz, generateWhoQuiz, DEFAULT_SPEED_DIFFICULTY, DEFAULT_WHO_DIFFICULTY } from './quiz.js';

// ── 賽季 / 測驗組裝 ──────────────────────────────────────────────
export function seasonLabel(key) {
  return DATA.seasonsData.seasons[key]?.label || key;
}
export function seasonKeys() {
  return Object.keys(DATA.seasonsData.seasons);
}
export function defaultSeason() {
  const keys = seasonKeys();
  return keys.includes('m-b') ? 'm-b' : keys[0];
}
// 由賽季組出已排序的寶可夢池（穩定排序 → 速度測驗可決定性重現）。
export function seasonPool(key) {
  const members = DATA.seasonsData.seasons[key]?.members || [];
  return members
    .filter((k) => DATA.pokedex[k])
    .map((k) => ({ key: k, ...DATA.pokedex[k] }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// ── 我是誰：世代/地區池 ─────────────────────────────────────────
// 池鍵：世代 g1..g9，或賽季鍵（如 m-b，作為「冠軍最新賽季」選項）。
export const GENERATIONS = [
  { key: 'g1', cn: '一', min: 1, max: 151, region: '關都' },
  { key: 'g2', cn: '二', min: 152, max: 251, region: '城都' },
  { key: 'g3', cn: '三', min: 252, max: 386, region: '豐緣' },
  { key: 'g4', cn: '四', min: 387, max: 493, region: '神奧' },
  { key: 'g5', cn: '五', min: 494, max: 649, region: '合眾' },
  { key: 'g6', cn: '六', min: 650, max: 721, region: '卡洛斯' },
  { key: 'g7', cn: '七', min: 722, max: 809, region: '阿羅拉' },
  { key: 'g8', cn: '八', min: 810, max: 905, region: '伽勒爾' },
  { key: 'g9', cn: '九', min: 906, max: 1025, region: '帕底亞' },
];

// 地區形態歸到「該形態登場的世代/地區」（非本體國家圖鑑世代）：
// 阿羅拉九尾本體編號在關都，但形態是第七世代阿羅拉才有，故歸 g7。
// 洗翠（傳說 阿爾宙斯）世代算第八世代但地區非伽勒爾，獨立成 'hisui' 桶。
export const REGION_GEN = { alola: 'g7', galar: 'g8', hisui: 'hisui', paldea: 'g9' };
export function genKeyOf(key, entry) {
  for (const tag in REGION_GEN) {
    if (key.includes(`-${tag}`)) return REGION_GEN[tag];
  }
  // 一般／Mega：依國家圖鑑編號 ndex（Mega 仍算本體所屬世代）。
  const nd = entry.ndex || entry.dex;
  return GENERATIONS.find((g) => nd >= g.min && nd <= g.max)?.key || null;
}

// 我是誰的可選範圍：全部混合 + 全國圖鑑各世代 + 洗翠地區 + 冠軍最新賽季。
export function whoPoolKeys() {
  const hasNonMega = (poolKey) => Object.keys(DATA.nationalDex).some((k) => !DATA.nationalDex[k].mega && genKeyOf(k, DATA.nationalDex[k]) === poolKey);
  const gens = GENERATIONS.map((g) => g.key).filter(hasNonMega);
  const hisui = hasNonMega('hisui') ? ['hisui'] : [];
  return ['all', ...gens, ...hisui, defaultSeason()];
}
export function defaultWhoPool() {
  return whoPoolKeys()[0] || defaultSeason();
}
// 由池鍵組出穩定排序的寶可夢池：
//   賽季鍵（冠軍最新賽季）→ Champions 名單 DATA.pokedex；'all' / 世代 / 地區鍵 → 全國圖鑑 DATA.nationalDex。
export function whoPool(poolKey) {
  if (DATA.seasonsData.seasons[poolKey]) return seasonPool(poolKey);
  const keys = poolKey === 'all'
    ? Object.keys(DATA.nationalDex)
    : Object.keys(DATA.nationalDex).filter((k) => genKeyOf(k, DATA.nationalDex[k]) === poolKey);
  return keys
    .map((k) => ({ key: k, ...DATA.nationalDex[k] }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
export function poolLabel(poolKey) {
  if (!poolKey) return t('builder.poolLabel');
  if (poolKey === 'all') return '全部世代（混合）';
  const g = GENERATIONS.find((x) => x.key === poolKey);
  if (g) return `第${g.cn}世代（${g.region}）`;
  if (poolKey === 'hisui') return '洗翠地區（傳說 阿爾宙斯）';
  return `冠軍賽季（${poolKey.toUpperCase()}）`;
}

export function buildQuiz({ mode, season, seed, total, difficulty }) {
  if (mode === 'speed') return generateSpeedQuiz(seed, seasonPool(season), total, difficulty || DEFAULT_SPEED_DIFFICULTY);
  if (mode === 'who') return generateWhoQuiz(seed, whoPool(season), total, difficulty || DEFAULT_WHO_DIFFICULTY);
  return generateTypeQuiz(seed, total);
}

// 速度測驗難度顯示名（'all' 不另標，視為「混合」不加後綴以相容舊碼）。
export function difficultyLabel(difficulty) {
  return t(`difficulty.${difficulty}`) || '';
}

export function quizLabel(mode, season, difficulty = 'all') {
  if (mode === 'doku') return t('quiz.doku.title');
  if (mode === 'speed') {
    const diff = difficulty && difficulty !== 'all' ? ` · ${difficultyLabel(difficulty)}` : '';
    return `${t('quiz.speed.title')}（${seasonLabel(season)}${diff}）`;
  }
  if (mode === 'who') {
    const diff = difficulty ? ` · ${difficultyLabel(difficulty)}` : '';
    return `${t('quiz.who.title')}（${poolLabel(season)}${diff}）`;
  }
  return t('quiz.type.title');
}
