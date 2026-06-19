// 寶可夢屬性相剋表（第六世代以後，含妖精屬性）。
// 純資料 + 純函式，無 DOM 依賴，可同時於瀏覽器與 node:test 使用。

// 18 個屬性的標準鍵序（攻擊/防禦矩陣皆用此順序）。
export const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

// 屬性顯示資料：官方代表色 + 各語系名稱。
export const TYPE_META = {
  normal:   { color: '#9FA19F', zh: '一般', en: 'Normal' },
  fire:     { color: '#E62829', zh: '火', en: 'Fire' },
  water:    { color: '#2980EF', zh: '水', en: 'Water' },
  electric: { color: '#FAC000', zh: '電', en: 'Electric' },
  grass:    { color: '#3FA129', zh: '草', en: 'Grass' },
  ice:      { color: '#3DCEF3', zh: '冰', en: 'Ice' },
  fighting: { color: '#FF8000', zh: '格鬥', en: 'Fighting' },
  poison:   { color: '#9141CB', zh: '毒', en: 'Poison' },
  ground:   { color: '#915121', zh: '地面', en: 'Ground' },
  flying:   { color: '#81B9EF', zh: '飛行', en: 'Flying' },
  psychic:  { color: '#EF4179', zh: '超能力', en: 'Psychic' },
  bug:      { color: '#91A119', zh: '蟲', en: 'Bug' },
  rock:     { color: '#AFA981', zh: '岩石', en: 'Rock' },
  ghost:    { color: '#704170', zh: '幽靈', en: 'Ghost' },
  dragon:   { color: '#5060E1', zh: '龍', en: 'Dragon' },
  dark:     { color: '#624D4E', zh: '惡', en: 'Dark' },
  steel:    { color: '#60A1B8', zh: '鋼', en: 'Steel' },
  fairy:    { color: '#EF70EF', zh: '妖精', en: 'Fairy' },
};

// 相剋偏差表：只記錄非 1× 的攻擊→防禦倍率，其餘預設 1×。
// 鍵為攻擊屬性，值為 { 防禦屬性: 倍率 }。
const EFFECT = {
  normal:   { rock: 0.5, ghost: 0, steel: 0.5 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice:      { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison:   { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying:   { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic:  { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug:      { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock:     { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon:   { dragon: 2, steel: 0.5, fairy: 0 },
  dark:     { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel:    { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy:    { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

// 單一攻擊屬性對單一防禦屬性的倍率。
export function singleMultiplier(atk, def) {
  const row = EFFECT[atk];
  if (!row) throw new Error(`unknown attacking type: ${atk}`);
  return def in row ? row[def] : 1;
}

// 攻擊屬性對一或兩個防禦屬性的總倍率（雙屬性取乘積）。
export function multiplier(atk, defTypes) {
  const defs = Array.isArray(defTypes) ? defTypes : [defTypes];
  return defs.reduce((acc, def) => acc * singleMultiplier(atk, def), 1);
}

// 把倍率轉成簡短顯示字串。
export function formatMultiplier(m) {
  if (m === 0) return '0×';
  if (m === 0.25) return '¼×';
  if (m === 0.5) return '½×';
  return `${m}×`;
}
