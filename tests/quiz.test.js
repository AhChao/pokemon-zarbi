import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTypeQuiz, generateSpeedQuiz, scoreQuiz, DEFAULT_QUESTION_COUNT } from '../src/quiz.js';
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

test('rng 決定論：同種子同序列', () => {
  const r1 = makeRng(hashSeed('x'));
  const r2 = makeRng(hashSeed('x'));
  for (let i = 0; i < 50; i++) assert.equal(r1(), r2());
});
