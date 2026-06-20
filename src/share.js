// 成績碼：把「測驗類型 + 賽季 + seed + 題數 + 分數」編碼成可放進網址的短碼。
// 對方打開連結後，用同樣的類型/賽季/seed 還原同一份測驗來挑戰或一起測。
//
// v2 格式：2 ~ mode ~ season ~ seed ~ total ~ score [ ~ difficulty ] [ ~ flag ]
//   mode:       t = 屬性相剋, s = 種族值速度, w = 我是誰, k = 寶可夢數獨
//               數獨 season 用 '-'、total 固定 9、score＝九格答對數；seed 即可重現整盤。
//   season:     速度測驗的賽季鍵（如 m-a / m-b）；我是誰的池鍵（all / g1..g9 / hisui / 賽季鍵）；屬性測驗用 '-'
//   total:      題數（10~20）。
//   score:      一般＝答對題數（0..total）；我是誰按字計分＝百分制 ×100 的整數（0..10000，保留兩位小數）。
//   difficulty: 速度測驗非 'all' 時、以及我是誰一律附加的難度欄（小寫 a/v/e/n/m/h）；屬性碼不附。
//   flag:       計分制旗標（大寫，與小寫難度碼區分）：C=按字計分（我是誰）、O=全錯全對（通用）。
//               有旗標時 score 存百分制 ×100 的整數（0..10000）。
// v1 格式（1 ~ seed ~ total ~ score）仍可解，視為屬性相剋。

const VERSION = '2';
const SEP = '~';
const MODE_TO_CODE = { type: 't', speed: 's', who: 'w', doku: 'k' };
const CODE_TO_MODE = { t: 'type', s: 'speed', w: 'who', k: 'doku' };
const DIFF_TO_CODE = { all: 'a', veryeasy: 'v', easy: 'e', normal: 'n', medium: 'm', hard: 'h' };
const CODE_TO_DIFF = { a: 'all', v: 'veryeasy', e: 'easy', n: 'normal', m: 'medium', h: 'hard' };
// 計分旗標（大寫，與小寫難度碼區分）：N=正常計分（對/錯換算 100 分）、C=按字計分（我是誰）。
// 都不勾＝只算對幾題，不附旗標。
const FLAG_TO_MODE = { N: 'score100', C: 'charScore' };

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

// result: { mode, season, seed, total, score, difficulty, charScore, score100 }
//   score：不計分/正常計分＝答對題數；按字計分＝百分制 ×100 整數。
//   旗標：N=正常計分（換算 100）、C=按字計分；不計分不附旗標。
export function encodeResult({ mode = 'type', season = '', seed, total, score, difficulty = 'all', charScore = false, score100 = false }) {
  if (seed == null || seed === '') throw new Error('seed required');
  const modeCode = MODE_TO_CODE[mode] || 't';
  const seasonField = season || '-';
  const useChar = mode === 'who' && charScore;
  const scoreField = useChar ? String(Math.round(score * 100)) : String(score);
  const parts = [VERSION, modeCode, seasonField, seed, String(total), scoreField];
  // 難度：速度非 'all'、我是誰一律（小寫）。屬性碼不附。
  if (mode === 'speed' && difficulty && difficulty !== 'all') parts.push(DIFF_TO_CODE[difficulty] || 'a');
  else if (mode === 'who') parts.push(DIFF_TO_CODE[difficulty] || 'e');
  // 計分旗標（大寫，與小寫難度碼區分）。
  if (useChar) parts.push('C');
  else if (score100) parts.push('N');
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

  if (parts[0] === VERSION && parts.length >= 6 && parts.length <= 8) {
    const [, modeCode, seasonField, s, totalStr, scoreStr] = parts;
    const mode = CODE_TO_MODE[modeCode];
    if (!mode) return null;
    const season = seasonField === '-' ? '' : seasonField;
    const seed = s;
    const total = Number(totalStr);
    const storedScore = Number(scoreStr);
    if (!seed) return null;
    if (!Number.isInteger(total) || !Number.isInteger(storedScore) || total <= 0) return null;
    // score 之後 0..2 欄：小寫＝難度、大寫＝計分旗標。
    let difficulty = 'all', flag = null;
    for (const f of parts.slice(6)) {
      if (FLAG_TO_MODE[f]) { if (flag) return null; flag = f; }
      else { const d = CODE_TO_DIFF[f]; if (!d) return null; difficulty = d; }
    }
    const charScore = flag === 'C';
    const score100 = flag === 'N';
    if (charScore && mode !== 'who') return null;
    if (charScore) {
      if (storedScore < 0 || storedScore > 10000) return null;
      return { mode, season, seed, total, score: storedScore / 100, difficulty, charScore: true };
    }
    if (storedScore < 0 || storedScore > total) return null;
    if (score100) return { mode, season, seed, total, score: storedScore, difficulty, score100: true };
    return { mode, season, seed, total, score: storedScore, difficulty };
  }

  if (parts[0] === '1' && parts.length === 4) {
    // 舊版：視為屬性相剋。
    const [, s, totalStr, scoreStr] = parts;
    const total = Number(totalStr);
    const score = Number(scoreStr);
    if (!s) return null;
    if (!Number.isInteger(total) || !Number.isInteger(score)) return null;
    if (total <= 0 || score < 0 || score > total) return null;
    return { mode: 'type', season: '', seed: s, total, score, difficulty: 'all' };
  }

  return null;
}
