// 由 seed 確定性產生測驗題目。同一個 seed + 同樣題數 → 完全相同的題目，
// 這讓分享出去的成績碼能被對方用「同一份測驗」驗證。

import { TYPES, multiplier } from './data/typechart.js';
import { hashSeed, makeRng, makeRandom } from './rng.js';

export const DEFAULT_QUESTION_COUNT = 10;
export const MIN_QUESTION_COUNT = 10;
export const MAX_QUESTION_COUNT = 20;

// 速度測驗難度：以兩隻寶可夢的速度差分桶。連續不重疊、無孤兒配對。
//   all    = 不限（diff>=1）→ 與舊版行為完全相同，舊成績碼可原樣重現。
//   easy   = 差距大（>=20），約佔可用配對 68%
//   medium = 中間帶（6..19），約 22%
//   hard   = 接近（1..5），約 9%
//   random = 每題隨機從 easy/medium/hard 抽一個桶（同 seed 仍可重現）。
export const SPEED_DIFFICULTIES = ['all', 'easy', 'medium', 'hard', 'random'];
// 隨機難度逐題抽桶的候選（不含 all，避免又退回不限差距）。
const SPEED_RANDOM_BANDS = ['easy', 'medium', 'hard'];
export const DEFAULT_SPEED_DIFFICULTY = 'easy';

// 「我是誰」難度：只決定 Mega 是否進池（立繪是否黑影、提示由 UI 端依難度呈現）。
//   veryeasy = 不含 Mega，立繪直接亮著，提示第一個字（同 easy 提示）
//   easy     = 不含 Mega，黑影，提示第一個字
//   normal   = 不含 Mega，黑影，只提示字數（圈圈）
//   hard     = 含 Mega，黑影，無提示
export const WHO_DIFFICULTIES = ['veryeasy', 'easy', 'normal', 'hard'];
export const DEFAULT_WHO_DIFFICULTY = 'easy';
const DIFFICULTY_BANDS = {
  all: { min: 1, max: Infinity },
  easy: { min: 20, max: Infinity },
  medium: { min: 6, max: 19 },
  hard: { min: 1, max: 5 },
};

// 單屬性防禦時可能出現的倍率（乾淨的四選一）。
const SINGLE_OPTIONS = [0, 0.5, 1, 2];
// 雙屬性防禦時可能出現的倍率（含 ¼× 與 4×）。
const DUAL_POOL = [0, 0.25, 0.5, 1, 2, 4];

// 產生一題：決定攻擊屬性、防禦屬性（單或雙）、正解倍率與四個選項。
function buildQuestion(rng, rand, index) {
  const atk = rand.pick(TYPES);
  // 約三成題目為雙屬性，提高鑑別度（會考到 ¼× / 4×）。
  const dual = rng() < 0.3;

  let def, options;
  if (dual) {
    let d1 = rand.pick(TYPES);
    let d2 = rand.pick(TYPES);
    while (d2 === d1) d2 = rand.pick(TYPES);
    def = [d1, d2];
    const correct = multiplier(atk, def);
    const distractors = rand.shuffle(DUAL_POOL.filter((v) => v !== correct)).slice(0, 3);
    options = rand.shuffle([correct, ...distractors]);
  } else {
    def = [rand.pick(TYPES)];
    multiplier(atk, def); // 正解必在 SINGLE_OPTIONS 中
    options = rand.shuffle(SINGLE_OPTIONS);
  }

  const correct = multiplier(atk, def);
  return {
    id: index,
    mode: 'type',
    atk,
    def,
    dual,
    correct,
    options,
    correctIndex: options.indexOf(correct),
  };
}

// 屬性相剋測驗。
export function generateTypeQuiz(seed, count = DEFAULT_QUESTION_COUNT) {
  const rng = makeRng(hashSeed(String(seed)));
  const rand = makeRandom(rng);
  const questions = [];
  for (let i = 0; i < count; i++) {
    questions.push(buildQuestion(rng, rand, i));
  }
  return { mode: 'type', seed: String(seed), count, questions };
}

// 種族值速度測驗：「誰比較快」。pool 為已排序的寶可夢陣列
// （每筆需有 key 與 speed），由呼叫端依賽季組好傳入，保持純函式與決定性。
export function generateSpeedQuiz(seed, pool, count = DEFAULT_QUESTION_COUNT, difficulty = 'all') {
  if (!Array.isArray(pool) || pool.length < 2) {
    throw new Error('speed quiz needs a pool of at least 2 pokemon');
  }
  const isRandom = difficulty === 'random';
  const fixedBand = DIFFICULTY_BANDS[difficulty] || DIFFICULTY_BANDS.all;
  const rng = makeRng(hashSeed(String(seed)));
  const rand = makeRandom(rng);
  const questions = [];
  let guard = 0;
  const maxGuard = count * 200 + 100;
  while (questions.length < count && guard < maxGuard) {
    guard++;
    // 隨機難度：逐題抽一個桶（消耗 rng → 同 seed 仍完全可重現）。
    const band = isRandom ? DIFFICULTY_BANDS[rand.pick(SPEED_RANDOM_BANDS)] : fixedBand;
    const a = rand.pick(pool);
    const b = rand.pick(pool);
    if (a.key === b.key) continue;
    // 速度差須落在難度桶內（band.min>=1 已排除「一樣快」的無解題）。
    const diff = Math.abs(a.speed - b.speed);
    if (diff < band.min || diff > band.max) continue;
    const correctIndex = a.speed > b.speed ? 0 : 1;
    questions.push({ id: questions.length, mode: 'speed', diff, pair: [a, b], options: [a, b], correctIndex });
  }
  return { mode: 'speed', seed: String(seed), difficulty, count: questions.length, questions };
}

// 我是誰：看黑影猜名字。pool 由呼叫端依「世代/賽季」組好（每筆需 key/nameZh/nameEn/image/mega）。
// 難度只決定 Mega 是否進池：easy/normal 不含、hard 含。提示由 UI 端依難度呈現。
export function generateWhoQuiz(seed, pool, count = DEFAULT_QUESTION_COUNT, difficulty = DEFAULT_WHO_DIFFICULTY) {
  const allowMega = difficulty === 'hard';
  const usable = (Array.isArray(pool) ? pool : []).filter((p) => allowMega || !p.mega);
  if (usable.length < 1) throw new Error('who quiz needs at least 1 pokemon in pool');
  const rng = makeRng(hashSeed(String(seed)));
  const rand = makeRandom(rng);
  // 洗牌後取前 count 隻（不重複）；pool 已由呼叫端穩定排序 → 同 seed 完全可重現。
  const picked = rand.shuffle(usable).slice(0, Math.min(count, usable.length));
  const questions = picked.map((p, i) => ({
    id: i, mode: 'who', key: p.key,
    nameZh: p.nameZh, nameEn: p.nameEn, image: p.image, mega: !!p.mega, dex: p.dex,
  }));
  return { mode: 'who', seed: String(seed), difficulty, count: questions.length, questions };
}

// 自訂題庫（我是誰出題）：pool 已是作者精選的實際清單，依 seed 穩定洗牌即可；
// 不再依難度濾 Mega（尊重作者的選擇），難度只影響提示/判定。
export function generateWhoQuizFromKeys(seed, pool, difficulty = DEFAULT_WHO_DIFFICULTY) {
  if (!Array.isArray(pool) || pool.length < 1) throw new Error('custom who needs at least 1 pokemon');
  const rng = makeRng(hashSeed(String(seed)));
  const rand = makeRandom(rng);
  const picked = rand.shuffle(pool);
  const questions = picked.map((p, i) => ({
    id: i, mode: 'who', key: p.key,
    nameZh: p.nameZh, nameEn: p.nameEn, image: p.image, mega: !!p.mega, dex: p.dex,
  }));
  return { mode: 'who', seed: String(seed), difficulty, count: questions.length, questions };
}

// 羅馬數字（U+2160–U+217B，含大小寫）→ 阿拉伯數字：讓「多邊獸Ⅱ」可以打「2」。
const ROMAN_NUM = {
  'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5', 'Ⅵ': '6',
  'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10', 'Ⅺ': '11', 'Ⅻ': '12',
  'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5', 'ⅵ': '6',
  'ⅶ': '7', 'ⅷ': '8', 'ⅸ': '9', 'ⅹ': '10', 'ⅺ': '11', 'ⅻ': '12',
};
// 比對時略過的符號：中黑點/中點/句號、全/半形括號、英文點與撇號、頓號（不影響可辨識的名字主體）。
// 例：卡璞・鳴鳴＝卡璞鳴鳴＝卡璞。鳴鳴、帕底亞肯泰羅（鬥戰種）＝帕底亞肯泰羅鬥戰種、Farfetch’d＝farfetchd。
const NAME_PUNCT = /[・·‧（）()．.。’'、]/g;

// 名字正規化：中文名裡內含的英數（如 3D龍、噴火龍 Mega Y）容許全形/半形、
// 大小寫、空白差異；羅馬數字可打阿拉伯數字、標點符號略過；其餘字元需一字不漏。
export function normalizeName(s) {
  return String(s == null ? '' : s)
    // 全形 ASCII（U+FF01–FF5E）轉半形
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ') // 全形空白
    .replace(/[Ⅰ-ⅻ]/g, (c) => ROMAN_NUM[c] || c) // 羅馬數字 → 阿拉伯數字
    .toLowerCase()
    .replace(NAME_PUNCT, '') // 略過中黑點／括號／點／撇號等符號
    .replace(/\s+/g, ''); // 空白不計入比對
}

// 地區形態中文前綴（依 key 後綴判定）：提示難度下打不打地區名都算對。
const REGION_FORM_PREFIX = { '-alola': '阿羅拉', '-galar': '伽勒爾', '-hisui': '洗翠', '-paldea': '帕底亞' };
// 會露出「第一個字」提示的難度；此時地區形態可省略地區名。
const WHO_HINT_DIFFICULTIES = new Set(['veryeasy', 'easy']);

// 取「去地區前綴」的本體名（阿羅拉九尾 → 九尾）；非地區形態回 null。
export function whoBaseName(q) {
  const n = q.nameZh || '', key = q.key || '';
  for (const tag in REGION_FORM_PREFIX) {
    const pre = REGION_FORM_PREFIX[tag];
    if (key.includes(tag) && n.startsWith(pre)) return n.slice(pre.length);
  }
  return null;
}

// 我是誰計分：只比中文名（正規化後）。不收 Pokémon 英文名。
// 提示難度（veryeasy/easy）：地區形態打不打地區名都算對；其他難度需完整名。
export function whoAnswerCorrect(q, typed, difficulty) {
  const t = normalizeName(typed);
  if (!t) return false;
  if (t === normalizeName(q.nameZh)) return true;
  if (WHO_HINT_DIFFICULTIES.has(difficulty)) {
    const base = whoBaseName(q);
    if (base && t === normalizeName(base)) return true;
  }
  return false;
}

// Lv50 速度線換算：由速度種族值算四條投資線與常見補正（VGC 固定 50 級）。
// 用整數運算（×11/10 等）避免浮點誤差，與遊戲內 floor 行為一致。
export function speedLines(base) {
  const neu = base + 52;                 // 準速：252努力 + 31個體 + 無修正性格
  const max = Math.floor(neu * 11 / 10); // 最速：再加 加速性格（×1.1）
  const noInv = base + 20;               // 無振：0努力 + 31個體 + 無修正
  const neg = Math.floor(noInv * 9 / 10); // 減速：0努力 + 31個體 + 減速性格（×0.9）
  return {
    base, max, neu, noInv, neg,
    scarfMax: Math.floor(max * 3 / 2),   // 講究圍巾 ×1.5
    scarfNeu: Math.floor(neu * 3 / 2),
    twMax: max * 2,                       // 順風 ×2
    twNeu: neu * 2,
    twNoInv: noInv * 2,
  };
}

// 按字計分（我是誰）：每隻滿分 10，每字 10/名字長度。輸入字元依序對到正解名字
// （子序列：對的字之間可跳過沒打的字），算對幾字得幾分；該題下限 0 分。回傳 0..10。
// 名字先正規化（全形→半形、小寫、去空白）再逐字比，故 3D龍/3d龍 同分。
export function whoCharScore(q, typed) {
  const target = Array.from(normalizeName(q.nameZh));
  if (target.length === 0) return 0;
  const per = 10 / target.length;
  let pt = 0, matched = 0;
  for (const ch of Array.from(normalizeName(typed))) {
    let found = -1;
    for (let j = pt; j < target.length; j++) { if (target[j] === ch) { found = j; break; } }
    if (found >= 0) { matched++; pt = found + 1; }
  }
  return Math.max(0, Math.min(10, matched * per));
}

// 整份按字計分（我是誰）：各題 whoCharScore 加總，範圍 0..題數×10。
export function scoreQuizChar(quiz, answers) {
  return quiz.questions.reduce((s, q, i) => s + whoCharScore(q, answers[i]), 0);
}

// 計分：選擇題比對選項索引；我是誰比對輸入文字。
export function scoreQuiz(quiz, answers) {
  let correct = 0;
  quiz.questions.forEach((q, i) => {
    if (q.mode === 'who') { if (whoAnswerCorrect(q, answers[i], quiz.difficulty)) correct++; }
    else if (answers[i] === q.correctIndex) correct++;
  });
  return correct;
}

// 產生一個新的隨機 seed（瀏覽器端發起新測驗時用）。
export function newSeed() {
  return Math.random().toString(36).slice(2, 10);
}
