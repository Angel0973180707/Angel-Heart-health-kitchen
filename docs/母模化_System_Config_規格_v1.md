# 幸福緣好物市集 — 母模化 System_Config 規格 v1

> 狀態：**草案，未實作**｜建立日期：2026-07-07｜對應盤點：Phase 0-A / Phase 0-B
> 目前正式主線：`security/admin-auth`（本文件不涉及任何 push / merge main 的動作）

## Codex 補註（2026-07-07，Phase 1-A）

1. **⚠️ `security/admin-auth` 的 upstream tracking 目前指向 `origin/main`，不是 `origin/security/admin-auth`。**
   實際檢查結果：`git branch -vv` 顯示 `security/admin-auth [origin/main: ahead 1]`，`git rev-parse security/admin-auth@{upstream}` 回傳 `origin/main`。
   這代表如果之後有人在這條 branch 上執行「沒有明確指定目標」的 `git push`（不加 `origin HEAD:security/admin-auth`），**預設行為會嘗試推去 `origin/main`**，等於在無意間把 main 更新掉。
   本文件先明確記錄這個風險，**不在本輪修正**（修正 upstream tracking 不屬於 Phase 1-A 文件草案範圍），後續需要獨立整理（例如執行 `git branch --set-upstream-to=origin/security/admin-auth`），且應在 Angel 明確授權後才動手。目前的應對方式是：所有 push 動作都手動明確指定 `git push origin HEAD:security/admin-auth`，不依賴預設 push 行為。

2. **`main` 分支暫時凍結**：不刪除、不修改、不合併（no merge / no rebase / no reset / no force push）。main 目前落後 `security/admin-auth` 114 個 commit，且 GitHub Pages 實際發布來源推測為 `security/admin-auth`（詳見 Phase 0-A 盤點），在沒有 Angel 明確重新規劃分支策略之前，main 維持原樣不動。

3. **Phase 1 不直接大改 UI / GAS**：本階段（Phase 1-B 起）只先定義 config key 清單與讀取策略骨架，不會一次性替換大量 HTML 顯示文字或 GAS 邏輯。實際替換 UI 字串、串接 `getSystemConfig()` 等動作都排在後面的 Phase（1-C 之後），且每個 Phase 都要先出 diff 草案給 Angel 審核，才能動手實作。

---

## 一、母模化目標

這套系統目前是「幸福緣好物市集」單店專用版本，程式碼裡直接寫死了商家名稱、GAS 網址、LINE 官方帳號、收款帳戶等資訊。

未來目標是把這套系統變成**可以複製給第二家、第三家商家使用的輕量 SaaS 母模**：同一套程式碼（HTML + GAS），只要換一組設定值，就能變成另一家店的系統，而不需要在 HTML / GAS 原始碼裡逐一搜尋取代品牌字串。

**核心原則：商家資訊不得寫死在 HTML / GAS 程式邏輯裡，必須集中存放在一張設定表（System_Config），由程式在執行時讀取。**

這份文件只定義「規格」，不涉及實作。實作會在 Phase 1 之後分批進行，每批都要先出 diff 草案審核（依照 [[母模開發永久規則]] 第 9 條）。

---

## 二、System_Config 表格設計

建議在 Google Sheet 新增一張表，命名為 `System_Config`（屬於 Phase 0-B 盤點結論裡「不動既有 14 張表」的例外——這是**新增**一張表，不修改既有 14 張表的任何欄位或資料）。

| 欄位 | 說明 |
|---|---|
| `key` | 設定項目的唯一識別碼，全大寫、底線分隔（例：`BRAND_NAME`） |
| `value` | 該商家目前的實際設定值 |
| `description` | 白話說明這個設定是做什麼用的，給非技術背景的人也能看懂 |
| `scope` | 誰可以讀取這個設定：`frontend`（前端可讀）／`gas`（只有 GAS 後端可讀）／`both`（兩邊都可讀） |
| `type` | 值的型態：`string` / `url` / `color` / `number` / `boolean` / `secret` |
| `required` | 是否為必填（`TRUE` / `FALSE`）——若為 TRUE 但 value 空白，系統應該有明顯警示，而不是靜默失敗 |
| `default_value` | 沒有設定時的預設值（給新商家開站時的初始值，或作為現有「幸福緣」商家的既有寫死值，做為遷移對照） |
| `example` | 範例值，方便未來新商家照著填 |
| `security_level` | `public`（可公開，例如品牌名稱）／`private`（不應該讓一般使用者看到，但技術上不算機密，例如試算表 ID）／`secret`（絕對機密，例如 LINE Token，一律只能存在 GAS Script Properties，不進 System_Config 分頁本身也可以，視實作階段決定） |
| `notes` | 補充備註，例如「目前寫死在 leader.html:223，Phase 1-C 才會替換」 |

---

## 三、初版 config key 清單

### 品牌
| key | type | scope | security_level | 對應目前寫死位置（Phase 0-B 盤點結果） |
|---|---|---|---|---|
| `BRAND_NAME` | string | both | public | index.html / shop.html / leader.html / event.html 的 `<title>`、`brand-name` 等 27+ 處 |
| `BRAND_SHORT_NAME` | string | both | public | manifest.json `short_name` |
| `BRAND_SUBTITLE` | string | frontend | public | 例如各頁面的品牌副標（目前為隱含在各頁標題文案中，尚無獨立欄位） |
| `LOGO_URL` | url | frontend | public | shop.html / event.html 的 `logo.png` 引用 |
| `THEME_COLOR_PRIMARY` | color | frontend | public | 各檔案 `:root { --green-dark: #1B3A2A; ... }` 主色 |
| `THEME_COLOR_SECONDARY` | color | frontend | public | 同上，輔色（例：`--green-soft`） |

### 網址
| key | type | scope | security_level | 對應目前寫死位置 |
|---|---|---|---|---|
| `SITE_BASE_URL` | url | both | public | index.html:3720、leader.html:224 等 `github.io/Angel-Heart-health-kitchen` |
| `GAS_URL` | url | frontend | public | index.html:1073、shop.html:503、leader.html:223、event.html:293、event_admin.html:192（五處各自寫死同一個值） |
| `SHOP_URL` | url | frontend | public | 可由 `SITE_BASE_URL` 組合，見第四節 |
| `LEADER_URL` | url | both | public | 同上，且 gas_event_clean.js:5229 後端也寫死一次 |
| `EVENT_URL` | url | frontend | public | 可由 `SITE_BASE_URL` 組合 |

### LINE
| key | type | scope | security_level | 對應目前寫死位置 |
|---|---|---|---|---|
| `LINE_OA_URL` | url | frontend | public | shop.html（`lin.ee/tMag2XG`）、event.html（`line.me/R/ti/p/@862hjyvx`）——**兩處格式不一致，指向同一帳號，Phase 1-C 需一併確認統一** |
| `LINE_TOKEN` | secret | gas | secret | gas_event_clean.js 已透過 `PropertiesService.getScriptProperties().getProperty('LINE_TOKEN')` 讀取，**已符合設定化模式，不需要遷移，列在此處只為完整性** |

### 金流
| key | type | scope | security_level | 對應目前寫死位置 |
|---|---|---|---|---|
| `PAYMENT_BANK` | string | frontend | private | shop.html:342/364「中華郵政（700）」、event_admin.html:326 |
| `PAYMENT_ACCOUNT` | string | frontend | private | shop.html:343/365「0041336-0597692」 |
| `PAYEE_NAME` | string | frontend | private | shop.html:344/366、event_admin.html:328、index.html:2050「李秀芳」 |

### 系統功能開關
| key | type | scope | security_level | 說明 |
|---|---|---|---|---|
| `ENABLE_GROUP_BUY` | boolean | both | public | 是否開放團購/集單功能（目前幸福緣為 TRUE，新商家可能不需要） |
| `ENABLE_POS` | boolean | both | public | 是否開放現場銷售 POS 功能 |
| `ENABLE_EVENTS` | boolean | both | public | 是否開放活動報名功能（event.html / event_admin.html） |
| `ENABLE_MEMBER_POINTS` | boolean | both | public | 是否開放會員點數功能 |

### 會員/點數
| key | type | scope | security_level | 說明 |
|---|---|---|---|---|
| `POINTS_RATE` | number | both | public | 消費金額轉換點數的比例（目前規則待從既有邏輯確認，本文件僅先佔位） |
| `MEMBER_JOIN_MIN_SPEND` | number | both | public | 加入會員的最低消費門檻（若無此規則則預設 0，代表不限制） |

### 其他
| key | type | scope | security_level | 對應目前寫死位置 |
|---|---|---|---|---|
| `DEFAULT_SUPPLIER_NAME` | string | frontend | public | index.html:248/1358 供應商欄位預設值 |
| `DEFAULT_PICKUP_TEXT` | string | frontend | public | 取貨說明預設文案（目前散落於各團購/活動頁面文案中，尚無獨立欄位，Phase 1 不優先處理） |

### 安全待處理
| key | type | scope | security_level | 備註 |
|---|---|---|---|---|
| `SHOP_QUERY_TOKEN` | secret | gas | secret | ⚠️ **目前是寫死在 shop.html 前端原始碼裡的固定字串 `YC_SHOP_2026`（shop.html:759, 821），任何人打開瀏覽器「檢視原始碼」都能看到，等於沒有真正的驗證效果。這不只是「換商家要改設定」的問題，是現在就存在的安全風險。Phase 1 建立 System_Config 時，不會立即修這個洞——需要獨立排一個安全修復項目（可能要改成後端驗證手機號碼歸屬，而不是靠一個固定字串），不應該和母模化重構混在一起評估優先順序，以免拖慢兩邊進度。** |

---

## 四、讀取策略設計

### 1. Public frontend config（前端可直接讀取）
給所有前端頁面（index.html / shop.html / leader.html / event.html / event_admin.html）在載入時讀取的設定，不含任何機密：

- `BRAND_NAME`
- `BRAND_SHORT_NAME`
- `BRAND_SUBTITLE`
- `LOGO_URL`
- `THEME_COLOR_PRIMARY`
- `THEME_COLOR_SECONDARY`
- `SITE_BASE_URL`
- `GAS_URL`
- `LINE_OA_URL`
- `PAYMENT_BANK` / `PAYMENT_ACCOUNT` / `PAYEE_NAME`（雖標記 `private`，但因為現有流程本來就會把付款資訊顯示給顧客看，屬於「業務上必須讓使用者看到」的性質，不是機密——`private` 在此指的是「不應該被搜尋引擎索引或公開展示在無關頁面」，非帳號密碼等級的機密）
- `ENABLE_GROUP_BUY` / `ENABLE_POS` / `ENABLE_EVENTS` / `ENABLE_MEMBER_POINTS`
- `POINTS_RATE` / `MEMBER_JOIN_MIN_SPEND`
- `DEFAULT_SUPPLIER_NAME` / `DEFAULT_PICKUP_TEXT`

### 2. Private GAS config（只能 GAS 後端讀取，絕不回傳給前端）
- `SPREADSHEET_ID`
- `LINE_TOKEN`
- `SHOP_QUERY_TOKEN`（修復後的新版本，若改為某種伺服器端驗證機制所需的密鑰）
- 任何未來新增的 API 金鑰、金流商戶密鑰等

這一類設定**不會**出現在 `getSystemConfig()` 這種給前端呼叫的 API 回傳結果裡，只透過 `PropertiesService.getScriptProperties()` 或 System_Config 表格搭配 `scope = gas` 過濾後在 GAS 內部使用。

### 3. Derived config（由其他設定值組合出來，不需要單獨存一筆）
- `SHOP_URL` = `SITE_BASE_URL` + `/shop.html`
- `LEADER_URL` = `SITE_BASE_URL` + `/leader.html`
- `EVENT_URL` = `SITE_BASE_URL` + `/event.html`

這樣未來商家換網域時，只需要改一個 `SITE_BASE_URL`，三個頁面網址自動一起變動，不用三個 key 各改一次、也不容易漏改。

---

## 五、Phase 1 實作順序建議（最小風險優先）

> 以下皆為**未來規劃**，本輪只出文件草案，不實作任何一項。每個 Phase 開始前都要先出 diff 草案給 Angel 審核。

**Phase 1-B：建立讀取骨架，不換文案**
- GAS 新增 `getSystemConfig()`，回傳 `scope = frontend/both` 且 `security_level = public` 的設定項目
- 前端頁面新增載入這個 API 的邏輯，把結果存在一個全域變數
- **不**把任何現有的寫死字串換成讀取這個變數——這一步只是把「水管接好」，還沒「接電」，風險最低，出錯範圍只限於新增的這段程式碼本身

**Phase 1-C：替換網址與 LINE 相關**
- 把 `GAS_URL`、`SITE_BASE_URL`（連帶 derived 出的 `SHOP_URL`/`LEADER_URL`/`EVENT_URL`）、`LINE_OA_URL` 從寫死常數改成讀取 Phase 1-B 載入的設定值
- 這批風險偏低，因為值目前只有一組，替換後行為應該完全不變（可用「改前改後渲染結果應該逐字一致」來驗收）
- 同時處理 shop.html 與 event.html 的 LINE 連結格式不一致問題

**Phase 1-D：替換品牌名稱顯示**
- `BRAND_NAME` / `BRAND_SHORT_NAME` / `BRAND_SUBTITLE` 取代四個 HTML 檔案裡 27+ 處寫死的「幸福緣好物市集」
- 風險中等，因為出現次數多、分散在多個檔案，需要逐一確認每一處是「顯示文字」還是「邏輯判斷用字串」（例如是否有程式碼拿品牌名稱去做字串比對），避免抽換後改壞邏輯判斷

**Phase 1-E：替換付款資訊**
- `PAYMENT_BANK` / `PAYMENT_ACCOUNT` / `PAYEE_NAME` 取代 shop.html、event_admin.html、index.html 裡的收款帳戶寫死值
- 風險最高，因為牽涉真實金流顯示，改錯會直接影響顧客實際匯款對象。這批完成後需要有額外的人工驗證步驟（例如先在測試環境確認匯款資訊顯示正確，才能上正式）

**Phase 1-F：處理 `SHOP_QUERY_TOKEN` 安全問題**
- 獨立評估這個寫死 token 的修復方案（例如改成後端驗證手機號碼實際歸屬，而不是靠一個前端可見的固定字串）
- 這一項本質上是安全修復，不是單純的母模化字串替換，建議跟 Angel 額外說明評估時間，不要跟其他 Phase 1 項目綁在一起排期

---

## 六、不得現在做的事

以下項目**明確排除在 Phase 1 之外**，不在這輪、也不在近期規劃範圍內：

- **不合併 main** —— main 落後 114 個 commit，任何合併動作都需要 Angel 另外明確授權，且要先確認 GitHub Pages 實際發布來源
- **不重構 CSS 色票** —— shop.html / event.html / leader.html 三份重複的 `:root` 色票變數，暫不抽成共用檔案，避免排版跑掉
- **不動 manifest.json 動態化** —— PWA manifest 是靜態檔案，要做到「每家店不同 manifest」需要額外建置流程，技術複雜度高，本階段不處理
- **不合併 `gas_complete.js` / `gas_event_clean.js`** —— 這兩個檔案目前都各自存一份相同的 `SPREADSHEET_ID`，但在沒有搞清楚兩者實際運作關係（是否同時部署、各自對應哪些功能）之前，不能合併或刪除任一份
- **不一次替換全部品牌文案** —— Phase 1-D 只處理主要顯示位置，不強求一次性掃描替換所有可能出現品牌字樣的角落（例如分享文案模板裡的品牌字樣，屬於「內容」而非「介面顯示邏輯」，可留待更後面處理）
- **不動既有 14 張表欄位** —— `System_Config` 是新增的一張表，不會修改、新增或刪除既有 14 張表的任何欄位或資料

---

## 附錄：本文件與既有規則的關係

本規格延伸自 2026-07-07 訂下的母模開發永久規則（10 條），特別對應：
- 第 1 條「不得寫死商家資料」→ 本文件第二、三節
- 第 7 條「不得破壞既有 14 張表」→ 本文件第六節明確重申
- 第 9 條「實作前必須先出 diff 草案」→ 本文件第五節每個 Phase 皆需個別出 diff 草案，本文件本身不構成實作授權

---

*本文件為草案，尚未實作任何程式碼變更。後續每個 Phase 的實作都需要 Angel 個別審核通過。*
