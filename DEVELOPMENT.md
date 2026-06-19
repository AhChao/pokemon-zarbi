# 開發筆記（pokemon-zarbi）

面向維護者。使用者導向的介紹在 [`README.md`](./README.md)。

> 個人臨時備忘請寫進 `*.local.md`（已 gitignore，不會推上 GitHub），不要塞進這份文件。

## 硬規則

- **禁止 emoji**：本 repo 任何地方（HTML / JS / CSS content / 文案）都不得使用 emoji。所有圖示一律用 **SVG**（`assets/ui/*.svg`、`assets/types/*.svg`，或 inline `<svg>`）。

## 本機開發

```bash
npm test           # node:test 跑純邏輯（相剋表 / seed 決定論 / 速度題 / 成績碼）
npm run dev        # 本機靜態 server，http://localhost:4173
npm run build:dex  # 重新產生 src/data/pokedex.json（見下方「更新賽季名單」）
```

## 架構

純 ES Modules，無 build step。同一份模組既跑瀏覽器也被 `node --test` 直接 import。所有資源走相對路徑（`./...`），所以在 GitHub Pages 子路徑（`/pokemon-zarbi/`）下也能正常解析。

| 檔案 | 職責 |
| --- | --- |
| `src/data/typechart.js` | 18 屬性相剋資料 + 倍率計算（純函式） |
| `src/data/seasons.json` | **賽季名單**（手動維護）：每賽季的寶可夢 form 名清單 + `manual` 手動條目 |
| `src/data/pokedex.json` | 由 `build:dex` 產生：每隻的速度、**完整種族值 `stats{hp,atk,def,spa,spd,spe}` 與 `bst`**、中/英名、立繪 URL、是否 Mega。種族值幾乎不會變動，存成本地靜態資料（可離線分析、為 BST 模式預留） |
| `scripts/build-pokedex.mjs` | 讀 seasons.json → 抓 PokéAPI → 產 pokedex.json（離線執行） |
| `src/rng.js` | 確定性 PRNG（xmur3 + mulberry32）— 成績碼可重現測驗的基礎 |
| `src/quiz.js` | 屬性題 / 速度題產生、計分（純函式，速度題的池由外部傳入）。速度題吃 `difficulty`（`all`/`easy`/`medium`/`hard`），以兩隻速度差分桶（連續不重疊：困難 1–5、中等 6–19、簡單 ≥20；`all` 不限、等同舊行為） |
| `src/share.js` | 成績碼編解碼（v2 帶類型/賽季；速度題再加**選用的第 7 欄難度** `a/e/m/h`，缺欄＝`all` 以重現舊碼；相容舊 v1；壞碼回 `null`） |
| `src/i18n.js` / `src/app.js` | 字典 + `t()`／瀏覽器 UI、hash 路由 |

## 更新賽季名單（週期性維護）

賽季名單是週期性手動維護的檔，更新流程如下：

1. 編輯 `src/data/seasons.json` 的 `seasons.<賽季>.members`（用 PokéAPI 的 form 名，如 `charizard-mega-x`）。
2. 跑 `npm run build:dex` 重新產生 `pokedex.json`。**runtime 不會即時抓 API**。
3. 名單來源建議：《寶可夢 冠軍》賽制頁，例如 [GameWith（繁中）](https://gamewith.ai/pokemon-champions/zh-hant) 或 Serebii 的 Regulation 頁。
4. **《冠軍》原創新 Mega**（Mega Staraptor / Scolipede / Scrafty / Eelektross / Pyroar / Malamar / Barbaracle / Dragalge / Falinks / Raichu X·Y）目前**已被 PokéAPI 收錄**（含官方立繪，速度經 Serebii 冠軍 Pokédex 交叉驗證一致），直接列在 members 即可由 `build:dex` 抓取。若日後遇到 PokéAPI 還沒收錄的條目，再手填到 `manual` 區塊（`{ dex, speed, stats:{hp,atk,def,spa,spd,spe}, bst, nameZh, nameEn, image, mega:true }`；速度題只需 `speed`，但補上 `stats`/`bst` 才能進未來的 BST 分析），`build:dex` 會合併進去。
   - 注意 PokéAPI 的 form 名細節：Pyroar 的基本型是 `pyroar-male`（非 `pyroar`）。

## 圖片取得方式（穩定來源）

寶可夢立繪以 **runtime 即時載入**，URL 存在 `pokedex.json` 內，採 PokéAPI 官方立繪的穩定路徑（以 PokéAPI 的 id 定位，Mega 各有獨立 id）：

```
https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/<id>.png
```

`build:dex` 會把這個 URL 寫進資料；要改用其他 CDN／本地 vendor 只需改 `scripts/build-pokedex.mjs` 的 `image` 欄位產生方式。

## 部署

### GitHub Pages（主要，自動化）

`.github/workflows/deploy.yml` 在 push 到 `master` 時自動把整個 repo 根目錄發佈到 GitHub Pages，網址 <https://ahchao.github.io/pokemon-zarbi/>。

**一次性設定**（只需做一次）：到 repo **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。或用 CLI：

```bash
gh api -X POST repos/AhChao/pokemon-zarbi/pages -f build_type=workflow
```

之後每次 push 到 `master`（或在 Actions 頁手動 `workflow_dispatch`）就會重新部署。GitHub Pages 不支援自訂 response header，故 `_headers` 在這裡不生效；快取由 Pages 自行處理（HTML 短快取、帶 ETag）。

### Cloudflare Pages（備選）

靜態站，免 build。Framework preset 選 **None**、build command 留空、output 目錄設專案根目錄。hash 路由 + query 參數皆走 `index.html`，不需 redirect 設定。Cloudflare 會套用根目錄的 `_headers`（見下）。

#### 快取策略（`_headers`，僅 Cloudflare）

依 `static-asset-cache-policy`：本站無 content-hash，故會變動的檔（HTML / JS / CSS / 資料 JSON）用 `Cache-Control: no-cache`——瀏覽器存下 body 但每次用 ETag 重新驗證，未變回 304（零 body、不重新下載），改版即拿到新樣式/程式碼；**不用 `no-store`**（那才會每次整包重載）。穩定的本地 SVG 圖示（`/assets/*`）給 30 天快取省掉重複驗證。寶可夢立繪走外部 PokéAPI/GitHub CDN，由上游長快取。Cloudflare Pages 會自動產生 ETag 並處理 304；前緣需尊重來源 header（Pages 預設如此），這是部署時的驗收點。

## 資料 / 圖片來源（備忘，非商用、頁面不另標 license）

僅作自己參考：屬性符號 `assets/types/*.svg` 來自 [duiker101/pokemon-type-svg-icons](https://github.com/duiker101/pokemon-type-svg-icons)；寶可夢種族值與立繪來自 [PokéAPI](https://pokeapi.co/)；賽制名單參考 GameWith / Serebii。屬性色與寶可夢相關內容版權屬 Nintendo / Game Freak / The Pokémon Company。左上 logo 與 favicon（`assets/ui/logo-unown.svg`、`assets/ui/favicon.svg`）為原創的「未知圖騰 U 形」風格化造型，把單眼換成問號以呼應快問快答。
