import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeResult, decodeResult } from '../src/share.js';
import { generateTypeQuiz } from '../src/quiz.js';

test('屬性成績碼 round-trip', () => {
  const code = encodeResult({ mode: 'type', seed: 'abc123', total: 10, score: 7 });
  assert.deepEqual(decodeResult(code), { mode: 'type', season: '', seed: 'abc123', total: 10, score: 7 });
});

test('速度成績碼帶賽季 round-trip', () => {
  const code = encodeResult({ mode: 'speed', season: 'm-b', seed: 'xyz', total: 10, score: 9 });
  assert.deepEqual(decodeResult(code), { mode: 'speed', season: 'm-b', seed: 'xyz', total: 10, score: 9 });
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
  assert.deepEqual(decodeResult(legacy), { mode: 'type', season: '', seed: 'oldseed', total: 10, score: 5 });
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
  assert.deepEqual(decodeResult(code), { mode: 'speed', season: 'm-b', seed: 's', total: 10, score: 0 });
});
