// 最近測驗紀錄：保存在 localStorage，只留最近 5 筆。
// 存 seed + total + 作答，足以重建那份測驗並還原逐題檢討。

const KEY = 'poke-quest.history.v1';
const MAX = 5;

export function getHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// rec: { seed, total, score, answers, code, ts }
export function addHistory(rec) {
  try {
    // 同一份測驗（seed+total）重玩時，以最新一筆取代舊的。
    const list = getHistory().filter((r) => !(r.seed === rec.seed && r.total === rec.total));
    list.unshift(rec);
    const trimmed = list.slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch {
    return getHistory();
  }
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
}
