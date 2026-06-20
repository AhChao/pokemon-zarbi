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
| `src/data/pokedex.json` | 由 `build:dex` 產生（**Champions 賽季名單**）：每隻的速度、**完整種族值 `stats{hp,atk,def,spa,spd,spe}` 與 `bst`**、中/英名、`types`（屬性，供圖鑑過濾）、立繪 URL、是否 Mega、`dex`（form id）、`ndex`（種族國家圖鑑編號）。速度測驗 / 我是誰「冠軍賽季」/ 圖鑑「賽制」吃這份 |
| `src/data/dex-national.json` | 由 `build:national` 產生（**全國圖鑑分世代**，含未進化）：`{ndex, nameZh, nameEn, types, mega, image}`。我是誰的世代/地區池與圖鑑「世代/地區」吃這份，與賽季名單脫鉤（所以第一世代有小火龍/火恐龍，不只噴火龍） |
| `scripts/build-national-dex.mjs` | 爬 PokéAPI `/generation/{1..9}` → 每代 species 的預設形態 + Mega + 地區形態，產 `dex-national.json`（跳過 Gmax 等其他形態）|
| `scripts/formname.mjs` | 形態顯示名共用工具（Mega「超級…X/Y/Z」、地區形態「阿羅拉/伽勒爾/洗翠/帕底亞…」、帕底亞肯泰羅 breed「鬥戰/火炎/流水種」），`build:dex` 與 `build:national` 共用避免命名漂移 |
| `scripts/build-pokedex.mjs` | 讀 seasons.json → 抓 PokéAPI → 產 pokedex.json（離線執行）。Mega 中文名用**官方格式**「超級」+ 名稱（+ X/Y/Z，無空格，如 `超級噴火龍Y`）；**地區形態**（PokéAPI 種族名各形態共用）自行加前綴：中文 `阿羅拉/伽勒爾/洗翠/帕底亞`、英文 `Alolan/Galarian/Hisuian/Paldean`（如 `ninetales-alola` → 阿羅拉九尾） |
| `src/rng.js` | 確定性 PRNG（xmur3 + mulberry32）— 成績碼可重現測驗的基礎 |
| `src/quiz.js` | 屬性題 / 速度題 / 我是誰題產生、計分（純函式，池由外部傳入）。速度題吃 `difficulty`（`all`/`easy`/`medium`/`hard`），以兩隻速度差分桶（連續不重疊：困難 1–5、中等 6–19、簡單 ≥20；`all` 不限、等同舊行為）。我是誰（`generateWhoQuiz`）吃 `difficulty`（`easy`/`normal`/`hard`），難度只決定 **Mega 是否進池**（hard 才含）；提示由 UI 端呈現。`normalizeName`/`whoAnswerCorrect` 只比**中文名**（不收 Pokémon 英文名）：全形→半形、轉小寫、去空白後比對，讓中文名內含的英數（如 3D龍、超級噴火龍Y）大小寫/全形互通。`speedLines(base)` 由速度種族值算 Lv50 速度線（最速/準速/無振/減速＋圍巾×1.5/順風×2），用整數運算避免浮點誤差。`whoCharScore`/`scoreQuizChar` 為我是誰「按字計分」（每隻 10 分、每字 10/長度，輸入依序子序列比對；可跳過漏字、順序要對）|
| `src/doku.js` | **寶可夢數獨**（PokeDoku-style 3×3 盤面）產生器與判定（純函式，吃 `dex-national.json`）。類別全由現有資料導出：屬性（`types` 含 T）／地區（`ndex` 世代區間，地區形態仍歸本體世代）／純單屬性（`types.length===1`）／Mega（`mega`）／名字字數（`baseName` 去形態前綴後的中文名長度，2–6 字）。`generateDoku(seed,dexMap)`：用 `rng.js` 種子化挑 6 個相異標籤（3 列＋3 行），**逐格驗證交集 ≥2** 才採用、退路用「地區×屬性」（必稠密、零空格）保證一定有盤；每格記合法解數與 **canonical**（先非 Mega、再最小 `ndex`，供「公布解答」reveal）。**任一合法都算對**（同 PokeDoku），canonical 只供 reveal/保證有解。同 seed → 同盤，分享碼只需帶 seed。`cellSatisfied(entry,rowCat,colCat)` 供 UI 驗證使用者填入 |
| `src/share.js` | 成績碼編解碼（v2 帶類型/賽季；速度題加**選用的第 7 欄難度**，我是誰**一律**附第 7 欄 `a/v/e/n/m/h`，缺欄＝`all` 以重現舊速度碼；數獨 mode 碼 `k`、`season` 用 `-`、`total` 固定 9、`score`＝九格答對數；相容舊 v1；壞碼回 `null`）。我是誰的 `season` 欄存**池鍵**（`all`/`g1`..`g9`/`hisui`/賽季鍵）；`total`＝題數（**10–20，所有模式皆可調**，預設 10）。**計分方式**（單選）：不計分（預設，只顯示「答對 X/Y 題」）／正常計分（對/錯換算 100 分）／按字計分（我是誰專屬、逐字部分分換算 100）。成績碼用**大寫旗標**（與小寫難度碼區分）`N`=正常計分、`C`=按字計分，不計分不附旗標；`C` 時 `score` 存百分制 ×100 整數，其餘存答對題數 |
| `src/i18n.js` / `src/app.js` | 字典 + `t()`／瀏覽器 UI、hash 路由。我是誰的**世代/地區分池**（`genKeyOf`）住在 `app.js`，吃 `dex-national.json`：一般／Mega 依本體國家圖鑑編號 `ndex` 分段；**地區形態歸到該形態登場的世代/地區**（`REGION_GEN`：阿羅拉→g7、伽勒爾→g8、帕底亞→g9），而非本體編號所屬世代（如阿羅拉九尾 ndex 38 但歸第七世代阿羅拉，不歸關都）；**洗翠**（Legends Arceus，世代算 g8 但地區非伽勒爾）獨立成 `hisui` 桶；冠軍賽季池則改吃 `pokedex.json`（Champions 名單）；黑影效果為 CSS `filter: brightness(0)`，作答後揭曉。「速度線表」（`#/speedline` → `viewSpeedChart`/`buildSpeedTable`）入口在速度測驗 setup，依當前賽季把同速寶可夢排一列、橫向可捲。「圖鑑」（`#/dex` → `viewDex`）入口在我是誰 setup：兩組標籤（世代/地區 + 賽制）、屬性過濾（單選）、全彩縮圖牆，點縮圖浮出名字 5 秒（`whoPool` 同時供世代/地區與賽季池）。「**寶可夢數獨**」（`#/doku` → `viewDoku`）為獨立盤面（首頁卡片直接進、不走線性 setup）：軸標籤屬性用 type-badge、其餘用文字 pill；點空格開**自製搜尋彈窗**（`openDokuPicker`，非原生）即時過濾全國圖鑑（中／英子字串，重用 `normalizeName` 與 dex 立繪渲染），互動照 searchable-select 合約（自動聚焦／↑↓／Enter／Esc）並套 ime-safe（中文組字中的 Enter 不誤送）；每格一次機會、同一隻（依 `ndex`）不可重複，計分 X/9，可「公布解答」reveal canonical。數獨**不寫入 localStorage 歷史**（分享碼即可重現同盤）|

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

## 資料 / 圖片來源與授權（備忘）

非商用同人專案。本專案程式碼與原創素材採 MIT（見根目錄 `LICENSE`）；使用者可見的致謝在 `README.md`「致謝」段。各來源已查證的授權狀況：

- **寶可夢立繪（runtime）**：來自 [PokéAPI](https://pokeapi.co/) 的 `PokeAPI/sprites` repo，該 repo 以 **CC0 1.0** 散布（`LICENCE.txt`），但明文「All image contents are Copyright The Pokémon Company」——CC0 不強制署名，但圖像版權與商標仍歸 TPC。
- **寶可夢種族值 / 中英名（build 進 JSON）**：PokéAPI。其 about 頁只聲明名稱為任天堂商標，**未宣告 CC0**；惟種族值/名稱屬事實性資料，不受著作權保護。
- **屬性符號 `assets/types/*.svg`**：來自 [duiker101/pokemon-type-svg-icons](https://github.com/duiker101/pokemon-type-svg-icons)。**該 repo 沒有正式 LICENSE 檔**（GitHub license API 回 404），README 僅寫 “for any use”，原始設計出自 [Dribbble「Pokedex iOS app」](https://dribbble.com/shots/4862612)。屬性符號本身是遊戲官方圖像，無論誰重繪都回溯 TPC，與其餘 Pokémon IP 同受 README 免責涵蓋。
  - ponytail: 替代評估（另案）——找一套有明確 CC0/MIT LICENSE、視覺可接受的 18 屬性符號 drop-in，經 Steven 拍板後再換，以消除此處唯一的授權留白。
- **賽制名單**：人工參考 GameWith / Serebii（見「更新賽季名單」）。
- **屬性色與寶可夢相關內容**：版權與商標屬 Nintendo / Game Freak / The Pokémon Company。
- **原創素材**：左上 logo 與 favicon（`assets/ui/logo-unown.svg`、`assets/ui/favicon.svg`）為原創的「未知圖騰 U 形」風格化造型，把單眼換成問號以呼應快問快答；採本專案 MIT 授權。
