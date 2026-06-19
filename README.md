# 寶可夢快問快答（poke-quest）

純前端的寶可夢知識快問快答。手機友善，做完一份 10 題測驗會拿到**成績碼**，把帶碼的網址（或純代碼）給朋友，就能玩**同一份題目**比拚；開局前也能先拿到「題目碼」兩人一起測。

## 測驗類型

1. **屬性相剋** — 招式打不同屬性的傷害倍率（含約三成雙屬性題，會考到 ¼× / 4×）。
2. **種族值 · 誰比較快** — 兩隻寶可夢二選一，純比種族值速度（不計天氣、招式、特性）。題庫依《寶可夢 冠軍》賽制 **M-A / M-B** 的寶可夢名單，**Mega 視為獨立個體**。

另有**屬性相剋查詢**：選攻擊／防禦（可雙屬性）即時看倍率 + 完整 18×18 相剋表。

## 成績碼 / 一起測

`?c=<碼>` 編入 `測驗類型 + 賽季 + seed + 題數 + 分數`（base64url）。seed 經確定性 PRNG 重現完全相同題目：
- **挑戰**：分享做完的成績碼，對方看到你的分數、玩同一份、結果頁比輸贏。
- **一起測**：準備畫面開局前就有「題目碼」（分數記 0），兩人各自貼同碼拿同一份題目。

## 開發

```bash
npm test         # node:test 跑純邏輯（相剋表 / seed 決定論 / 速度題 / 成績碼）
npm run dev      # 本機靜態 server，http://localhost:4173
npm run build:dex  # 重新產生 src/data/pokedex.json（見下方「更新賽季名單」）
```

## 架構

純 ES Modules，無 build step。同一份模組既跑瀏覽器也被 `node --test` 直接 import。

| 檔案 | 職責 |
| --- | --- |
| `src/data/typechart.js` | 18 屬性相剋資料 + 倍率計算（純函式） |
| `src/data/seasons.json` | **賽季名單**（你維護）：每賽季的寶可夢 form 名清單 + `manual` 手動條目 |
| `src/data/pokedex.json` | 由 `build:dex` 產生：每隻的速度、中/英名、立繪 URL、是否 Mega |
| `scripts/build-pokedex.mjs` | 讀 seasons.json → 抓 PokéAPI → 產 pokedex.json（離線執行） |
| `src/rng.js` | 確定性 PRNG（xmur3 + mulberry32）— 成績碼可重現測驗的基礎 |
| `src/quiz.js` | 屬性題 / 速度題產生、計分（純函式，速度題的池由外部傳入） |
| `src/share.js` | 成績碼編解碼（v2 帶類型/賽季；相容舊 v1；壞碼回 `null`） |
| `src/i18n.js` / `src/app.js` | 字典 + `t()`／瀏覽器 UI、hash 路由 |

## 更新賽季名單（週期性維護）

1. 編輯 `src/data/seasons.json` 的 `seasons.<賽季>.members`（用 PokéAPI 的 form 名，如 `charizard-mega-x`）。
2. 跑 `npm run build:dex` 重新產生 `pokedex.json`。**runtime 不會即時抓 API**。
3. 名單來源建議：《寶可夢 冠軍》賽制頁，例如 [GameWith（繁中）](https://gamewith.ai/pokemon-champions/zh-hant) 或 Serebii 的 Regulation 頁。
4. **《冠軍》原創新 Mega**（Mega Staraptor / Scolipede / Scrafty / Eelektross / Pyroar / Malamar / Barbaracle / Dragalge / Falinks / Raichu X·Y）目前**已被 PokéAPI 收錄**（含官方立繪，速度經 Serebii 冠軍 Pokédex 交叉驗證一致），直接列在 members 即可由 `build:dex` 抓取。若日後遇到 PokéAPI 還沒收錄的條目，再手填到 `manual` 區塊（`{ dex, speed, nameZh, nameEn, image, mega:true }`），`build:dex` 會合併進去。
   - 注意 PokéAPI 的 form 名細節：Pyroar 的基本型是 `pyroar-male`（非 `pyroar`）。

## 圖片取得方式（穩定來源）

寶可夢立繪以 **runtime 即時載入**，URL 存在 `pokedex.json` 內，採 PokéAPI 官方立繪的穩定路徑（以 PokéAPI 的 id 定位，Mega 各有獨立 id）：

```
https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/<id>.png
```

`build:dex` 會把這個 URL 寫進資料；要改用其他 CDN／本地 vendor 只需改 `scripts/build-pokedex.mjs` 的 `image` 欄位產生方式。

## 部署（Cloudflare Pages）

靜態站，免 build。Framework preset 選 **None**、build command 留空、output 目錄設專案根目錄。hash 路由 + query 參數皆走 `index.html`，不需 redirect 設定。

## 資料 / 圖片來源（備忘，非商用、頁面不另標 license）

僅作自己參考：屬性符號 `assets/types/*.svg` 來自 [duiker101/pokemon-type-svg-icons](https://github.com/duiker101/pokemon-type-svg-icons)；寶可夢種族值與立繪來自 [PokéAPI](https://pokeapi.co/)；賽制名單參考 GameWith / Serebii。屬性色與寶可夢相關內容版權屬 Nintendo / Game Freak / The Pokémon Company。
