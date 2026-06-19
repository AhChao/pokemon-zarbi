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

// 把 form 名整理成顯示用後綴（Mega / Mega X / Mega Y）。
function megaSuffix(name) {
  if (!name.includes('-mega')) return null;
  if (name.endsWith('-mega-x')) return { zh: ' Mega X', en: ' Mega X' };
  if (name.endsWith('-mega-y')) return { zh: ' Mega Y', en: ' Mega Y' };
  if (name.endsWith('-mega-z')) return { zh: ' Mega Z', en: ' Mega Z' };
  return { zh: ' Mega', en: ' Mega' };
}

async function fetchEntry(name) {
  const p = await getJson(`${API}/pokemon/${name}`);
  const speed = p.stats.find((s) => s.stat.name === 'speed').base_stat;
  const image = p.sprites?.other?.['official-artwork']?.front_default
    || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`;

  const species = await getJson(p.species.url);
  const zh = species.names.find((n) => n.language.name === 'zh-hant')?.name;
  const enBase = species.names.find((n) => n.language.name === 'en')?.name
    || name.replace(/-/g, ' ');

  const suf = megaSuffix(name);
  const isMega = Boolean(suf);
  const nameZh = (zh || enBase) + (suf ? suf.zh : '');
  const nameEn = (suf ? 'Mega ' : '') + enBase + (suf && suf.en !== ' Mega' ? suf.en.replace(' Mega', '') : '');

  return { key: name, dex: p.id, speed, nameZh, nameEn: nameEn.trim(), image, mega: isMega };
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

  for (const r of results) if (r) dex[r.key] = { dex: r.dex, speed: r.speed, nameZh: r.nameZh, nameEn: r.nameEn, image: r.image, mega: r.mega };
  for (const [k, v] of Object.entries(manual)) dex[k] = v;

  // 依 key 排序，產生穩定輸出（quiz 重現所需的決定性）。
  const sorted = Object.fromEntries(Object.keys(dex).sort().map((k) => [k, dex[k]]));
  await writeFile(join(ROOT, 'src/data/pokedex.json'), JSON.stringify(sorted, null, 2) + '\n');

  console.log(`wrote ${Object.keys(sorted).length} entries to src/data/pokedex.json`);
  if (failed.length) console.warn(`\n${failed.length} failed (補到 seasons.json 的 manual 區塊):\n` + failed.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
