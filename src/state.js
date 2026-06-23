// 共享可變狀態與離線資料的單一持有處（kernel 的狀態層）。
// ES module 的 import 綁定是唯讀，故跨 module 的可變狀態一律掛在 holder 物件屬性上
// （各 view 直接讀寫 state.xxx / DATA.xxx），而非用可重新指派的 module 變數。

// 速度線表「每行最多幾隻」偏好（5 或 10，預設 10），記在 localStorage。
export const SPD_PERROW_KEY = 'poke-quest.spdPerRow';
function readSpdPerRow() {
  try { return Number(localStorage.getItem(SPD_PERROW_KEY)) === 5 ? 5 : 10; } catch { return 10; }
}

// 離線產生的靜態資料（啟動時由 init/loadData 填入）。
export const DATA = {
  pokedex: {},             // Champions 賽季名單（速度測驗 / 我是誰冠軍賽季池）
  seasonsData: { seasons: {} },
  nationalDex: {},         // 全國圖鑑分世代（我是誰的世代/地區池，含未進化）
  usageData: { list: [] }, // 當前 VGC 雙打 meta 使用率 top-50（聯防補洞建議，build:usage 產）
};

// 進行中的 UI 狀態。
export const state = {
  session: null,        // { quiz, answers, index, locked, challenge, saved, meta }
  viewingHistory: null, // 目前點開查看的歷史紀錄
  setupState: null,     // { mode, season, seed } — 準備畫面
  dokuSetup: null,      // { play, hintMode, seed } — 數獨準備畫面
  dokuState: null,      // { seed, puzzle, picks:[9], hintMode, play, pits, challenge } — 數獨盤面
  masterState: null,    // 寶可夢大師模式（本機）的進行狀態
  builderState: null,   // 我是誰出題 builder 的狀態
  chartState: { atk: 'fire', def: ['grass'] },
  dexState: { group: 'gen', poolKey: 'g1', type: '', q: '' },
  spdPerRow: readSpdPerRow(),
};
