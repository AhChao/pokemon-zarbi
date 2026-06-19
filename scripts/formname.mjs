// 由 PokéAPI form 名 + 種族中/英名，產官方顯示名。
// Mega → 「超級…X/Y/Z」/「Mega …」；地區形態 → 「阿羅拉/伽勒爾/洗翠/帕底亞…」/「Alolan…」；
// 帕底亞肯泰羅再分 breed（鬥戰/火炎/流水種）。build-pokedex 與 build-national-dex 共用，避免命名漂移。

const REGION = {
  alola: { zh: '阿羅拉', en: 'Alolan' },
  galar: { zh: '伽勒爾', en: 'Galarian' },
  hisui: { zh: '洗翠', en: 'Hisuian' },
  paldea: { zh: '帕底亞', en: 'Paldean' },
};
const BREED = {
  'combat-breed': { zh: '鬥戰種', en: 'Combat Breed' },
  'blaze-breed': { zh: '火炎種', en: 'Blaze Breed' },
  'aqua-breed': { zh: '流水種', en: 'Aqua Breed' },
};

export function megaTag(name) {
  if (!name.includes('-mega')) return null;
  if (name.endsWith('-mega-x')) return 'X';
  if (name.endsWith('-mega-y')) return 'Y';
  if (name.endsWith('-mega-z')) return 'Z';
  return '';
}

// 回傳 { zh, en, mega }。
export function formName(name, baseZh, enBase) {
  const mt = megaTag(name);
  if (mt !== null) {
    return { zh: `超級${baseZh}${mt}`, en: `Mega ${enBase}${mt ? ' ' + mt : ''}`, mega: true };
  }
  for (const [tag, r] of Object.entries(REGION)) {
    if (name.includes(`-${tag}`)) {
      let zh = `${r.zh}${baseZh}`;
      let en = `${r.en} ${enBase}`;
      for (const [suffix, b] of Object.entries(BREED)) {
        if (name.includes(suffix)) { zh += `（${b.zh}）`; en += ` (${b.en})`; break; }
      }
      return { zh, en, mega: false };
    }
  }
  return { zh: baseZh, en: enBase, mega: false };
}
