import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateDoku, baseName, baseNameLen, cellSatisfied } from '../src/doku.js';

const dex = JSON.parse(await readFile(new URL('../src/data/dex-national.json', import.meta.url), 'utf8'));

test('每盤九格皆有解（≥2）且有 canonical，同 seed 完全可重現', () => {
  for (let i = 0; i < 60; i++) {
    const seed = `t-${i}`;
    const pz = generateDoku(seed, dex);
    assert.equal(pz.rows.length, 3);
    assert.equal(pz.cols.length, 3);
    assert.equal(pz.cells.length, 9);
    for (const cell of pz.cells) {
      assert.ok(cell.count >= 2, `cell ${cell.r},${cell.c} 只有 ${cell.count} 個解`);
      assert.ok(cell.canonicalKey, 'cell 缺 canonical');
    }
    // 決定性：同 seed → 同 6 標籤
    const pz2 = generateDoku(seed, dex);
    assert.deepEqual(pz.rows.map((c) => c.id), pz2.rows.map((c) => c.id));
    assert.deepEqual(pz.cols.map((c) => c.id), pz2.cols.map((c) => c.id));
  }
});

test('canonical 確實同時滿足該格的列與行條件', () => {
  const pz = generateDoku('canon-check', dex);
  for (const cell of pz.cells) {
    const entry = { key: cell.canonicalKey, ...dex[cell.canonicalKey] };
    assert.ok(cellSatisfied(entry, pz.rows[cell.r], pz.cols[cell.c]),
      `canonical ${cell.canonicalKey} 不滿足 ${pz.rows[cell.r].label} × ${pz.cols[cell.c].label}`);
  }
});

test('名字字數去形態前綴：超級/地區形態歸到本體名', () => {
  const len = (k) => Array.from(baseName({ key: k, ...dex[k] })).length;
  assert.equal(baseName({ key: 'charizard-mega-x', ...dex['charizard-mega-x'] }), '噴火龍');
  assert.equal(baseName({ key: 'ninetales-alola', ...dex['ninetales-alola'] }), '九尾');
  assert.equal(len('pikachu'), 3);
});

test('名字字數不算符號：括號、中黑點不計入', () => {
  // 帕底亞肯泰羅（鬥戰種）→ 去地區前綴「帕底亞」、去括號 →「肯泰羅鬥戰種」6 字
  assert.equal(baseNameLen({ key: 'tauros-paldea-combat-breed', ...dex['tauros-paldea-combat-breed'] }), 6);
  // 卡璞・鳴鳴 → 去中黑點 →「卡璞鳴鳴」4 字
  assert.equal(baseNameLen({ key: 'tapu-koko', ...dex['tapu-koko'] }), 4);
  assert.equal(baseNameLen({ key: 'pikachu', ...dex['pikachu'] }), 3);
});
