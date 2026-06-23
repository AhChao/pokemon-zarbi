// 聯防小工具：屬性/隊伍綜合評估與 meta 補洞建議。
import { TYPES, TYPE_META, formatMultiplier, multiplier, singleMultiplier } from '../data/typechart.js';
import { t, typeName } from '../i18n.js';
import { DATA } from '../state.js';
import { badge, el, esc, setView, typeIcon, uiIcon } from '../ui.js';


// ── 聯防小工具：攻擊方／防守方（屬性集合綜合）＋我的隊伍（逐隻分析）─
export let chartToolState = { mode: 'team', picks: [], team: null };


// 隊伍存放：A／B／C 三隊，每隊 ≤6 隻，每隻 { def:[≤2], atk:[≤4] }；存 localStorage。
export const TEAM_KEY = 'pq.coverageTeams.v1';

export function emptyTeams() { return { active: 'A', sets: { A: [], B: [], C: [] } }; }

export function loadTeams() {
  try {
    const o = JSON.parse(localStorage.getItem(TEAM_KEY) || 'null');
    if (o && o.sets && ['A', 'B', 'C'].every((k) => Array.isArray(o.sets[k]))) {
      // 清洗：每隻只留合法屬性、def≤2、atk≤4。
      for (const k of ['A', 'B', 'C']) {
        o.sets[k] = o.sets[k].slice(0, 6).map((m) => ({
          def: (m.def || []).filter((x) => TYPES.includes(x)).slice(0, 2),
          atk: (m.atk || []).filter((x) => TYPES.includes(x)).slice(0, 4),
          hidden: !!m.hidden,
        }));
      }
      if (!['A', 'B', 'C'].includes(o.active)) o.active = 'A';
      return o;
    }
  } catch { /* 略過損毀資料 */ }
  return emptyTeams();
}

export function saveTeams(ts) { try { localStorage.setItem(TEAM_KEY, JSON.stringify(ts)); } catch { /* 略過（無痕/額滿） */ } }


export function viewCoverage() {
  const node = el(`
    <section>
      <div class="card chart-tool"></div>
      <button class="btn btn--ghost" data-nav="back">${esc(t('common.back'))}</button>
    </section>`);
  node.querySelector('.chart-tool').replaceWith(buildChartTool());
  setView(node);
}


export function buildChartTool() {
  // 「當攻擊方／當防守方」兩個屬性組模式暫時藏起來（buildSetTool 等邏輯保留，未來要恢復只需把
  // 三段式切換器與 renderMode 放回來）；目前只留「我的隊伍」。
  chartToolState.mode = 'team';
  const card = el(`
    <div class="card chart-tool">
      <h2>${esc(t('chart.tool.title'))}</h2>
      <div class="ct-body"></div>
    </div>`);
  card.querySelector('.ct-body').appendChild(buildTeamTool());
  return card;
}


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


// 共用：屬性多選器（行內展開用），就地增刪 selected 陣列、達上限忽略新增。
export function buildTypeChooser(selected, max, onChange) {
  const g = el('<div class="ct-chooser"></div>');
  TYPES.forEach((tk) => {
    const m = TYPE_META[tk];
    const b = el(`<button class="type-pick type-pick--sm" style="background:${m.color}" aria-pressed="${selected.includes(tk)}">${typeIcon(tk)}${esc(typeName(tk))}</button>`);
    b.onclick = () => {
      const i = selected.indexOf(tk);
      if (i >= 0) selected.splice(i, 1);
      else if (selected.length < max) selected.push(tk);
      else return; // 達上限
      onChange();
    };
    g.appendChild(b);
  });
  return g;
}


// 一個倍率分桶列（共用 .ct-bucket 樣式）。types 為空則不產生。
// headOverride 有值時用它當標頭（總評用「N 種」而非單一倍率）。
export function ctBucketRow(mult, labelKey, types, kind, headOverride) {
  if (!types.length) return '';
  const cls = kind === 'danger' ? ' ct-bucket--danger' : kind === 'safe' ? ' ct-bucket--safe' : kind === 'warn' ? ' ct-bucket--warn' : '';
  const head = headOverride != null ? esc(headOverride) : esc(formatMultiplier(mult));
  return `<div class="ct-bucket${cls}">
    <span class="ct-bucket__k">${head}<small>${esc(t(labelKey))}</small></span>
    <span class="ct-bucket__v">${types.map((o) => badge(o)).join('')}</span>
  </div>`;
}


// 我的隊伍：A/B/C 三隊、逐隻防/攻分析、隊伍總評。
export function buildTeamTool() {
  if (!chartToolState.team) chartToolState.team = loadTeams();
  const ts = chartToolState.team;
  const mons = () => ts.sets[ts.active];
  let expanded = -1; // 目前展開的隻 index（-1＝全收合）

  const wrap = el(`
    <div class="ct-team">
      <p class="ct-explain">${esc(t('chart.tool.team.explain'))}</p>
      <div class="ct-teamtabs"></div>
      <div class="ct-mons"></div>
      <div class="ct-team-summary"></div>
    </div>`);
  const tabsBox = wrap.querySelector('.ct-teamtabs');
  const monsBox = wrap.querySelector('.ct-mons');
  const sumBox = wrap.querySelector('.ct-team-summary');

  const persist = () => saveTeams(ts);
  const refresh = () => { persist(); renderMons(); renderSummary(); syncTabs(); };
  // 攻擊倍率含屬修（本系 STAB）：招式屬性與該隻自身屬性相同 → ×1.5（本系剋制可達 3×）。
  const atkMult = (mon, mv, d) => singleMultiplier(mv, d) * (mon.def.includes(mv) ? 1.5 : 1);

  ['A', 'B', 'C'].forEach((k) => {
    const b = el(`<button class="seg ct-teamtab"><span>${k}</span><small></small></button>`);
    b.onclick = () => { ts.active = k; expanded = -1; refresh(); };
    tabsBox.appendChild(b);
  });
  const syncTabs = () => tabsBox.querySelectorAll('.ct-teamtab').forEach((b, i) => {
    const k = ['A', 'B', 'C'][i];
    b.setAttribute('aria-pressed', String(ts.active === k));
    b.querySelector('small').textContent = ts.sets[k].length ? ts.sets[k].length : '';
  });

  // 單隻：被各攻擊屬性打的倍率（雙屬性取乘積）＋招式打不動哪些。
  const buildMonAnalysis = (mon) => {
    const box = el('<div class="ct-mon__ana"></div>');
    // 防禦：對 18 個攻擊屬性的倍率
    if (mon.def.length) {
      const quad = [], weak = [], resist = [], qresist = [], immune = [];
      TYPES.forEach((a) => {
        const m = multiplier(a, mon.def);
        if (m === 4) quad.push(a);
        else if (m === 2) weak.push(a);
        else if (m === 0) immune.push(a);
        else if (m === 0.25) qresist.push(a);
        else if (m === 0.5) resist.push(a);
      });
      box.insertAdjacentHTML('beforeend', `<p class="ct-mini">${esc(t('chart.tool.team.defFace'))}</p>`);
      box.insertAdjacentHTML('beforeend',
        ctBucketRow(4, 'chart.tool.team.monQuad', quad, 'danger') +
        ctBucketRow(2, 'chart.tool.team.monHurt', weak, 'danger') +
        ctBucketRow(0.5, 'chart.tool.team.monResist', resist, 'safe') +
        ctBucketRow(0.25, 'chart.tool.team.monQResist', qresist, 'safe') +
        ctBucketRow(0, 'chart.tool.team.monImmune', immune, 'safe'));
    } else {
      box.insertAdjacentHTML('beforeend', `<p class="ct-mini ct-muted">${esc(t('chart.tool.team.defEmpty'))}</p>`);
    }
    // 攻擊：每招倍率含屬修（本系 STAB ×1.5），每個防守屬性取最佳招式倍率。
    // 本系剋制可達 3×（1.5×2）＝最痛；列出能 3× 的、打不動（被抵抗）、完全沒效。
    if (mon.atk.length) {
      const strong = [], resisted = [], noeffect = [];
      TYPES.forEach((d) => {
        const best = Math.max(...mon.atk.map((mv) => atkMult(mon, mv, d)));
        if (best === 0) noeffect.push(d);
        else if (best >= 3) strong.push(d);
        else if (best < 1) resisted.push(d);
      });
      box.insertAdjacentHTML('beforeend', `<p class="ct-mini">${esc(t('chart.tool.team.atkFace'))}</p>`);
      const rows = ctBucketRow(3, 'chart.tool.team.monStrong', strong, 'safe') +
        ctBucketRow(0.5, 'chart.tool.team.monNoHit', resisted, 'danger') +
        ctBucketRow(0, 'chart.tool.team.monNoEffect', noeffect, 'danger');
      box.insertAdjacentHTML('beforeend', rows || `<p class="ct-mini ct-muted">${esc(t('chart.tool.team.atkPlain'))}</p>`);
    } else {
      box.insertAdjacentHTML('beforeend', `<p class="ct-mini ct-muted">${esc(t('chart.tool.team.atkEmpty'))}</p>`);
    }
    return box;
  };

  const buildMonRow = (mon, i) => {
    const open = expanded === i;
    const row = el(`<div class="ct-mon${open ? ' is-open' : ''}${mon.hidden ? ' is-off' : ''}"></div>`);
    const defSum = mon.def.length
      ? mon.def.map((tk) => `<span class="type-badge" style="background:${TYPE_META[tk].color}">${typeIcon(tk)}${esc(typeName(tk))}</span>`).join('')
      : `<span class="ct-empty">${esc(t('chart.tool.team.noType'))}</span>`;
    const head = el(`<div class="ct-mon__head"></div>`);
    // 左側眼睛：張開＝納入總評，閉上＝暫時忽略這隻（不刪除）。
    const eye = el(`<button class="ct-mon__eye" aria-pressed="${!mon.hidden}" aria-label="${esc(t(mon.hidden ? 'chart.tool.team.eyeOff' : 'chart.tool.team.eyeOn'))}">${uiIcon(mon.hidden ? 'eyeOff' : 'eye')}</button>`);
    eye.onclick = () => { mon.hidden = !mon.hidden; refresh(); };
    const main = el(`
      <button class="ct-mon__main">
        <span class="ct-mon__no">#${i + 1}</span>
        <span class="ct-mon__sum">${defSum}<span class="ct-mon__atkn">${esc(t('chart.tool.team.atkN', { n: mon.atk.length }))}</span></span>
        <span class="ct-mon__chev">${uiIcon(open ? 'up' : 'grid')}</span>
      </button>`);
    main.onclick = () => { expanded = open ? -1 : i; renderMons(); };
    head.appendChild(eye);
    head.appendChild(main);
    row.appendChild(head);
    if (open) {
      const bodyEl = el('<div class="ct-mon__body"></div>');
      bodyEl.insertAdjacentHTML('beforeend', `<p class="label">${esc(t('chart.tool.team.defLabel'))}</p>`);
      bodyEl.appendChild(buildTypeChooser(mon.def, 2, refresh));
      bodyEl.insertAdjacentHTML('beforeend', `<p class="label">${esc(t('chart.tool.team.atkLabel'))}</p>`);
      bodyEl.appendChild(buildTypeChooser(mon.atk, 4, refresh));
      bodyEl.appendChild(buildMonAnalysis(mon));
      const del = el(`<button class="linklike ct-mon__del">${esc(t('chart.tool.team.removeMon'))}</button>`);
      del.onclick = () => { mons().splice(i, 1); expanded = -1; refresh(); };
      bodyEl.appendChild(del);
      row.appendChild(bodyEl);
    }
    return row;
  };

  const renderMons = () => {
    monsBox.innerHTML = '';
    if (!mons().length) monsBox.insertAdjacentHTML('beforeend', `<p class="ct-hint">${esc(t('chart.tool.team.empty'))}</p>`);
    mons().forEach((mon, i) => monsBox.appendChild(buildMonRow(mon, i)));
    if (mons().length < 6) {
      const add = el(`<button class="btn btn--ghost ct-addmon">${esc(t('chart.tool.team.addMon'))}</button>`);
      add.onclick = () => { mons().push({ def: [], atk: [], hidden: false }); expanded = mons().length - 1; refresh(); };
      monsBox.appendChild(add);
    }
  };

  // 隊伍總評：只算「眼睛張開」的隻。點出聯防漏洞（被什麼打全隊沒人能抗）
  // 與覆蓋（攻擊含屬修＝本系 3×）：全隊打不到 2 倍＝硬漏洞、打得到 2 倍但沒人 3 倍＝本系剋制不足。
  const renderSummary = () => {
    sumBox.innerHTML = '';
    const team = mons().filter((m) => !m.hidden);
    const withDef = team.filter((m) => m.def.length);
    const withAtk = team.filter((m) => m.atk.length);
    if (!withDef.length && !withAtk.length) return;

    const card = el(`<div class="ct-summary"><h3>${esc(t('chart.tool.team.sumTitle'))}</h3></div>`);
    let defHoles = [], offHoles = []; // 給 meta 補洞建議共用

    // 聯防：每個攻擊屬性，全隊沒人抵抗（無 ≤½×）即為漏洞。
    if (withDef.length) {
      defHoles = TYPES.filter((a) => !withDef.some((m) => multiplier(a, m.def) <= 0.5));
      const verdict = defHoles.length
        ? t('chart.tool.team.sumDefNote', { n: defHoles.length })
        : t('chart.tool.team.sumDefOk');
      card.insertAdjacentHTML('beforeend', `<p class="ct-verdict${defHoles.length ? ' is-bad' : ' is-ok'}">${esc(verdict)}</p>`);
      card.insertAdjacentHTML('beforeend', ctBucketRow(null, 'chart.tool.team.sumNoResist', defHoles, 'danger', t('chart.tool.team.nKinds', { n: defHoles.length })));
      // 集中弱點：同一攻擊屬性被 ≥3 隻打弱（≥2×）即為缺點——即使有人能抗，被一招壓制多隻仍危險。
      const STACK_MIN = 3;
      const stacked = TYPES
        .map((a) => ({ a, n: withDef.filter((m) => multiplier(a, m.def) >= 2).length }))
        .filter((x) => x.n >= STACK_MIN)
        .sort((x, y) => y.n - x.n);
      if (stacked.length) {
        card.insertAdjacentHTML('beforeend', `<p class="ct-verdict is-bad">${esc(t('chart.tool.team.sumStackNote', { n: stacked.length }))}</p>`);
        const items = stacked.map(({ a, n }) => `<span class="ct-stack">${badge(a)}<span class="ct-stack__n">×${n}</span></span>`).join('');
        card.insertAdjacentHTML('beforeend', `<div class="ct-bucket ct-bucket--danger"><span class="ct-bucket__k">${esc(t('chart.tool.team.nKinds', { n: stacked.length }))}<small>${esc(t('chart.tool.team.sumStacked'))}</small></span><span class="ct-bucket__v">${items}</span></div>`);
      }
    }
    // 覆蓋：每個防守屬性取全隊最佳招式倍率（含屬修）。<2＝硬漏洞、[2,3)＝沒人 3 倍。
    if (withAtk.length) {
      const bestOf = (d) => Math.max(0, ...withAtk.flatMap((m) => m.atk.map((mv) => atkMult(m, mv, d))));
      offHoles = TYPES.filter((d) => bestOf(d) < 2);
      const soft = TYPES.filter((d) => { const b = bestOf(d); return b >= 2 && b < 3; });
      if (offHoles.length) {
        card.insertAdjacentHTML('beforeend', `<p class="ct-verdict is-bad">${esc(t('chart.tool.team.sumAtkNote', { n: offHoles.length }))}</p>`);
        card.insertAdjacentHTML('beforeend', ctBucketRow(null, 'chart.tool.team.sumNoCover', offHoles, 'danger', t('chart.tool.team.nKinds', { n: offHoles.length })));
      }
      if (soft.length) {
        card.insertAdjacentHTML('beforeend', `<p class="ct-verdict is-warn">${esc(t('chart.tool.team.sumSoftNote', { n: soft.length }))}</p>`);
        card.insertAdjacentHTML('beforeend', ctBucketRow(null, 'chart.tool.team.sumNo3x', soft, 'warn', t('chart.tool.team.nKinds', { n: soft.length })));
      }
      if (!offHoles.length && !soft.length) {
        card.insertAdjacentHTML('beforeend', `<p class="ct-verdict is-ok">${esc(t('chart.tool.team.sumAtkOk'))}</p>`);
      }
    }
    sumBox.appendChild(card);
    const rec = buildUsageRecommender(defHoles, offHoles);
    if (rec) sumBox.appendChild(rec);
  };

  syncTabs();
  renderMons();
  renderSummary();
  return wrap;
}


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
