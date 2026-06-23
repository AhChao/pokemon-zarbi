// 聯防（我的隊伍）核心純數學：把單隻的攻守倍率分桶。不碰 DOM，可單獨 node --test。
import { TYPES, multiplier, singleMultiplier } from './data/typechart.js';

// 單隻防禦面：18 個攻擊屬性打這隻（雙屬性取乘積）各落在哪個倍率桶。
export function monDefenseBuckets(defTypes) {
  const quad = [], weak = [], resist = [], qresist = [], immune = [];
  for (const a of TYPES) {
    const m = multiplier(a, defTypes);
    if (m === 4) quad.push(a);
    else if (m === 2) weak.push(a);
    else if (m === 0) immune.push(a);
    else if (m === 0.25) qresist.push(a);
    else if (m === 0.5) resist.push(a);
  }
  return { quad, weak, resist, qresist, immune };
}

// 單隻攻擊面：每個防守屬性取最佳招式倍率（含本系 STAB ×1.5，本系剋制可達 3×）。
// strong＝能打到 3× 以上、resisted＝最佳也 <1（被抵抗）、noeffect＝完全沒效。
export function monOffenseBuckets(atkTypes, defTypes) {
  const stab = (mv) => (defTypes.includes(mv) ? 1.5 : 1);
  const strong = [], resisted = [], noeffect = [];
  for (const d of TYPES) {
    const best = Math.max(...atkTypes.map((mv) => singleMultiplier(mv, d) * stab(mv)));
    if (best === 0) noeffect.push(d);
    else if (best >= 3) strong.push(d);
    else if (best < 1) resisted.push(d);
  }
  return { strong, resisted, noeffect };
}
