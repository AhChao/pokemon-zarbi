import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeResult, decodeResult } from '../src/share.js';
import { generateTypeQuiz } from '../src/quiz.js';

test('屬性成績碼 round-trip', () => {
  const code = encodeResult({ mode: 'type', seed: 'abc123', total: 10, score: 7 });
  assert.deepEqual(decodeResult(code), { mode: 'type', season: '', seed: 'abc123', total: 10, score: 7, difficulty: 'all' });
});

test('速度成績碼帶賽季 round-trip', () => {
  const code = encodeResult({ mode: 'speed', season: 'm-b', seed: 'xyz', total: 10, score: 9 });
  assert.deepEqual(decodeResult(code), { mode: 'speed', season: 'm-b', seed: 'xyz', total: 10, score: 9, difficulty: 'all' });
});

test('速度成績碼帶難度 round-trip', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const code = encodeResult({ mode: 'speed', season: 'm-a', seed: 'd1', total: 10, score: 4, difficulty });
    assert.deepEqual(decodeResult(code),
      { mode: 'speed', season: 'm-a', seed: 'd1', total: 10, score: 4, difficulty });
  }
});

test('數獨成績碼 round-trip（season 用 -、total 固定 9）', () => {
  for (const score of [0, 4, 9]) {
    const code = encodeResult({ mode: 'doku', season: '', seed: 'dseed12', total: 9, score });
    assert.deepEqual(decodeResult(code),
      { mode: 'doku', season: '', seed: 'dseed12', total: 9, score, difficulty: 'all' });
  }
});

test('我是誰成績碼 round-trip（池鍵 + 難度一律附第 7 欄）', () => {
  for (const [season, difficulty] of [['g1', 'veryeasy'], ['g1', 'easy'], ['g9', 'normal'], ['m-b', 'hard']]) {
    const code = encodeResult({ mode: 'who', season, seed: 'wseed', total: 10, score: 6, difficulty });
    assert.deepEqual(decodeResult(code),
      { mode: 'who', season, seed: 'wseed', total: 10, score: 6, difficulty });
  }
});

test('我是誰按字計分成績碼 round-trip（百分制、保留兩位小數、第 8 欄旗標）', () => {
  for (const score of [87.5, 66.67, 100, 0, 12.34]) {
    const code = encodeResult({ mode: 'who', season: 'g1', seed: 'cs', total: 15, score, difficulty: 'easy', charScore: true });
    assert.deepEqual(decodeResult(code),
      { mode: 'who', season: 'g1', seed: 'cs', total: 15, score, difficulty: 'easy', charScore: true });
  }
});

test('計分方式三態 round-trip（不計分／正常 N／按字 C）', () => {
  // 不計分：無旗標，score=答對題數
  const a = decodeResult(encodeResult({ mode: 'who', season: 'g1', seed: 'a', total: 12, score: 8, difficulty: 'easy' }));
  assert.deepEqual(a, { mode: 'who', season: 'g1', seed: 'a', total: 12, score: 8, difficulty: 'easy' });
  // 正常計分：旗標 N，score 仍為答對題數
  const n = decodeResult(encodeResult({ mode: 'type', seed: 'b', total: 10, score: 7, score100: true }));
  assert.deepEqual(n, { mode: 'type', season: '', seed: 'b', total: 10, score: 7, difficulty: 'all', score100: true });
  // 按字計分：旗標 C，score 為百分制
  const c = decodeResult(encodeResult({ mode: 'who', season: 'g1', seed: 'c', total: 10, score: 87.5, difficulty: 'easy', charScore: true }));
  assert.deepEqual(c, { mode: 'who', season: 'g1', seed: 'c', total: 10, score: 87.5, difficulty: 'easy', charScore: true });
});

test('題數 10～20 成績碼 round-trip', () => {
  for (const total of [10, 15, 20]) {
    const code = encodeResult({ mode: 'who', season: 'all', seed: 'q', total, score: 6, difficulty: 'normal' });
    assert.equal(decodeResult(code).total, total);
  }
});

test('一般我是誰碼不帶第 8 欄、score 為答對題數', () => {
  const code = encodeResult({ mode: 'who', season: 'g1', seed: 'n', total: 10, score: 7, difficulty: 'easy' });
  const d = decodeResult(code);
  assert.equal(d.score, 7);
  assert.equal(d.charScore, undefined); // 非按字計分不附旗標
});

test('難度欄不污染屬性碼長度（type 不附第 7 欄，仍 6 欄）', () => {
  const typeCode = encodeResult({ mode: 'type', seed: 's', total: 10, score: 5, difficulty: 'hard' });
  const decoded = decodeResult(typeCode);
  assert.equal(decoded.difficulty, 'all'); // type 模式忽略難度
});

test('舊版速度碼（無難度欄）解為 all', () => {
  // 仿 v2 6 欄速度碼：2~s~m-b~seed~10~8
  const legacy = Buffer.from('2~s~m-b~legseed~10~8', 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(decodeResult(legacy),
    { mode: 'speed', season: 'm-b', seed: 'legseed', total: 10, score: 8, difficulty: 'all' });
});

test('成績碼是 URL 安全字元', () => {
  const code = encodeResult({ mode: 'speed', season: 'm-a', seed: 'a/b+c=d', total: 10, score: 3 });
  assert.match(code, /^[A-Za-z0-9_-]+$/);
});

test('成績碼（含賽季）能重現同一份測驗的 seed', () => {
  const decoded = decodeResult(encodeResult({ mode: 'type', seed: 'shared', total: 10, score: 6 }));
  assert.deepEqual(generateTypeQuiz(decoded.seed, decoded.total), generateTypeQuiz('shared', 10));
});

test('舊版 v1 代碼仍可解、視為屬性模式', () => {
  // 1~seed~total~score 的 base64url
  const legacy = Buffer.from('1~oldseed~10~5', 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(decodeResult(legacy), { mode: 'type', season: '', seed: 'oldseed', total: 10, score: 5, difficulty: 'all' });
});

test('壞掉的碼回傳 null', () => {
  assert.equal(decodeResult(''), null);
  assert.equal(decodeResult(null), null);
  assert.equal(decodeResult('not-valid!!!'), null);
});

test('分數超出範圍視為無效', () => {
  const bad = encodeResult({ mode: 'type', seed: 's', total: 10, score: 11 });
  assert.equal(decodeResult(bad), null);
});

test('共玩碼 score=0 合法', () => {
  const code = encodeResult({ mode: 'speed', season: 'm-b', seed: 's', total: 10, score: 0 });
  assert.deepEqual(decodeResult(code), { mode: 'speed', season: 'm-b', seed: 's', total: 10, score: 0, difficulty: 'all' });
});
