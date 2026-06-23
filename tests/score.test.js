import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreModesFor, pctOf, fmtPct } from '../src/score.js';

test('計分方式：我是誰才有按字計分', () => {
  assert.deepEqual(scoreModesFor('type'), ['count', 'normal']);
  assert.deepEqual(scoreModesFor('speed'), ['count', 'normal']);
  assert.deepEqual(scoreModesFor('who'), ['count', 'normal', 'char']);
});

test('百分比：正常計分換算答對比例', () => {
  assert.equal(pctOf({ score: 8, total: 10 }), 80);
  assert.equal(pctOf({ score: 0, total: 10 }), 0);
});

test('百分比：按字計分時 score 已是百分制，原樣回傳', () => {
  assert.equal(pctOf({ charScore: true, score: 66.67, total: 12 }), 66.67);
});

test('百分比：零題不除零，回 0', () => {
  assert.equal(pctOf({ score: 0, total: 0 }), 0);
});

test('顯示：去尾零、最多兩位小數', () => {
  assert.equal(fmtPct(70), '70');
  assert.equal(fmtPct(75.5), '75.5');
  assert.equal(fmtPct(66.666666), '66.67');
});
