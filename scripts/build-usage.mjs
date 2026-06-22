// 產生 src/data/usage.json：當前 Champions VGC（雙打）meta 使用率 top-N，
// 每隻附防守屬性（給聯防補洞）+ 常見配招的打擊屬性（給攻擊補洞建議）。
//
// 資料源：Champions Lab（https://championslab.xyz，開源、README 標 MIT）。
//   - simulation-data.ts  SIM_POKEMON  → 排名（appearances）、isMega、name
//   - usage-data.ts       USAGE_DATA   → 每隻常見配招 moves（以 base dex id 為 key）
//   - move-data.ts        MOVE_DATA    → 招名 → type / category（過濾 status）
// 屬性與中英名取自本 repo 已產生的 pokedex.json（含 Mega 各 form）。
// 署名見 DEVELOPMENT.md。runtime 不抓 API：build 時抓快照烤進 usage.json。
//
// 用法：npm run build:usage
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/Andrew21P/ChampionsLab/main/src/lib';
const SOURCES = {
  sim: `${RAW}/simulation-data.ts`,
  sets: `${RAW}/usage-data.ts`,
  moves: `${RAW}/engine/move-data.ts`,
};
const TOP_N = 50;

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
async function pool(items, worker, limit) {
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  }));
}
// Champions 招名 → PokéAPI move slug（小寫、去撇號/句點、空白轉連字號；既有連字號保留）。
const moveSlug = (name) => name.toLowerCase().replace(/['’.]/g, '').replace(/\s+/g, '-');

// 安全解析：這三個檔是 prettier 格式化的「自動產生資料」，欄位順序穩定。
// 一律用「鎖定欄位」的 regex 抽取——絕不執行（eval/Function）遠端內容。

// MOVE_DATA：每筆開頭固定 name → type → category；過濾 status 由呼叫端做。
function parseMoves(src) {
  const map = new Map();
  const re = /"([^"]+)":\s*\{\s*name:\s*"[^"]*",\s*type:\s*"([a-z]+)",\s*category:\s*"(physical|special|status)"/g;
  for (const m of src.matchAll(re)) map.set(m[1], { type: m[2], category: m[3] });
  return map;
}

// SIM_POKEMON：每個條目開頭固定 "id" → "name" → "isMega"，appearances 為其後的純量欄位。
function parseSim(src) {
  const out = [];
  const re = /"\d+(?:-mega)?":\s*\{\s*"id":\s*(\d+),\s*"name":\s*"([^"]+)",\s*"isMega":\s*(true|false),[\s\S]*?"appearances":\s*(\d+)/g;
  for (const m of src.matchAll(re)) {
    out.push({ id: +m[1], name: m[2], isMega: m[3] === 'true', appearances: +m[4] });
  }
  return out;
}

// USAGE_DATA：頂層 `  <id>: [ … ],`（2 空格縮排）。各 set 內 moves 陣列只含字串、無巢狀括號。
function parseUsageSets(src) {
  const map = new Map(); // baseId → Set(moveName)
  const block = /^ {2}(\d+): \[\n([\s\S]*?)\n {2}\],?$/gm;
  for (const b of src.matchAll(block)) {
    const id = +b[1];
    const set = map.get(id) || new Set();
    for (const mv of b[2].matchAll(/\bmoves:\s*\[([^\]]*)\]/g)) {
      for (const s of mv[1].matchAll(/"([^"]+)"/g)) set.add(s[1]);
    }
    map.set(id, set);
  }
  return map;
}

function main() { return run(); }
async function run() {
  console.log('fetching Champions Lab data…');
  const [simSrc, setsSrc, moveSrc] = await Promise.all([
    getText(SOURCES.sim), getText(SOURCES.sets), getText(SOURCES.moves),
  ]);
  const SIM = parseSim(simSrc);          // [{id,name,isMega,appearances}]
  const SETS = parseUsageSets(setsSrc);  // Map<baseId, Set<moveName>>
  const MOVES = parseMoves(moveSrc);     // Map<moveName, {type,category}>
  console.log(`SIM ${SIM.length} / USAGE_DATA ${SETS.size} ids / MOVE_DATA ${MOVES.size}`);
  if (!SIM.length || !SETS.size || !MOVES.size) throw new Error('parse 失敗：某來源 0 筆，檢查上游格式是否變動');

  const dex = JSON.parse(await readFile(join(ROOT, 'src/data/pokedex.json'), 'utf8'));
  const REGIONAL = /-(alola|galar|hisui|paldea)/;
  const descOf = (key) => dex[key] && { key, mega: !!dex[key].mega, types: dex[key].types || [], nameZh: dex[key].nameZh, nameEn: dex[key].nameEn };
  // ndex → [desc]，給 sim 條目對映 form；nameEn→base key 給地區形態通用 fallback。
  const byNdex = new Map();
  const baseKeyByNameEn = new Map();
  for (const [key, e] of Object.entries(dex)) {
    const n = e.ndex ?? e.dex;
    if (!byNdex.has(n)) byNdex.set(n, []);
    byNdex.get(n).push({ ...descOf(key), regional: REGIONAL.test(key) });
    if (!e.mega && !REGIONAL.test(key)) baseKeyByNameEn.set(e.nameEn, key);
  }
  // 地區/特殊形態：Champions Lab 用 alt-form id（與 base ndex 不同），改用 sim.name 對映。
  // Tauros 三 breed 與 Arcanine-Hisui 在我們名單且屬性正確 → 別名；通用地區形態走 nameEn+尾碼。
  const FORM_ALIAS = new Map([
    ['Paldean Tauros (Aqua)', 'tauros-paldea-aqua-breed'],
    ['Paldean Tauros (Blaze)', 'tauros-paldea-blaze-breed'],
    ['Paldean Tauros (Combat)', 'tauros-paldea-combat-breed'],
    ['Paldean Tauros', 'tauros-paldea-combat-breed'],
    ['Hisuian Arcanine', 'arcanine-hisui'],
  ]);
  const REGION_SUFFIX = { Alolan: 'alola', Galarian: 'galar', Hisuian: 'hisui' };
  // sim 條目（id + isMega + name）→ pokedex form desc（對不到回 null，由呼叫端記 log）。
  const resolveForm = (sim) => {
    if (FORM_ALIAS.has(sim.name)) return descOf(FORM_ALIAS.get(sim.name)) || null;
    const rm = /^(Alolan|Galarian|Hisuian) (.+)$/.exec(sim.name);
    if (rm) { const base = baseKeyByNameEn.get(rm[2]); const k = base && `${base}-${REGION_SUFFIX[rm[1]]}`; if (k && dex[k]) return descOf(k); }
    const cands = byNdex.get(sim.id) || [];
    if (!cands.length) return null;
    if (sim.isMega) {
      const megas = cands.filter((c) => c.mega);
      if (megas.length <= 1) return megas[0] || null;
      // X/Y/Z 多形態：用 sim.name 尾碼對 key 尾碼。
      const tag = (sim.name.match(/\b([XYZ])\b/) || [])[1];
      if (tag) return megas.find((c) => c.key.endsWith(`-mega-${tag.toLowerCase()}`)) || megas[0];
      return megas[0];
    }
    // 非 Mega：優先 base（非 mega、非地區形態）。
    return cands.find((c) => !c.mega && !c.regional) || cands.find((c) => !c.mega) || null;
  };

  // 排名：appearances 由高到低。
  const ranked = SIM
    .filter((s) => s && typeof s.appearances === 'number')
    .sort((a, b) => b.appearances - a.appearances);
  const totalApp = ranked.reduce((s, x) => s + x.appearances, 0) || 1;

  const out = [];
  const unmatched = [];
  for (const sim of ranked) {
    if (out.length >= TOP_N) break;
    const form = resolveForm(sim);
    if (!form) { unmatched.push(`${sim.id}${sim.isMega ? '-mega' : ''} ${sim.name}`); continue; }
    // 招式打擊屬性：USAGE_DATA 以 base id 為 key，蒐集該 id 全部 set 的招式，
    // 經 MOVE_DATA 取 type、過濾 status。
    const moves = [];
    for (const mvName of SETS.get(sim.id) || []) {
      const md = MOVES.get(mvName);
      if (!md || md.category === 'status') continue;
      moves.push({ nameEn: mvName, type: md.type });
    }
    out.push({
      key: form.key,
      ndex: sim.id,
      nameZh: form.nameZh,
      nameEn: form.nameEn,
      isMega: !!sim.isMega,
      rank: out.length + 1,
      usagePct: +(sim.appearances / totalApp * 100).toFixed(2),
      types: form.types,
      moveTypes: [...new Set(moves.map((m) => m.type))],
      moves,
    });
  }

  // 中文招名：Champions Lab 沒有 → 從 PokéAPI /move 取 zh-Hant（top-50 用到的招式去重後抓）。
  const moveNames = [...new Set(out.flatMap((o) => o.moves.map((m) => m.nameEn)))];
  const zhMap = new Map();
  const noZh = [];
  await pool(moveNames, async (name) => {
    try {
      const j = await getJson(`https://pokeapi.co/api/v2/move/${moveSlug(name)}`);
      const zh = (j.names || []).find((n) => /zh-?hant/i.test(n.language?.name || ''));
      if (zh?.name) zhMap.set(name, zh.name); else noZh.push(name);
    } catch { noZh.push(name); }
  }, 8);
  for (const o of out) for (const m of o.moves) m.nameZh = zhMap.get(m.nameEn) || m.nameEn;
  console.log(`move zh: ${zhMap.size}/${moveNames.length} 取得` + (noZh.length ? `（回退英文：${noZh.join(', ')}）` : ''));

  await writeFile(join(ROOT, 'src/data/usage.json'),
    JSON.stringify({
      $comment: 'build:usage 由 Champions Lab（championslab.xyz, MIT）資料產生；VGC 雙打 meta top-50；勿手改，跑 npm run build:usage 重產。',
      $source: 'https://championslab.xyz',
      format: 'vgc-doubles',
      generatedFrom: 'champions-lab',
      list: out,
    }, null, 2) + '\n');

  console.log(`wrote ${out.length} entries to src/data/usage.json`);
  console.log('top 8:', out.slice(0, 8).map((o) => `${o.rank}.${o.nameZh}${o.isMega ? '(M)' : ''}`).join('  '));
  if (unmatched.length) console.warn(`\n${unmatched.length} sim 條目對不到 pokedex form（人工覆核）:\n  ` + unmatched.join('\n  '));
}

main().catch((e) => { console.error(e); process.exit(1); });
