// 寶可夢數獨（3×3 象限盤面）。玩法參考 PokeDoku（pokedoku.com），為中文玩家改作。
// 6 個獨立類別標籤（3 列 + 3 行），每格＝該列 AND 該行條件的交集；任一符合的寶可夢都算對。
// 由 seed 確定性產生：同 seed → 同一盤（同 6 標籤、同解集），分享碼只需帶 seed。
// 類別只用現有 dex-national 資料導出：屬性 / 地區 / 純單屬性 / Mega / 名字字數。

import { TYPES } from './data/typechart.js';
import { typeName } from './i18n.js';
import { hashSeed, makeRng, makeRandom } from './rng.js';

// 地區：依國家圖鑑編號 ndex（地區形態仍歸本體所屬世代；此定義單純且 region×type 零空格）。
const REGIONS = [
  { key: 'g1', region: '關都', min: 1, max: 151 },
  { key: 'g2', region: '城都', min: 152, max: 251 },
  { key: 'g3', region: '豐緣', min: 252, max: 386 },
  { key: 'g4', region: '神奧', min: 387, max: 493 },
  { key: 'g5', region: '合眾', min: 494, max: 649 },
  { key: 'g6', region: '卡洛斯', min: 650, max: 721 },
  { key: 'g7', region: '阿羅拉', min: 722, max: 809 },
  { key: 'g8', region: '伽勒爾', min: 810, max: 905 },
  { key: 'g9', region: '帕底亞', min: 906, max: 1025 },
];

// 名字字數可用值（依分佈避開過冷門：2~6 字各有足量寶可夢）。
const NAME_LENGTHS = [2, 3, 4, 5, 6];

// 地區形態中文前綴：算「名字字數」時剝除，讓本體名不被形態污染（超級噴火龍X→噴火龍、阿羅拉九尾→九尾）。
const FORM_PREFIX = { '-alola': '阿羅拉', '-galar': '伽勒爾', '-hisui': '洗翠', '-paldea': '帕底亞' };

// 每格至少要有幾個合法解（避免出到過於冷門、近乎無解的格子）。
const MIN_ANSWERS = 2;
// 隨機挑 6 標籤並逐格驗證非空的嘗試上限；用盡則退回保證稠密的「地區×屬性」盤。
const MAX_ATTEMPTS = 4000;
// 結果列表上限（搜尋下拉一次最多顯示幾筆）。
export const PICK_RESULT_LIMIT = 40;

// 取本體中文名（去形態前綴與 Mega 尾碼），供「名字字數」判定。
export function baseName(entry) {
  let n = entry.nameZh || '';
  const key = entry.key || '';
  if (key.includes('-mega')) {
    if (n.startsWith('超級')) n = n.slice(2);
    n = n.replace(/[XYxy]$/, '');
  }
  for (const tag in FORM_PREFIX) {
    if (key.includes(tag) && n.startsWith(FORM_PREFIX[tag])) { n = n.slice(FORM_PREFIX[tag].length); break; }
  }
  return n;
}
// 算字數時略過的符號（中黑點／全半形括號／點／撇號／頓號）：
// 帕底亞肯泰羅（鬥戰種）算「肯泰羅鬥戰種」6 字、卡璞・鳴鳴算 4 字。
const NAME_PUNCT = /[・（）()．.’'、]/g;
export function baseNameLen(entry) {
  return Array.from(baseName(entry).replace(NAME_PUNCT, '')).length;
}

// 類別清單：每項都能放在任一軸。test 接受帶 key 的寶可夢物件。
function buildCategories() {
  const cats = [];
  for (const tk of TYPES) {
    cats.push({ id: `type:${tk}`, kind: 'type', value: tk, label: typeName(tk), test: (p) => p.types.includes(tk) });
  }
  for (const r of REGIONS) {
    cats.push({ id: `region:${r.key}`, kind: 'region', value: r.key, label: r.region, test: (p) => { const nd = p.ndex || 0; return nd >= r.min && nd <= r.max; } });
  }
  cats.push({ id: 'mono', kind: 'mono', value: null, label: '純單屬性', test: (p) => (p.types || []).length === 1 });
  cats.push({ id: 'mega', kind: 'mega', value: null, label: 'Mega', test: (p) => !!p.mega });
  for (const n of NAME_LENGTHS) {
    cats.push({ id: `len:${n}`, kind: 'namelen', value: n, label: `名字 ${n} 字`, test: (p) => baseNameLen(p) === n });
  }
  return cats;
}

// 兩集合交集是否至少 min（提早結束，不必數完）。
function intersectAtLeast(a, b, min) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const x of small) { if (big.has(x) && ++n >= min) return true; }
  return false;
}

// 由選定的列/行類別組出九格：各格存合法解數與 canonical（最易辨識：先非 Mega、再最小 ndex）。
function buildCells(rows, cols, members, pool) {
  const cells = [];
  for (let ri = 0; ri < 3; ri++) {
    for (let ci = 0; ci < 3; ci++) {
      const rs = members.get(rows[ri].id), cs = members.get(cols[ci].id);
      const [small, big] = rs.size <= cs.size ? [rs, cs] : [cs, rs];
      const ans = [];
      for (const x of small) if (big.has(x)) ans.push(pool[x]);
      ans.sort((a, b) => (a.mega ? 1 : 0) - (b.mega ? 1 : 0) || (a.ndex || 0) - (b.ndex || 0) || (a.key < b.key ? -1 : 1));
      const canon = ans[0];
      cells.push({
        r: ri, c: ci, count: ans.length,
        canonicalKey: canon.key, canonicalName: canon.nameZh, canonicalImage: canon.image, canonicalMega: !!canon.mega,
      });
    }
  }
  return cells;
}

// 產生一盤數獨。dexMap＝全國圖鑑物件（{ key: { ndex, nameZh, nameEn, types, mega, image } }）。
export function generateDoku(seed, dexMap) {
  const pool = Object.entries(dexMap || {}).map(([key, v]) => ({ key, ...v }));
  const cats = buildCategories();
  const members = new Map();
  for (const c of cats) {
    const s = new Set();
    pool.forEach((p, i) => { if (c.test(p)) s.add(i); });
    members.set(c.id, s);
  }
  // 太小的類別不參與組盤（避免近乎無解）。
  const usable = cats.filter((c) => members.get(c.id).size >= 6);

  const rng = makeRng(hashSeed(String(seed)));
  const rand = makeRandom(rng);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const six = rand.shuffle(usable).slice(0, 6);
    if (six.length < 6) break;
    const rows = six.slice(0, 3), cols = six.slice(3, 6);
    let ok = true;
    for (const r of rows) {
      for (const c of cols) {
        if (!intersectAtLeast(members.get(r.id), members.get(c.id), MIN_ANSWERS)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    return { mode: 'doku', seed: String(seed), rows, cols, cells: buildCells(rows, cols, members, pool) };
  }

  // 退路：地區×屬性必稠密（零空格、每格 ≥2），保證一定回得出盤。
  const rows = rand.shuffle(usable.filter((c) => c.kind === 'region')).slice(0, 3);
  const cols = rand.shuffle(usable.filter((c) => c.kind === 'type')).slice(0, 3);
  return { mode: 'doku', seed: String(seed), rows, cols, cells: buildCells(rows, cols, members, pool) };
}

// 某寶可夢是否滿足某格（該列 AND 該行）。entry 需帶 key（名字字數判定要用）。
export function cellSatisfied(entry, rowCat, colCat) {
  return rowCat.test(entry) && colCat.test(entry);
}
