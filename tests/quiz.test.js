import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTypeQuiz, generateSpeedQuiz, generateWhoQuiz, whoAnswerCorrect, whoCharScore, scoreQuizChar, normalizeName, speedLines, scoreQuiz, DEFAULT_QUESTION_COUNT } from '../src/quiz.js';
import { multiplier } from '../src/data/typechart.js';
import { hashSeed, makeRng } from '../src/rng.js';

const POOL = [
  { key: 'shuckle', speed: 5 },
  { key: 'snorlax', speed: 30 },
  { key: 'garchomp', speed: 102 },
  { key: 'jolteon', speed: 130 },
  { key: 'accelgor', speed: 145 },
  { key: 'ninjask', speed: 160 },
];

test('屬性測驗：同 seed 永遠相同', () => {
  assert.deepEqual(generateTypeQuiz('steven-123'), generateTypeQuiz('steven-123'));
});

test('屬性測驗：10 題、4 選項、正解索引正確', () => {
  const quiz = generateTypeQuiz('check');
  assert.equal(quiz.mode, 'type');
  assert.equal(quiz.count, DEFAULT_QUESTION_COUNT);
  for (const q of quiz.questions) {
    assert.equal(q.options.length, 4);
    assert.equal(q.correct, multiplier(q.atk, q.def));
    assert.equal(q.options[q.correctIndex], q.correct);
    assert.equal(new Set(q.options).size, 4);
  }
});

test('速度測驗：同 seed + 同 pool 永遠相同', () => {
  assert.deepEqual(generateSpeedQuiz('s1', POOL), generateSpeedQuiz('s1', POOL));
});

test('速度測驗：每題兩隻不同、速度不同，正解是較快的那隻', () => {
  const quiz = generateSpeedQuiz('s1', POOL);
  assert.equal(quiz.mode, 'speed');
  assert.equal(quiz.questions.length, 10);
  for (const q of quiz.questions) {
    const [a, b] = q.pair;
    assert.notEqual(a.key, b.key);
    assert.notEqual(a.speed, b.speed);
    const fasterIndex = a.speed > b.speed ? 0 : 1;
    assert.equal(q.correctIndex, fasterIndex);
    assert.equal(q.options[q.correctIndex].speed, Math.max(a.speed, b.speed));
  }
});

test('速度測驗：pool 不足兩隻會丟錯', () => {
  assert.throws(() => generateSpeedQuiz('x', [{ key: 'a', speed: 1 }]));
});

test('速度測驗：預設難度為 all、所有題目速度差>=1', () => {
  const quiz = generateSpeedQuiz('s1', POOL);
  assert.equal(quiz.difficulty, 'all');
  for (const q of quiz.questions) assert.ok(q.diff >= 1);
});

// 速度分布夠分散，足以填滿各難度桶。
const BANDED = [
  { key: 'a', speed: 100 }, { key: 'b', speed: 102 }, { key: 'c', speed: 104 },
  { key: 'd', speed: 105 }, { key: 'e', speed: 110 }, { key: 'f', speed: 113 },
  { key: 'g', speed: 118 }, { key: 'h', speed: 130 }, { key: 'i', speed: 160 },
];

test('速度測驗：難度桶把每題速度差限制在範圍內', () => {
  const cases = { easy: [20, Infinity], medium: [6, 19], hard: [1, 5] };
  for (const [difficulty, [min, max]] of Object.entries(cases)) {
    const quiz = generateSpeedQuiz('band-seed', BANDED, 10, difficulty);
    assert.equal(quiz.difficulty, difficulty);
    assert.ok(quiz.questions.length > 0, `${difficulty} 應能產生題目`);
    for (const q of quiz.questions) {
      assert.ok(q.diff >= min && q.diff <= max, `${difficulty}: diff ${q.diff} 超出 ${min}..${max}`);
    }
  }
});

test('速度測驗：同 seed + 同難度可重現', () => {
  assert.deepEqual(
    generateSpeedQuiz('rep', BANDED, 10, 'hard'),
    generateSpeedQuiz('rep', BANDED, 10, 'hard'),
  );
});

test('計分通用於兩種模式', () => {
  const quiz = generateSpeedQuiz('grade', POOL);
  const allRight = quiz.questions.map((q) => q.correctIndex);
  assert.equal(scoreQuiz(quiz, allRight), quiz.count);
  const allWrong = quiz.questions.map((q) => (q.correctIndex + 1) % 2);
  assert.equal(scoreQuiz(quiz, allWrong), 0);
});

// 我是誰測驗
const WHO_POOL = [
  { key: 'pikachu', nameZh: '皮卡丘', nameEn: 'Pikachu', image: 'p.png', mega: false, dex: 25 },
  { key: 'charizard', nameZh: '噴火龍', nameEn: 'Charizard', image: 'c.png', mega: false, dex: 6 },
  { key: 'charizard-mega-x', nameZh: '噴火龍 Mega X', nameEn: 'Mega Charizard X', image: 'cx.png', mega: true, dex: 10034 },
  { key: 'gengar', nameZh: '耿鬼', nameEn: 'Gengar', image: 'g.png', mega: false, dex: 94 },
  { key: 'snorlax', nameZh: '卡比獸', nameEn: 'Snorlax', image: 's.png', mega: false, dex: 143 },
];

test('我是誰：同 seed + 同 pool 永遠相同', () => {
  assert.deepEqual(generateWhoQuiz('w1', WHO_POOL, 4), generateWhoQuiz('w1', WHO_POOL, 4));
});

test('我是誰：veryeasy/easy/normal 不含 Mega、hard 含 Mega', () => {
  for (const difficulty of ['veryeasy', 'easy', 'normal']) {
    const quiz = generateWhoQuiz('seed', WHO_POOL, 10, difficulty);
    assert.ok(quiz.questions.every((q) => !q.mega), `${difficulty} 不應含 Mega`);
  }
  const hard = generateWhoQuiz('seed', WHO_POOL, 10, 'hard');
  assert.ok(hard.questions.some((q) => q.mega), 'hard 應可能含 Mega');
});

test('我是誰：題目不重複、上限為可用池大小', () => {
  const quiz = generateWhoQuiz('w2', WHO_POOL, 10, 'normal'); // normal 排除 1 隻 Mega → 4 隻
  assert.equal(quiz.count, 4);
  assert.equal(new Set(quiz.questions.map((q) => q.key)).size, quiz.count);
});

test('我是誰：空池會丟錯', () => {
  assert.throws(() => generateWhoQuiz('x', [{ key: 'm', nameZh: 'x', nameEn: 'x', mega: true }], 5, 'easy'));
});

test('名字正規化：全形/大小寫/空白皆容錯', () => {
  assert.equal(normalizeName('Ｐｉｋａｃｈｕ'), 'pikachu'); // 全形英文
  assert.equal(normalizeName('  Mega  Charizard  X '), 'megacharizardx'); // 大小寫 + 空白
  assert.equal(normalizeName('皮卡丘'), '皮卡丘');
});

test('我是誰計分：只比中文名，名字內含英數容許全形/大小寫/空白', () => {
  const q = { mode: 'who', nameZh: '噴火龍 Mega Y', nameEn: 'Mega Charizard Y' };
  assert.ok(whoAnswerCorrect(q, '噴火龍 Mega Y'));
  assert.ok(whoAnswerCorrect(q, '噴火龍 mega y')); // 內含英文小寫
  assert.ok(whoAnswerCorrect(q, '噴火龍megay')); // 去空白
  assert.ok(whoAnswerCorrect(q, '噴火龍 ＭＥＧＡ Ｙ')); // 全形英文
  assert.ok(!whoAnswerCorrect(q, 'Mega Charizard Y')); // 不收英文名
  assert.ok(!whoAnswerCorrect(q, '噴火龍'));
  assert.ok(!whoAnswerCorrect(q, ''));
});

test('我是誰計分：名字內含英數可大小寫互通（3D龍）', () => {
  const q = { mode: 'who', nameZh: '3D龍', nameEn: 'Porygon' };
  assert.ok(whoAnswerCorrect(q, '3d龍'));
  assert.ok(whoAnswerCorrect(q, '3D龍'));
  assert.ok(whoAnswerCorrect(q, '３Ｄ龍')); // 全形英數
  assert.ok(!whoAnswerCorrect(q, 'porygon')); // 不收英文名
});

test('我是誰計分：多邊獸Ⅱ 可打阿拉伯數字 2', () => {
  const q = { mode: 'who', key: 'porygon2', nameZh: '多邊獸Ⅱ', nameEn: 'Porygon2' };
  assert.ok(whoAnswerCorrect(q, '多邊獸2'));   // 羅馬數字 Ⅱ → 2
  assert.ok(whoAnswerCorrect(q, '多邊獸Ⅱ'));   // 原字也可
  assert.ok(whoAnswerCorrect(q, '多邊獸２'));   // 全形 2
});

test('我是誰計分：中黑點、括號等符號略過', () => {
  assert.ok(whoAnswerCorrect({ mode: 'who', key: 'tapu-koko', nameZh: '卡璞・鳴鳴' }, '卡璞鳴鳴'));
  assert.ok(whoAnswerCorrect({ mode: 'who', key: 'tapu-koko', nameZh: '卡璞・鳴鳴' }, '卡璞・鳴鳴'));
  const tauros = { mode: 'who', key: 'tauros-paldea-combat-breed', nameZh: '帕底亞肯泰羅（鬥戰種）' };
  assert.ok(whoAnswerCorrect(tauros, '帕底亞肯泰羅鬥戰種')); // 去括號
});

test('我是誰計分：提示難度地區名可有可無、其他難度需完整', () => {
  const q = { mode: 'who', key: 'ninetales-alola', nameZh: '阿羅拉九尾', nameEn: 'Alolan Ninetales' };
  // 提示難度（veryeasy/easy）：打不打地區名都算對
  for (const d of ['veryeasy', 'easy']) {
    assert.ok(whoAnswerCorrect(q, '阿羅拉九尾', d), `${d} 完整名應對`);
    assert.ok(whoAnswerCorrect(q, '九尾', d), `${d} 省略地區名應對`);
  }
  // 其他難度（normal/hard）：必須完整名
  for (const d of ['normal', 'hard']) {
    assert.ok(whoAnswerCorrect(q, '阿羅拉九尾', d), `${d} 完整名應對`);
    assert.ok(!whoAnswerCorrect(q, '九尾', d), `${d} 省略地區名不應對`);
  }
  // 非地區形態不受影響：提示難度也不能少打字
  const pika = { mode: 'who', key: 'pikachu', nameZh: '皮卡丘' };
  assert.ok(!whoAnswerCorrect(pika, '卡丘', 'easy'));
});

test('速度測驗：random 難度每題落在 easy/medium/hard 任一桶、同 seed 可重現', () => {
  const quiz = generateSpeedQuiz('rng-band', BANDED, 10, 'random');
  assert.equal(quiz.difficulty, 'random');
  assert.ok(quiz.questions.length > 0);
  for (const q of quiz.questions) assert.ok(q.diff >= 1, `diff ${q.diff} 應 >=1`);
  assert.deepEqual(quiz, generateSpeedQuiz('rng-band', BANDED, 10, 'random'));
});

test('計分通用於我是誰模式', () => {
  const quiz = generateWhoQuiz('grade-who', WHO_POOL, 4, 'normal');
  const allRight = quiz.questions.map((q) => q.nameZh);
  assert.equal(scoreQuiz(quiz, allRight), quiz.count);
  const allWrong = quiz.questions.map(() => 'xxxxx');
  assert.equal(scoreQuiz(quiz, allWrong), 0);
});

test('速度線：Lv50 換算對齊早見表（base 100 / 150）', () => {
  assert.deepEqual(speedLines(100),
    { base: 100, max: 167, neu: 152, noInv: 120, neg: 108, scarfMax: 250, scarfNeu: 228, twMax: 334, twNeu: 304, twNoInv: 240 });
  assert.deepEqual(speedLines(150),
    { base: 150, max: 222, neu: 202, noInv: 170, neg: 153, scarfMax: 333, scarfNeu: 303, twMax: 444, twNeu: 404, twNoInv: 340 });
});

test('速度線：最速 = floor(準速×1.1)、減速 = floor(無振×0.9)（無浮點誤差）', () => {
  for (let b = 5; b <= 200; b++) {
    const ln = speedLines(b);
    assert.equal(ln.neu, b + 52);
    assert.equal(ln.max, Math.floor((b + 52) * 11 / 10));
    assert.equal(ln.neg, Math.floor((b + 20) * 9 / 10));
    assert.equal(ln.twMax, ln.max * 2);
  }
});

test('按字計分：依序子序列比對，每字 10/長度（頑皮彈→頑皮雷彈＝7.5）', () => {
  assert.equal(whoCharScore({ nameZh: '頑皮雷彈' }, '頑皮彈'), 7.5); // 3/4 對（跳過漏打的雷）
  assert.equal(whoCharScore({ nameZh: '頑皮雷彈' }, '頑皮雷彈'), 10); // 全對
  assert.equal(whoCharScore({ nameZh: '頑皮雷彈' }, '小火龍'), 0);   // 全錯
  assert.equal(whoCharScore({ nameZh: '頑皮雷彈' }, ''), 0);
  assert.equal(whoCharScore({ nameZh: '阿羅拉九尾' }, '阿羅拉九'), 8); // 4/5
});

test('按字計分：順序要對（亂序不給後面的分）', () => {
  // 皮頑…：皮先對到 target[1]，頑在其後找不到 → 只算 1 字
  assert.equal(whoCharScore({ nameZh: '頑皮雷彈' }, '皮頑'), 2.5);
});

test('按字計分：全形/大小寫容錯（3d龍＝3D龍）', () => {
  assert.equal(whoCharScore({ nameZh: '3D龍' }, '3d龍'), 10);
});

test('整份按字計分加總（0..題數×10）', () => {
  const quiz = { questions: [{ nameZh: '頑皮雷彈' }, { nameZh: '噴火龍' }] };
  assert.equal(scoreQuizChar(quiz, ['頑皮彈', '噴火龍']), 17.5); // 7.5 + 10
});

test('rng 決定論：同種子同序列', () => {
  const r1 = makeRng(hashSeed('x'));
  const r2 = makeRng(hashSeed('x'));
  for (let i = 0; i < 50; i++) assert.equal(r1(), r2());
});
