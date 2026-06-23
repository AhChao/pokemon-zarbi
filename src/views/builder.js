// 我是誰出題模式：自選題庫產生分享碼。
import { gaEvent, go, shareUrlFor } from '../core.js';
import { t } from '../i18n.js';
import { difficultyLabel } from '../pool.js';
import { DEFAULT_WHO_DIFFICULTY, WHO_DIFFICULTIES, generateWhoQuizFromKeys, newSeed, normalizeName } from '../quiz.js';
import { scoreModesFor } from '../score.js';
import { encodeWhoCustom } from '../share.js';
import { DATA, state } from '../state.js';
import { el, esc, prefetchImages, setView, uiIcon } from '../ui.js';
import { viewHome } from './home.js';


// ── 我是誰出題 builder：自選一份清單 → 產生代碼 ───────────────────
// 出題題數限制：下限 5、上限 20。
export const WHO_CUSTOM_MIN = 5;

export const WHO_CUSTOM_MAX = 20;

// 出題瀏覽用的圖鑑：全國圖鑑非 Mega（剪影題以本體為主），依圖鑑編號排序。
export function builderDexEntries() {
  return Object.entries(DATA.nationalDex)
    .filter(([, v]) => !v.mega)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (a.ndex || 0) - (b.ndex || 0) || (a.key < b.key ? -1 : 1));
}


export function viewWhoBuilder() {
  if (!state.builderState) state.builderState = { selected: [], difficulty: DEFAULT_WHO_DIFFICULTY, scoreMode: 'count', filter: '', dexOpen: true, setOpen: true };
  const bs = state.builderState;
  const allEntries = builderDexEntries();
  const byKey = new Map(allEntries.map((e) => [e.key, e]));

  const node = el(`
    <section class="card">
      <h2>${esc(t('builder.title'))}</h2>
      <p class="muted">${esc(t('builder.intro'))}</p>

      <p class="label" data-sel-label></p>
      <div class="builder-selected" data-selected></div>

      <button class="collapse-head" data-toggle="set" aria-expanded="${bs.setOpen}">
        <span>${esc(t('builder.setSection'))}</span><span class="collapse-caret">${bs.setOpen ? '▾' : '▸'}</span>
      </button>
      <div class="collapse-body" data-body="set"${bs.setOpen ? '' : ' hidden'}>
        <p class="label">${esc(t('setup.difficulty'))}</p>
        <div class="season-pick" data-diff></div>
        <p class="label">${esc(t('setup.scoreMode'))}</p>
        <div class="season-pick" data-sm></div>
      </div>

      <button class="collapse-head" data-toggle="dex" aria-expanded="${bs.dexOpen}">
        <span>${esc(t('builder.dexSection'))}</span><span class="collapse-caret">${bs.dexOpen ? '▾' : '▸'}</span>
      </button>
      <div class="collapse-body" data-body="dex"${bs.dexOpen ? '' : ' hidden'}>
        <div class="code-box">
          <input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="${esc(t('builder.search'))}" aria-label="${esc(t('builder.search'))}" data-filter />
        </div>
        <div class="builder-dex" data-dex></div>
      </div>

      <div class="doku-share" data-share hidden>
        <p class="label">${esc(t('builder.yourCode'))}</p>
        <div class="code-box">
          <input type="text" readonly aria-label="分享連結" data-share-url />
          <button class="btn btn--accent" data-act="copy">${esc(t('result.copy'))}</button>
        </div>
        <p class="muted" data-share-code></p>
      </div>
      <p class="muted" data-need hidden>${esc(t('builder.needRange', { min: WHO_CUSTOM_MIN, max: WHO_CUSTOM_MAX }))}</p>
      <button class="btn btn--primary" data-act="make">${esc(t('builder.makeCode'))}</button>
      <button class="btn btn--ghost" data-nav="home">${esc(t('common.back'))}</button>
    </section>`);

  const selWrap = node.querySelector('[data-selected]');
  const dexWrap = node.querySelector('[data-dex]');
  const shareWrap = node.querySelector('[data-share]');
  const needEl = node.querySelector('[data-need]');

  const renderSelected = () => {
    node.querySelector('[data-sel-label]').textContent = t('builder.selected', { n: bs.selected.length, max: WHO_CUSTOM_MAX });
    selWrap.innerHTML = '';
    if (!bs.selected.length) { selWrap.innerHTML = `<p class="muted">${esc(t('builder.selectedEmpty'))}</p>`; return; }
    bs.selected.forEach((k) => {
      const p = byKey.get(k);
      if (!p) return;
      const chip = el(`<button class="builder-chip" type="button" title="${esc(p.nameZh)}"><img alt="" loading="lazy" /><span>${esc(p.nameZh)}</span><span class="builder-chip-x">${uiIcon('close')}</span></button>`);
      const im = chip.querySelector('img'); im.src = p.image; im.onerror = () => { im.style.visibility = 'hidden'; };
      chip.onclick = () => { bs.selected = bs.selected.filter((x) => x !== k); renderSelected(); renderDex(); updateMake(); };
      selWrap.appendChild(chip);
    });
  };

  const renderDex = () => {
    const q = normalizeName(bs.filter);
    const list = (q ? allEntries.filter((p) => normalizeName(p.nameZh).includes(q) || normalizeName(p.nameEn).includes(q)) : allEntries);
    dexWrap.innerHTML = '';
    const sel = new Set(bs.selected);
    list.forEach((p) => {
      const on = sel.has(p.key);
      const cellb = el(`<button class="builder-cell${on ? ' builder-cell--on' : ''}" type="button" title="${esc(p.nameZh)}"><img alt="" loading="lazy" /><span class="builder-cell-name">${esc(p.nameZh)}</span></button>`);
      const im = cellb.querySelector('img'); im.src = p.image; im.onerror = () => { im.style.visibility = 'hidden'; };
      cellb.onclick = () => {
        if (sel.has(p.key)) {
          bs.selected = bs.selected.filter((x) => x !== p.key);
        } else if (bs.selected.length >= WHO_CUSTOM_MAX) {
          needEl.textContent = t('builder.maxReached', { max: WHO_CUSTOM_MAX });
          needEl.hidden = false;
          return; // 已達上限，不再加入
        } else {
          bs.selected = [...bs.selected, p.key];
        }
        renderSelected(); renderDex(); updateMake();
      };
      dexWrap.appendChild(cellb);
    });
  };

  const updateMake = () => {
    if (bs.selected.length >= WHO_CUSTOM_MIN) {
      const seed = bs.codeSeed || (bs.codeSeed = newSeed());
      const code = encodeWhoCustom({ seed, keys: bs.selected, difficulty: bs.difficulty, scoreMode: bs.scoreMode });
      node.querySelector('[data-share-url]').value = shareUrlFor(code);
      node.querySelector('[data-share-code]').textContent = code;
      shareWrap.hidden = false; needEl.hidden = true;
    } else {
      shareWrap.hidden = true;
      needEl.textContent = t('builder.needRange', { min: WHO_CUSTOM_MIN, max: WHO_CUSTOM_MAX });
      needEl.hidden = false;
    }
  };

  // 難度 / 計分按鈕。
  const diffWrap = node.querySelector('[data-diff]');
  WHO_DIFFICULTIES.forEach((d) => {
    const b = el(`<button class="season-btn" aria-pressed="${bs.difficulty === d}">${esc(difficultyLabel(d))}</button>`);
    b.onclick = () => { bs.difficulty = d; bs.codeSeed = null; viewWhoBuilder(); };
    diffWrap.appendChild(b);
  });
  const smWrap = node.querySelector('[data-sm]');
  scoreModesFor('who').forEach((sm) => {
    const b = el(`<button class="season-btn" aria-pressed="${bs.scoreMode === sm}">${esc(t(`score.${sm}`))}</button>`);
    b.onclick = () => { bs.scoreMode = sm; bs.codeSeed = null; viewWhoBuilder(); };
    smWrap.appendChild(b);
  });

  // 收合區塊。
  node.querySelectorAll('[data-toggle]').forEach((h) => {
    h.onclick = () => {
      const which = h.dataset.toggle;
      if (which === 'set') bs.setOpen = !bs.setOpen; else bs.dexOpen = !bs.dexOpen;
      viewWhoBuilder();
    };
  });

  const filterInput = node.querySelector('[data-filter]');
  filterInput.addEventListener('input', () => { bs.filter = filterInput.value; renderDex(); });
  node.querySelector('[data-act="make"]').onclick = () => {
    if (bs.selected.length < WHO_CUSTOM_MIN) {
      needEl.textContent = t('builder.needRange', { min: WHO_CUSTOM_MIN, max: WHO_CUSTOM_MAX });
      needEl.hidden = false;
      return;
    }
    gaEvent('builder_create', { count: bs.selected.length, difficulty: bs.difficulty, score_mode: bs.scoreMode });
    updateMake(); shareWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const copyBtn = node.querySelector('[data-act="copy"]');
  copyBtn.onclick = async () => {
    gaEvent('share_code', { kind: 'builder' });
    const input = node.querySelector('[data-share-url]');
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    copyBtn.textContent = t('result.copied');
    setTimeout(() => (copyBtn.textContent = t('result.copy')), 1500);
  };

  renderSelected();
  renderDex();
  updateMake();
  setView(node);
}


// 自訂題庫挑戰：用代碼帶的清單組一份我是誰直接開始。
export function startCustomWho(decoded) {
  const pool = decoded.keys.map((k) => (DATA.nationalDex[k] ? { key: k, ...DATA.nationalDex[k] } : null)).filter(Boolean);
  if (!pool.length) return viewHome();
  let quiz;
  try { quiz = generateWhoQuizFromKeys(decoded.seed, pool, decoded.difficulty); }
  catch (e) { console.error(e); return viewHome(); }
  state.session = { quiz, answers: [], index: 0, locked: false, challenge: null, saved: false, meta: { mode: 'who', season: '', difficulty: decoded.difficulty, count: quiz.count, scoreMode: decoded.scoreMode } };
  prefetchImages(quiz.questions.map((q) => q.image)); // 背景預載自訂題庫立繪
  go('#/quiz');
}
