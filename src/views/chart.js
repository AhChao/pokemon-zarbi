// 屬性相剋查詢與完整相剋表。
import { TYPES, TYPE_META, formatMultiplier, multiplier } from '../data/typechart.js';
import { t, typeName } from '../i18n.js';
import { state } from '../state.js';
import { el, esc, setView, typeIcon } from '../ui.js';


// ── 相剋查詢畫面 ───────────────────────────────────────────────

export function viewChart() {
  const node = el(`
    <section>
      <div class="card">
        <h2>${esc(t('chart.title'))}</h2>
        <div class="chart-controls">
          <div>
            <p class="label">${esc(t('chart.attack'))}</p>
            <div class="type-grid" data-grid="atk"></div>
          </div>
          <div>
            <p class="label">${esc(t('chart.defense'))}（1～2 個）</p>
            <div class="type-grid" data-grid="def"></div>
          </div>
        </div>
        <div class="chart-result"></div>
        <button class="btn btn--ghost" data-nav="back">${esc(t('common.back'))}</button>
      </div>

      <div class="card">
        <h2>完整相剋表</h2>
        <p class="muted">${esc(t('chart.gridHint'))}</p>
        <div class="table-wrap"></div>
      </div>
    </section>`);

  const atkGrid = node.querySelector('[data-grid="atk"]');
  const defGrid = node.querySelector('[data-grid="def"]');
  const resultBox = node.querySelector('.chart-result');

  const renderResult = () => {
    const m = multiplier(state.chartState.atk, state.chartState.def);
    const atkN = typeName(state.chartState.atk);
    const defN = state.chartState.def.map(typeName).join(' / ');
    resultBox.innerHTML = `${esc(formatMultiplier(m))}<small>${esc(atkN)} → ${esc(defN)}</small>`;
  };

  TYPES.forEach((tk) => {
    const m = TYPE_META[tk];
    const a = el(`<button class="type-pick" style="background:${m.color}" aria-pressed="${state.chartState.atk === tk}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    a.onclick = () => {
      state.chartState.atk = tk;
      atkGrid.querySelectorAll('.type-pick').forEach((b, i) =>
        b.setAttribute('aria-pressed', String(TYPES[i] === tk)));
      renderResult();
    };
    atkGrid.appendChild(a);

    const d = el(`<button class="type-pick" style="background:${m.color}" aria-pressed="${state.chartState.def.includes(tk)}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    d.onclick = () => {
      const has = state.chartState.def.includes(tk);
      if (has) {
        if (state.chartState.def.length > 1) state.chartState.def = state.chartState.def.filter((x) => x !== tk);
      } else {
        state.chartState.def = [...state.chartState.def, tk].slice(-2);
      }
      defGrid.querySelectorAll('.type-pick').forEach((b, i) =>
        b.setAttribute('aria-pressed', String(state.chartState.def.includes(TYPES[i]))));
      renderResult();
    };
    defGrid.appendChild(d);
  });

  renderResult();
  node.querySelector('.table-wrap').appendChild(buildChartTable());
  setView(node);
}


export function buildChartTable() {
  const cls = (m) => m === 0 ? 'm0' : m === 0.5 ? 'm05' : m === 2 ? 'm2' : 'm1';
  let head = '<tr><th style="background:var(--c-muted)" title="攻↓ 防→">↘</th>';
  for (const d of TYPES) head += `<th style="background:${TYPE_META[d].color}" title="${esc(typeName(d))}">${esc(typeName(d)[0])}</th>`;
  head += '</tr>';

  let rows = '';
  for (const a of TYPES) {
    rows += `<tr><th style="background:${TYPE_META[a].color}" title="${esc(typeName(a))}">${esc(typeName(a)[0])}</th>`;
    for (const d of TYPES) {
      const m = multiplier(a, [d]);
      rows += `<td class="${cls(m)}" title="${esc(typeName(a))}→${esc(typeName(d))} ${formatMultiplier(m)}">${m === 1 ? '' : formatMultiplier(m).replace('×', '')}</td>`;
    }
    rows += '</tr>';
  }
  return el(`<table class="chart">${head}${rows}</table>`);
}
