// 成績碼：把「測驗類型 + 賽季 + seed + 題數 + 分數」編碼成可放進網址的短碼。
// 對方打開連結後，用同樣的類型/賽季/seed 還原同一份測驗來挑戰或一起測。
//
// v2 格式：2 ~ mode ~ season ~ seed ~ total ~ score [ ~ difficulty ]
//   mode:       t = 屬性相剋, s = 種族值速度
//   season:     速度測驗的賽季鍵（如 m-a / m-b）；屬性測驗用 '-'
//   difficulty: 僅速度測驗附加的第 7 欄（a/e/m/h）；屬性碼維持 6 欄不變。
//               缺欄（舊速度碼）→ 'all'，與舊版題目重現一致。
// v1 格式（1 ~ seed ~ total ~ score）仍可解，視為屬性相剋。

const VERSION = '2';
const SEP = '~';
const MODE_TO_CODE = { type: 't', speed: 's' };
const CODE_TO_MODE = { t: 'type', s: 'speed' };
const DIFF_TO_CODE = { all: 'a', easy: 'e', medium: 'm', hard: 'h' };
const CODE_TO_DIFF = { a: 'all', e: 'easy', m: 'medium', h: 'hard' };

function b64urlEncode(str) {
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(str)))
    : Buffer.from(str, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(b64)));
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

// result: { mode='type', season='', seed, total, score, difficulty='all' }
export function encodeResult({ mode = 'type', season = '', seed, total, score, difficulty = 'all' }) {
  if (seed == null || seed === '') throw new Error('seed required');
  const modeCode = MODE_TO_CODE[mode] || 't';
  const seasonField = season || '-';
  const parts = [VERSION, modeCode, seasonField, seed, String(total), String(score)];
  // 難度只對速度測驗有意義；非 'all' 才附加第 7 欄，讓既有屬性/速度碼維持原樣。
  if (mode === 'speed' && difficulty && difficulty !== 'all') parts.push(DIFF_TO_CODE[difficulty] || 'a');
  return b64urlEncode(parts.join(SEP));
}

// 解碼成績碼；任何不合法格式都回傳 null（不丟例外，方便 UI 容錯）。
export function decodeResult(code) {
  if (!code || typeof code !== 'string') return null;
  let payload;
  try {
    payload = b64urlDecode(code);
  } catch {
    return null;
  }
  const parts = payload.split(SEP);

  let mode, season, seed, total, score, difficulty = 'all';
  if (parts[0] === VERSION && (parts.length === 6 || parts.length === 7)) {
    const [, modeCode, seasonField, s, totalStr, scoreStr, diffCode] = parts;
    mode = CODE_TO_MODE[modeCode];
    if (!mode) return null;
    season = seasonField === '-' ? '' : seasonField;
    seed = s;
    total = Number(totalStr);
    score = Number(scoreStr);
    if (parts.length === 7) {
      difficulty = CODE_TO_DIFF[diffCode];
      if (!difficulty) return null;
    }
  } else if (parts[0] === '1' && parts.length === 4) {
    // 舊版：視為屬性相剋。
    const [, s, totalStr, scoreStr] = parts;
    mode = 'type';
    season = '';
    seed = s;
    total = Number(totalStr);
    score = Number(scoreStr);
  } else {
    return null;
  }

  if (!seed) return null;
  if (!Number.isInteger(total) || !Number.isInteger(score)) return null;
  if (total <= 0 || score < 0 || score > total) return null;
  return { mode, season, seed, total, score, difficulty };
}
