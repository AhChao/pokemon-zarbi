// 由 src/data/seasons.json 的名單，向 PokéAPI 抓「種族值速度 + 中/英名 + 立繪」，
// 產出 src/data/pokedex.json。離線執行一次（`npm run build:dex`），runtime 不抓 API。
//
// 用法：node scripts/build-pokedex.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 8;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// 判斷 Mega 型態並取 X/Y/Z 標記（無標記則 tag=''）。
function megaForm(name) {
  if (!name.includes('-mega')) return null;
  if (name.endsWith('-mega-x')) return { tag: 'X' };
  if (name.endsWith('-mega-y')) return { tag: 'Y' };
  if (name.endsWith('-mega-z')) return { tag: 'Z' };
  return { tag: '' };
}

// PokéAPI 的 stat 名 → 我們的短鍵。
const STAT_KEYS = {
  hp: 'hp', attack: 'atk', defense: 'def',
  'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe',
};

async function fetchEntry(name) {
  const p = await getJson(`${API}/pokemon/${name}`);
  // 完整種族值：種族值幾乎不會調整，存成本地靜態資料（可離線分析、解鎖 BST 模式）。
  const stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const s of p.stats) {
    const k = STAT_KEYS[s.stat.name];
    if (k) stats[k] = s.base_stat;
  }
  const bst = stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;
  const speed = stats.spe;
  const image = p.sprites?.other?.['official-artwork']?.front_default
    || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`;

  const species = await getJson(p.species.url);
  const zh = species.names.find((n) => n.language.name === 'zh-hant')?.name;
  const enBase = species.names.find((n) => n.language.name === 'en')?.name
    || name.replace(/-/g, ' ');

  const mf = megaForm(name);
  const isMega = Boolean(mf);
  const baseZh = zh || enBase;
  // 官方中文 Mega 命名：「超級」+ 名稱（+ X/Y/Z，無空格）；英文維持「Mega ...」。
  const nameZh = isMega ? `超級${baseZh}${mf.tag}` : baseZh;
  const nameEn = isMega ? `Mega ${enBase}${mf.tag ? ' ' + mf.tag : ''}` : enBase;

  return { key: name, dex: p.id, speed, stats, bst, nameZh, nameEn: nameEn.trim(), image, mega: isMega };
}

async function pool(items, worker, limit) {
  const out = [];
  let i = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

async function main() {
  const seasonsRaw = JSON.parse(await readFile(join(ROOT, 'src/data/seasons.json'), 'utf8'));
  const names = new Set();
  for (const s of Object.values(seasonsRaw.seasons)) {
    for (const m of s.members) names.add(m);
  }
  const manual = { ...seasonsRaw.manual };
  delete manual.$comment;
  // 手動條目不向 API 抓。
  for (const k of Object.keys(manual)) names.delete(k);

  const list = [...names];
  console.log(`fetching ${list.length} entries from PokéAPI (concurrency ${CONCURRENCY})…`);

  const dex = {};
  const failed = [];
  const results = await pool(list, async (name) => {
    try {
      return await fetchEntry(name);
    } catch (e) {
      failed.push(`${name}: ${e.message}`);
      return null;
    }
  }, CONCURRENCY);

  for (const r of results) if (r) dex[r.key] = { dex: r.dex, speed: r.speed, stats: r.stats, bst: r.bst, nameZh: r.nameZh, nameEn: r.nameEn, image: r.image, mega: r.mega };
  for (const [k, v] of Object.entries(manual)) dex[k] = v;

  // 依 key 排序，產生穩定輸出（quiz 重現所需的決定性）。
  const sorted = Object.fromEntries(Object.keys(dex).sort().map((k) => [k, dex[k]]));
  await writeFile(join(ROOT, 'src/data/pokedex.json'), JSON.stringify(sorted, null, 2) + '\n');

  console.log(`wrote ${Object.keys(sorted).length} entries to src/data/pokedex.json`);
  if (failed.length) console.warn(`\n${failed.length} failed (補到 seasons.json 的 manual 區塊):\n` + failed.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
