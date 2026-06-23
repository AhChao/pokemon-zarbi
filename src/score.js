// 計分相關純函式：計分方式選項、按字百分制、由結果取百分比、顯示格式化。
// 不碰 DOM / 模組狀態，data-in/data-out，可單獨用 node --test 測。
import { scoreQuizChar } from './quiz.js';

// 計分方式（單選）：不計分（只顯示對幾題）／正常計分（對/錯換算 100 分）；
// 我是誰多一個按字計分（逐字部分分、換算 100）。
export function scoreModesFor(mode) {
  return mode === 'who' ? ['count', 'normal', 'char'] : ['count', 'normal'];
}

// 按字計分專用百分制（0..100）。
export function charPct(quiz, answers) {
  return (scoreQuizChar(quiz, answers) / (quiz.count * 10)) * 100;
}

// 由（已解碼/歷史）結果取百分制，供比較與配色：按字計分 score 已是百分制；正常＝答對/題數×100。
export function pctOf({ charScore, score, total }) {
  if (charScore) return score;
  return total ? (score / total) * 100 : 0;
}

// 顯示：最多兩位小數、去尾零（70 / 75.5 / 66.67）。
export const fmtPct = (v) => String(Math.round(v * 100) / 100);
