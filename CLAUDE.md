# poke-quest — repo conventions

純前端、零 build 的寶可夢快問快答（vanilla ES Modules）。詳見 `README.md`。

## 硬規則

- **禁止 emoji**：本 repo 任何地方（HTML / JS / CSS content / 文案）都不得使用 emoji。所有圖示一律用 **SVG** 取代（`assets/ui/*.svg`、`assets/types/*.svg`，或 inline `<svg>`）。新增圖示請走 SVG。

## 資料更新

寶可夢/賽季資料的取得與驗證流程見 skill：`.claude/skills/pokemon-data-fetch/SKILL.md`。簡述：編輯 `src/data/seasons.json` → `npm run build:dex`；runtime 不即時抓 API。
