import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, TYPE_META, singleMultiplier, multiplier, formatMultiplier } from '../src/data/typechart.js';

test('涵蓋全部 18 個屬性且皆有顯示資料', () => {
  assert.equal(TYPES.length, 18);
  for (const tkey of TYPES) {
    assert.ok(TYPE_META[tkey], `missing meta for ${tkey}`);
    assert.match(TYPE_META[tkey].color, /^#[0-9A-F]{6}$/i);
  }
});

test('知名相剋值正確', () => {
  assert.equal(singleMultiplier('water', 'fire'), 2);
  assert.equal(singleMultiplier('fire', 'grass'), 2);
  assert.equal(singleMultiplier('grass', 'water'), 2);
  assert.equal(singleMultiplier('fire', 'water'), 0.5);
  assert.equal(singleMultiplier('electric', 'ground'), 0); // 電打地面無效
  assert.equal(singleMultiplier('normal', 'ghost'), 0);    // 一般打幽靈無效
  assert.equal(singleMultiplier('ground', 'flying'), 0);   // 地面打飛行無效
  assert.equal(singleMultiplier('dragon', 'fairy'), 0);    // 龍打妖精無效
  assert.equal(singleMultiplier('poison', 'fairy'), 2);    // 毒剋妖精
  assert.equal(singleMultiplier('normal', 'normal'), 1);   // 預設 1×
});

test('雙屬性取乘積，能產生 4× 與 ¼×', () => {
  // 冰打 草/飛行 = 2 * 2 = 4
  assert.equal(multiplier('ice', ['grass', 'flying']), 4);
  // 火打 火/水 = 0.5 * 0.5 = 0.25
  assert.equal(multiplier('fire', ['fire', 'water']), 0.25);
  // 含 0 倍的整體為 0
  assert.equal(multiplier('electric', ['ground', 'water']), 0);
});

test('倍率格式化', () => {
  assert.equal(formatMultiplier(0), '0×');
  assert.equal(formatMultiplier(0.25), '¼×');
  assert.equal(formatMultiplier(0.5), '½×');
  assert.equal(formatMultiplier(1), '1×');
  assert.equal(formatMultiplier(2), '2×');
  assert.equal(formatMultiplier(4), '4×');
});

test('未知攻擊屬性丟錯', () => {
  assert.throws(() => singleMultiplier('lol', 'fire'));
});
