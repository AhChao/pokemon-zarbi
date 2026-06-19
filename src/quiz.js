// 由 seed 確定性產生測驗題目。同一個 seed + 同樣題數 → 完全相同的題目，
// 這讓分享出去的成績碼能被對方用「同一份測驗」驗證。

import { TYPES, multiplier } from './data/typechart.js';
import { hashSeed, makeRng, makeRandom } from './rng.js';

export const DEFAULT_QUESTION_COUNT = 10;

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
export function generateSpeedQuiz(seed, pool, count = DEFAULT_QUESTION_COUNT) {
  if (!Array.isArray(pool) || pool.length < 2) {
    throw new Error('speed quiz needs a pool of at least 2 pokemon');
  }
  const rng = makeRng(hashSeed(String(seed)));
  const rand = makeRandom(rng);
  const questions = [];
  let guard = 0;
  const maxGuard = count * 100 + 100;
  while (questions.length < count && guard < maxGuard) {
    guard++;
    const a = rand.pick(pool);
    const b = rand.pick(pool);
    // 必須是不同隻、且速度不同（避免「一樣快」的無解題）。
    if (a.key === b.key || a.speed === b.speed) continue;
    const correctIndex = a.speed > b.speed ? 0 : 1;
    questions.push({ id: questions.length, mode: 'speed', pair: [a, b], options: [a, b], correctIndex });
  }
  return { mode: 'speed', seed: String(seed), count: questions.length, questions };
}

// 計分：answers 為使用者每題選到的「選項索引」陣列。
export function scoreQuiz(quiz, answers) {
  let correct = 0;
  quiz.questions.forEach((q, i) => {
    if (answers[i] === q.correctIndex) correct++;
  });
  return correct;
}

// 產生一個新的隨機 seed（瀏覽器端發起新測驗時用）。
export function newSeed() {
  return Math.random().toString(36).slice(2, 10);
}
