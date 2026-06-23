// 聯防：當攻擊方／當防守方（屬性組）模式——目前未啟用、停放於此保留邏輯，未來可由 buildChartTool 重新接回。
import { TYPES, TYPE_META, formatMultiplier, singleMultiplier } from '../data/typechart.js';
import { t, typeName } from '../i18n.js';
import { badge, el, esc, typeIcon, uiIcon } from '../ui.js';
import { chartToolState } from './coverage.js';



// 攻擊方／防守方：選一組屬性，當成隊伍綜合（攻取 min＝最不痛一擊、防取 max＝最痛被打）。
export function buildSetTool() {
  const wrap = el(`
    <div class="ct-set">
      <p class="label ct-picked-label"></p>
      <div class="ct-picked"></div>
      <p class="muted ct-add-hint">${esc(t('chart.tool.add'))}</p>
      <div class="type-grid ct-grid"></div>
      <div class="ct-result"></div>
    </div>`);
  const pickedLabel = wrap.querySelector('.ct-picked-label');
  const pickedBox = wrap.querySelector('.ct-picked');
  const grid = wrap.querySelector('.ct-grid');
  const resultBox = wrap.querySelector('.ct-result');
  const isAtk = () => chartToolState.mode === 'atk';

  const syncGrid = () => grid.querySelectorAll('.type-pick').forEach((b, i) =>
    b.setAttribute('aria-pressed', String(chartToolState.picks.includes(TYPES[i]))));

  const togglePick = (tk) => {
    chartToolState.picks = chartToolState.picks.includes(tk)
      ? chartToolState.picks.filter((x) => x !== tk)
      : [...chartToolState.picks, tk];
    syncGrid();
    renderPicked();
    renderResult();
  };

  const renderPicked = () => {
    pickedLabel.textContent = t('chart.tool.picked', { n: chartToolState.picks.length });
    pickedBox.innerHTML = '';
    if (!chartToolState.picks.length) {
      pickedBox.appendChild(el(`<span class="ct-empty">${esc(t('chart.tool.empty'))}</span>`));
      return;
    }
    chartToolState.picks.forEach((tk) => {
      const m = TYPE_META[tk];
      const chip = el(`<button class="ct-chip" style="background:${m.color}" aria-label="${esc(t('chart.tool.remove', { name: typeName(tk) }))}">${typeIcon(tk)}<span>${esc(typeName(tk))}</span>${uiIcon('close')}</button>`);
      chip.onclick = () => togglePick(tk);
      pickedBox.appendChild(chip);
    });
  };

  // 把選的屬性當成一個隊伍綜合：對每個「對手屬性」聚合成單一倍率。
  // 攻擊方取 min（最不痛的一擊打多少）、防守方取 max（最痛被打多少）；對我方不利的那桶 highlight。
  const buildCombined = () => {
    const atk = isAtk();
    const aggOf = (other) => {
      const vals = chartToolState.picks.map((p) =>
        atk ? singleMultiplier(p, other) : singleMultiplier(other, p));
      return atk ? Math.min(...vals) : Math.max(...vals);
    };
    // 每桶：倍率、危險與否、好（安全）與否、文案；依危險度排序（危險者在前）。
    const buckets = atk
      ? [
          { v: 0,   danger: true,  key: 'chart.tool.cov.none' },
          { v: 0.5, danger: true,  key: 'chart.tool.cov.weak' },
          { v: 1,   key: 'chart.tool.cov.ok1' },
          { v: 2,   good: true,    key: 'chart.tool.cov.good' },
        ]
      : [
          { v: 2,   danger: true,  key: 'chart.tool.def.hurt' },
          { v: 1,   key: 'chart.tool.def.plain' },
          { v: 0.5, good: true,    key: 'chart.tool.def.resist' },
          { v: 0,   good: true,    key: 'chart.tool.def.immune' },
        ];
    const wrap = el('<div class="ct-combined"></div>');
    wrap.appendChild(el(`<p class="ct-explain">${esc(atk ? t('chart.tool.atkExplain') : t('chart.tool.defExplain'))}</p>`));
    buckets.forEach((b) => {
      const list = TYPES.filter((other) => aggOf(other) === b.v);
      if (!list.length) return;
      const cls = b.danger ? ' ct-bucket--danger' : b.good ? ' ct-bucket--safe' : '';
      wrap.appendChild(el(`<div class="ct-bucket${cls}">
        <span class="ct-bucket__k">${esc(formatMultiplier(b.v))}<small>${esc(t(b.key))}</small></span>
        <span class="ct-bucket__v">${list.map((o) => badge(o)).join('')}</span>
      </div>`));
    });
    return wrap;
  };

  const renderResult = () => {
    resultBox.innerHTML = '';
    if (!chartToolState.picks.length) {
      resultBox.appendChild(el(`<p class="ct-hint">${esc(t('chart.tool.pickPrompt'))}</p>`));
      return;
    }
    resultBox.appendChild(buildCombined());
  };

  TYPES.forEach((tk) => {
    const m = TYPE_META[tk];
    const b = el(`<button class="type-pick" style="background:${m.color}" aria-pressed="${chartToolState.picks.includes(tk)}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    b.onclick = () => togglePick(tk);
    grid.appendChild(b);
  });

  renderPicked();
  renderResult();
  return wrap;
}
