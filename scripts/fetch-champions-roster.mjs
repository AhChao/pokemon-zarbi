// 從 Serebii《冠軍》圖鑑索引爬出遊戲內所有 species，再用 PokéAPI varieties
// 展開成「預設形態 + 各 Mega」的 form 名清單，寫回 src/data/seasons.json 的 members。
//
// 流程設計（可靠性重點）：
//   1. 不靠 LLM 摘要——直接抓索引頁 HTML，用 regex 取 /pokedex-champions/<slug>/。
//   2. 每個 slug 丟 PokéAPI /pokemon-species 驗證；varieties 的 is_default 自動處理
//      像 pyroar→pyroar-male 這種陷阱，含 'mega' 的 variety 自動納入（PokéAPI 已收錄
//      《冠軍》新 Mega）。404 的 slug 會列出供人工覆核，不會靜默吞掉。
//   3. M-B = 全部；M-A = M-B 減掉已知的 M-B 新增（見 MB_ADDED）。
//
// 用法：node scripts/fetch-champions-roster.mjs  然後  npm run build:dex
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API = 'https://pokeapi.co/api/v2';
const INDEX = 'https://www.serebii.net/pokedex-champions/';
const CONCURRENCY = 8;

// M-B 相對 M-A 的新增（Serebii「Newly Useable」+ v1.1.0 新 Mega）。M-A = 全部減這些。
const MB_ADDED = new Set([
  'vileplume', 'qwilfish', 'sceptile', 'blaziken', 'swampert', 'mawile', 'metagross',
  'staraptor', 'musharna', 'scolipede', 'scrafty', 'eelektross', 'pyroar-male', 'malamar',
  'barbaracle', 'dragalge', 'grimmsnarl', 'falinks', 'overqwil', 'houndstone', 'annihilape', 'gholdengo',
  'sceptile-mega', 'blaziken-mega', 'swampert-mega', 'raichu-mega-x', 'raichu-mega-y',
  'staraptor-mega', 'scolipede-mega', 'scrafty-mega', 'eelektross-mega', 'pyroar-mega',
  'malamar-mega', 'barbaracle-mega', 'dragalge-mega', 'falinks-mega',
]);

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
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx]); }
  }));
  return out;
}

async function main() {
  console.log('crawling Serebii Champions pokédex index…');
  const html = await getText(INDEX);
  const slugs = [...new Set([...html.matchAll(/\/pokedex-champions\/([a-z0-9-]+)\//g)].map((m) => m[1]))]
    .filter((s) => s !== 'stat');
  console.log(`found ${slugs.length} species slugs`);

  const notFound = [];
  const perSpecies = await pool(slugs, async (slug) => {
    let species;
    try {
      species = await getJson(`${API}/pokemon-species/${slug}`);
    } catch {
      notFound.push(slug);
      return [];
    }
    const forms = [];
    for (const v of species.varieties) {
      const name = v.pokemon.name;
      if (v.is_default || name.includes('-mega')) forms.push(name);
    }
    return forms;
  }, CONCURRENCY);

  const all = [...new Set(perSpecies.flat())].sort();
  const ma = all.filter((n) => !MB_ADDED.has(n));

  const seasons = JSON.parse(await readFile(join(ROOT, 'src/data/seasons.json'), 'utf8'));
  seasons.seasons['m-a'].members = ma;
  seasons.seasons['m-b'].members = all;
  await writeFile(join(ROOT, 'src/data/seasons.json'), JSON.stringify(seasons, null, 2) + '\n');

  console.log(`M-A members: ${ma.length}`);
  console.log(`M-B members: ${all.length}`);
  if (notFound.length) {
    console.warn(`\n${notFound.length} slugs not on PokéAPI (人工覆核，必要時放 manual):\n` + notFound.join(', '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
