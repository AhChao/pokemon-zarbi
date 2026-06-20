// 寶可夢大師模式的本機進度（localStorage）：每個範圍（池）一筆紀錄。
// 與成績歷史（history.js）分開：純本機、不分享、不進歷史。非瀏覽器環境（如 file://）會靜默失敗。
//
// 紀錄欄位（供完成頁算 fun fact）：
//   done       已答對的 key 清單
//   mistakes   總失誤次數
//   attempts   { key: 該隻答錯幾次 }（>0 即非一次命中；最大者＝你的剋星）
//   wrongs     { key: [你打過的錯字…] }（供「你曾經叫他」「最可惜的一次」）
//   bestStreak 最長連續「一次就答對」連勝
//   curStreak  目前連勝（跨答題累進，存著才能跨 session 接續）
//   startedAt  第一次開始這個池的時間戳（ms）
//   days       答過題的日期清單（YYYY-MM-DD，去重）→ 征服天數
//   sessions   回鍋次數（每次進入這個池且未完成就 +1）

const PREFIX = 'poke-quest.master.';
const VER = '.v2';
const keyOf = (poolKey) => PREFIX + poolKey + VER;

const WRONGS_PER_MON = 6;   // 每隻最多保留幾個錯字
const WRONG_MAXLEN = 30;    // 單個錯字最長字數

// localStorage 是否可用（無痕、停用 cookie、file:// 等會擲錯）。
export function masterAvailable() {
  try {
    const k = '__pq_master_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function blank() {
  return { done: [], mistakes: 0, attempts: {}, wrongs: {}, bestStreak: 0, curStreak: 0, startedAt: 0, days: [], sessions: 0 };
}

// 取某池進度（補齊缺欄，容錯舊資料）。
export function getMaster(poolKey) {
  const base = blank();
  try {
    const raw = localStorage.getItem(keyOf(poolKey));
    if (raw) {
      const o = JSON.parse(raw) || {};
      return {
        done: Array.isArray(o.done) ? o.done : [],
        mistakes: o.mistakes || 0,
        attempts: o.attempts && typeof o.attempts === 'object' ? o.attempts : {},
        wrongs: o.wrongs && typeof o.wrongs === 'object' ? o.wrongs : {},
        bestStreak: o.bestStreak || 0,
        curStreak: o.curStreak || 0,
        startedAt: o.startedAt || 0,
        days: Array.isArray(o.days) ? o.days : [],
        sessions: o.sessions || 0,
      };
    }
  } catch { /* 當作沒有進度 */ }
  return base;
}

// 寫回某池進度。
export function saveMaster(poolKey, rec) {
  try { localStorage.setItem(keyOf(poolKey), JSON.stringify(rec)); } catch { /* 存不了就算了 */ }
}

// 清除某池進度（重新挑戰）。
export function resetMaster(poolKey) {
  try { localStorage.removeItem(keyOf(poolKey)); } catch { /* 無妨 */ }
  return blank();
}

// 記一個錯字（截斷、去重、限量）。直接改傳入的 rec。
export function pushWrong(rec, key, typed) {
  const s = String(typed == null ? '' : typed).trim().slice(0, WRONG_MAXLEN);
  if (!s) return;
  const arr = rec.wrongs[key] || (rec.wrongs[key] = []);
  if (!arr.includes(s) && arr.length < WRONGS_PER_MON) arr.push(s);
}
