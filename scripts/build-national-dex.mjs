// 產「全國圖鑑分世代」資料給「我是誰」用（涵蓋完整世代，含未進化）。
// 與 Champions 賽季名單脫鉤：我是誰的世代/地區池吃這份，速度測驗仍吃 pokedex.json。
//
// 流程：PokéAPI /generation/{1..9} → 每代 species → /pokemon-species 取中英名/ndex/varieties，
//       每個 variety 只收「預設形態 + Mega + 地區形態」（跳過 Gmax 等其他形態）。
//       立繪用官方 artwork URL（由 form id 組），名字用共用 formName。
// 用法：node scripts/build-national-dex.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formName } from './formname.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 12;
const REGION_TAGS = ['alola', 'galar', 'hisui', 'paldea'];

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const idFromUrl = (url) => { const m = url.match(/\/(\d+)\/?$/); return m ? Number(m[1]) : null; };
const imageOf = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
async function pool(items, worker, limit) {
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  }));
}

async function main() {
  const dex = {};
  const failed = [];
  for (let gen = 1; gen <= 9; gen++) {
    const g = await getJson(`${API}/generation/${gen}`);
    const species = g.pokemon_species.map((s) => s.name);
    process.stdout.write(`gen${gen}: ${species.length} species… `);
    await pool(species, async (name) => {
      let sp;
      try { sp = await getJson(`${API}/pokemon-species/${name}`); }
      catch { failed.push(name); return; }
      const en = sp.names.find((n) => n.language.name === 'en')?.name || name.replace(/-/g, ' ');
      const baseZh = sp.names.find((n) => n.language.name === 'zh-hant')?.name || en;
      const ndex = sp.id;
      for (const v of sp.varieties) {
        const vname = v.pokemon.name;
        const isMega = vname.includes('-mega');
        const isRegional = REGION_TAGS.some((t) => vname.includes(`-${t}`));
        if (!(v.is_default || isMega || isRegional)) continue; // 跳過 Gmax / 其他戰鬥形態
        let pk;
        try { pk = await getJson(v.pokemon.url); } catch { failed.push(vname); continue; }
        const types = pk.types.map((t) => t.type.name); // 屬性（地區形態屬性可能與本體不同）
        const image = pk.sprites?.other?.['official-artwork']?.front_default || imageOf(pk.id);
        const { zh: nameZh, en: nameEn, mega } = formName(vname, baseZh, en);
        dex[vname] = { ndex, nameZh, nameEn: nameEn.trim(), types, mega, image };
      }
    }, CONCURRENCY);
    console.log('done');
  }
  const sorted = Object.fromEntries(
    Object.keys(dex).sort((a, b) => (dex[a].ndex - dex[b].ndex) || (a < b ? -1 : 1)).map((k) => [k, dex[k]]),
  );
  await writeFile(join(ROOT, 'src/data/dex-national.json'), JSON.stringify(sorted, null, 2) + '\n');
  console.log(`wrote ${Object.keys(sorted).length} entries to src/data/dex-national.json`);
  if (failed.length) console.warn(`${failed.length} species failed: ${failed.slice(0, 20).join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
