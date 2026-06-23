import test from 'node:test';
import assert from 'node:assert/strict';
import { monDefenseBuckets, monOffenseBuckets } from '../src/coverage.js';

test('防禦桶：純火系被水/地面/岩石剋（2×），抵抗火/草/冰/蟲/鋼/妖', () => {
  const b = monDefenseBuckets(['fire']);
  for (const a of ['water', 'ground', 'rock']) assert.ok(b.weak.includes(a), `${a} 應為弱點`);
  for (const a of ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy']) assert.ok(b.resist.includes(a), `${a} 應被抵抗`);
  assert.equal(b.quad.length, 0);
  assert.equal(b.immune.length, 0);
});

test('防禦桶：雙屬性取乘積，會出現 4× 與免疫', () => {
  // 草/地面（如 土台龜）：冰 2×2=4×；對地面免疫的攻擊不存在，但飛行對它 2×。
  const grassGround = monDefenseBuckets(['grass', 'ground']);
  assert.ok(grassGround.quad.includes('ice'), '冰應 4× 剋草/地面');
  // 幽靈/一般（不存在的組合僅測免疫邏輯）：用 ghost 對 normal 免疫
  const ghost = monDefenseBuckets(['ghost']);
  assert.ok(ghost.immune.includes('normal') && ghost.immune.includes('fighting'));
});

test('攻擊桶：本系剋制可達 3×（STAB ×1.5）', () => {
  // 水招且本系（def 含 water）：水 2× 的對象（火/地面/岩石）×1.5 = 3×。
  const stab = monOffenseBuckets(['water'], ['water']);
  for (const d of ['fire', 'ground', 'rock']) assert.ok(stab.strong.includes(d), `${d} 應被本系水招 3× 打`);
  // 非本系（def 不含 water）：最高只 2×，沒有 3×。
  const noStab = monOffenseBuckets(['water'], ['fire']);
  assert.equal(noStab.strong.length, 0);
});

test('攻擊桶：完全沒效歸 noeffect（一般招打幽靈）', () => {
  const b = monOffenseBuckets(['normal'], ['normal']);
  assert.ok(b.noeffect.includes('ghost'));
});
