---
name: pokemon-data-fetch
description: 取得與驗證寶可夢資料（種族值/速度、中英名、立繪）與《冠軍》賽季名單的可靠流程與來源。當要更新 seasons.json、新增賽季/寶可夢、補 Mega 或查證種族值時使用。
---

# Pokémon 資料抓取流程

本 repo 的寶可夢資料**離線產生、runtime 不抓 API**。資料流：

```
src/data/seasons.json (你維護的名單)
   └─ scripts/fetch-champions-roster.mjs  (爬 Serebii 索引展開 form 名)
   └─ scripts/build-pokedex.mjs           (抓 PokéAPI 種族值/名/立繪)
        └─ src/data/pokedex.json          (app 載入這份)
```

更新後務必 `npm run build:dex`。

## 來源（依用途）

- **PokéAPI** `https://pokeapi.co/api/v2/` — 種族值、中英名、立繪、form 列表。**首選結構化來源**。
  - `/pokemon/<form>` → `stats[].base_stat`（speed）、`sprites.other.official-artwork.front_default`、`id`。
  - `/pokemon-species/<name>` → `names[]`（中文語言碼是 **`zh-hant`**，小寫）、`varieties[]`（含各 Mega，`is_default` 為預設形態）。
- **Serebii 冠軍 Pokédex** `https://www.serebii.net/pokedex-champions/` — ① 索引頁列出遊戲內全部 species（爬 `/pokedex-champions/<slug>/`）；② 各頁有種族值表，用來**交叉驗證**新 Mega。
- **GameWith（繁中）** `https://gamewith.ai/pokemon-champions/zh-hant` — 賽制名單、使用率，人工參考。
- **Game8 / Serebii Regulation 頁** — 賽季 M-A / M-B 的新增與規則。

## 可靠性鐵則（踩過的雷）

1. **不要靠 LLM 摘要抓大量清單**（370 筆會漏/錯）。爬索引頁原始 HTML 用 regex，或用 PokéAPI 結構化資料。
2. **Serebii 種族值表欄序固定 = HP / 攻 / 防 / 特攻 / 特防 / 速度**，速度是**最後一欄**。WebFetch 摘要常把欄位標錯，要取整列六個數字自己取尾欄。
3. **Mega 驗證捷徑**：Mega 種族值總和 = 原型 +100。算總和對不對能抓出擷取錯誤。
4. **跨來源比對**：拿 PokéAPI 的速度跟 Serebii 整列尾欄對照，一致才採用。

## Form 名陷阱

- 性別差異預設型不是裸名：皮羅卡是 **`pyroar-male`** 不是 `pyroar`（用 species 的 `is_default` variety 自動解）。
- Mega 各自獨立 entry／id／種族值，視為不同隻。後綴：`-mega`、`-mega-x`、`-mega-y`、`-mega-z`（《冠軍》/Z-A 新 Mega 也已在 PokéAPI）。
- 立繪 URL：
  - PokéAPI 官方立繪：`.../official-artwork/<id>.png`（id 含 Mega 專屬 id）。
  - Serebii（手補用）：`https://www.serebii.net/art/th/<3位數圖鑑編號>-m.png`，X/Y 為 `-mx`/`-my`（**需 3 位數零補位**，如 `026-mx.png`）。

## 何時用 manual

PokéAPI 還沒收錄的條目，才手填到 `seasons.json` 的 `manual`：`{ dex, speed, nameZh, nameEn, image, mega:true }`，`build:dex` 會合併。目前《冠軍》新 Mega 都已在 PokéAPI，manual 保持空白。

## 決定性提醒

速度測驗靠 seed 重現題目，pool 依 key 排序保持穩定。**改動 pokedex.json 會改變既有成績碼能重現的題目**（資料版本變更），屬預期行為。
