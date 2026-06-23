// 「我是誰」共用純邏輯：地區前綴判斷與提示字串產生。被 quiz / master / builder 三個畫面共用。
import { esc } from './ui.js';

// 地區形態的中文前綴：提示時整段直接顯示（露「阿」這種前綴第一個字沒意義）。
export const REGION_ZH = { alola: '阿羅拉', galar: '伽勒爾', hisui: '洗翠', paldea: '帕底亞' };
export function regionPrefixOf(q) {
  for (const tag in REGION_ZH) {
    if (q.key && q.key.includes(`-${tag}`) && q.nameZh.startsWith(REGION_ZH[tag])) return REGION_ZH[tag];
  }
  return '';
}

// 我是誰提示：veryeasy/easy 露第一個字、其餘 ○；normal 全 ○；hard 無提示。
// 地區形態：前綴（阿羅拉/洗翠…）整段直接顯示，提示套用在前綴後的本體名。
export function whoHint(q, difficulty) {
  if (difficulty === 'hard') return '';
  const prefix = regionPrefixOf(q);
  const lead = prefix ? `<strong>${esc(prefix)}</strong> ` : '';
  const chars = Array.from(prefix ? q.nameZh.slice(prefix.length) : q.nameZh);
  if (difficulty === 'veryeasy' || difficulty === 'easy') {
    return lead + chars.map((c, i) => (i === 0 ? `<strong>${esc(c)}</strong>` : '○')).join(' ');
  }
  if (difficulty === 'normal') {
    return lead + chars.map(() => '○').join(' ');
  }
  return '';
}
