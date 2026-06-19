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
