import test from 'node:test';
import assert from 'node:assert/strict';
import { genKeyOf, whoPool, GENERATIONS } from '../src/pool.js';
import { DATA } from '../src/state.js';

test('世代歸屬：依國家圖鑑編號分桶', () => {
  assert.equal(genKeyOf('bulbasaur', { ndex: 1 }), 'g1');
  assert.equal(genKeyOf('chikorita', { ndex: 152 }), 'g2');
  assert.equal(genKeyOf('koraidon', { ndex: 1007 }), 'g9');
});

test('世代歸屬：地區形態歸到形態登場的世代，不看本體編號', () => {
  // 阿羅拉九尾本體在關都，但形態屬第七世代阿羅拉。
  assert.equal(genKeyOf('ninetales-alola', { ndex: 38 }), 'g7');
  assert.equal(genKeyOf('typhlosion-hisui', { ndex: 157 }), 'hisui');
});

test('GENERATIONS 共九個世代且區間連續', () => {
  assert.equal(GENERATIONS.length, 9);
  assert.equal(GENERATIONS[0].min, 1);
  assert.equal(GENERATIONS[8].max, 1025);
});

test('whoPool：依池鍵從 nationalDex 取對應世代、穩定排序', () => {
  const saved = DATA.nationalDex;
  DATA.nationalDex = {
    bulbasaur: { ndex: 1, nameZh: '妙蛙種子' },
    charmander: { ndex: 4, nameZh: '小火龍' },
    chikorita: { ndex: 152, nameZh: '菊草葉' },
  };
  const g1 = whoPool('g1');
  assert.deepEqual(g1.map((p) => p.key), ['bulbasaur', 'charmander']);
  DATA.nationalDex = saved;
});
