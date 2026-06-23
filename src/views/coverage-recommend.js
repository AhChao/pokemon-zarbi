// 聯防：從當前 VGC 雙打 meta 使用率，挑最能補隊伍攻守破洞的人（被 coverage 隊伍總評呼叫）。
import { TYPE_META, multiplier, singleMultiplier } from '../data/typechart.js';
import { t } from '../i18n.js';
import { DATA } from '../state.js';
import { badge, el, esc, typeIcon } from '../ui.js';



// 從 meta top-50（Champions Lab, VGC 雙打）挑最能補本隊攻守破洞的人，並點名補哪一招。
// 防守補＝候選屬性抵抗（≤0.5×）某防守洞；攻擊補＝候選某招（含本系 STAB）打某攻擊洞 ≥2×。
// 綜合分 = 防守補數 + 攻擊補數，兩邊都補再 ×1.5（優先度更高）。取 top 5。
export function buildUsageRecommender(defHoles, offHoles) {
  const list = DATA.usageData && DATA.usageData.list;
  if (!list || !list.length) return null;
  if (!defHoles.length && !offHoles.length) return null;

  const scored = [];
  for (const c of list) {
    const types = c.types || [];
    const defFix = defHoles.filter((a) => multiplier(a, types) <= 0.5);
    const offFix = [];
    for (const d of offHoles) {
      let best = null;
      for (const mv of c.moves || []) {
        const mult = singleMultiplier(mv.type, d) * (types.includes(mv.type) ? 1.5 : 1);
        if (mult >= 2 && (!best || mult > best.mult)) best = { hole: d, move: mv, mult };
      }
      if (best) offFix.push(best);
    }
    if (!defFix.length && !offFix.length) continue;
    const dual = defFix.length > 0 && offFix.length > 0;
    const score = (defFix.length + offFix.length) * (dual ? 1.5 : 1);
    scored.push({ c, defFix, offFix, score, dual });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || (b.c.usagePct || 0) - (a.c.usagePct || 0));

  const card = el(`<div class="ct-summary ct-rec">
    <h3>${esc(t('chart.tool.team.recTitle'))}</h3>
    <p class="ct-rec__sub">${esc(t('chart.tool.team.recSub'))}</p>
  </div>`);
  scored.slice(0, 5).forEach((s, i) => {
    const c = s.c;
    const img = (DATA.pokedex[c.key] && DATA.pokedex[c.key].image) || '';
    const dualTag = s.dual ? `<span class="ct-rec__dual">${esc(t('chart.tool.team.recDual'))}</span>` : '';
    const row = el(`<div class="ct-rec__row">
      <div class="ct-rec__head">
        <span class="ct-rec__rank">#${i + 1}</span>
        ${img ? `<img class="ct-rec__art" src="${esc(img)}" alt="${esc(c.nameZh)}" loading="lazy" />` : ''}
        <span class="ct-rec__name">${esc(c.nameZh)}</span>
        <span class="ct-rec__use">${esc(t('chart.tool.team.recUse', { p: (c.usagePct ?? 0).toFixed(1) }))}</span>
        ${dualTag}
      </div>
    </div>`);
  const body = el('<div class="ct-rec__body"></div>');
    if (s.defFix.length) {
      body.insertAdjacentHTML('beforeend',
        `<div class="ct-rec__line"><span class="ct-rec__k ct-rec__k--def">${esc(t('chart.tool.team.recDef'))}</span><span class="ct-rec__v">${s.defFix.map((a) => badge(a)).join('')}</span></div>`);
    }
    if (s.offFix.length) {
      const items = s.offFix.map((f) =>
        `<span class="ct-rec__atk">${badge(f.hole)}<span class="ct-rec__via">${esc(t('chart.tool.team.recVia'))}</span><span class="ct-rec__move" style="background:${TYPE_META[f.move.type].color}">${typeIcon(f.move.type)}${esc(f.move.nameZh || f.move.nameEn)}</span></span>`).join('');
      body.insertAdjacentHTML('beforeend',
        `<div class="ct-rec__line"><span class="ct-rec__k ct-rec__k--atk">${esc(t('chart.tool.team.recAtk'))}</span><span class="ct-rec__v">${items}</span></div>`);
    }
    row.appendChild(body);
    card.appendChild(row);
  });
  card.insertAdjacentHTML('beforeend', `<p class="ct-rec__src">${esc(t('chart.tool.team.recSrc'))}</p>`);
  return card;
}
