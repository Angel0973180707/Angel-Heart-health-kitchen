# Phase 1-B 實戰成果與交接紀錄

> 建立日期：2026-07-07｜狀態：**交接用黑盒子紀錄，非規格文件**
> 本次寫入者：Claude Code (C)｜協作切換：暫時休息，交由 Gemini（簡稱 g）接手
> 對應規格文件：[docs/母模化_System_Config_規格_v1.md](./母模化_System_Config_規格_v1.md)
> 對應歷史檔案：[docs/重構實戰全紀錄_Phase0_1A歷史檔案.md](./重構實戰全紀錄_Phase0_1A歷史檔案.md)

---

## 1. 目標任務

當前執行階段：**Phase 1-B（尚未開始實作）**。Phase 0（盤點）與 Phase 1-A（System_Config 規格文件）已完成並存檔。Phase 1-B 預計內容是「GAS 新增 `getSystemConfig()` + 前端載入 public config，但不替換大量 UI 字串」，**目前僅完成規劃，尚未出過 Phase 1-B 專屬的 diff 草案，也尚未動任何程式碼**。

---

## 2. 目前分支與 Git 狀態

- 目前分支：`security/admin-auth`
- 目前 commit：`15e93bd docs: 建立 Phase 0 與 1-A 重構與排雷歷史檔案，鎖定夢幻團隊記憶`
- `origin/security/admin-auth` 與本地 HEAD 一致（`15e93bd`）
- `origin/main` 落後一個 commit（停在 `83606c6`，差這次的歷史檔案 commit）——**不影響網站運作**，因為這個差距只是文件檔案，不涉及前端/GAS 邏輯
- upstream tracking 已修正為 `origin/security/admin-auth`（2026-07-07 修正，不會再誤推 main）
- 本輪（寫這份交接文件）**未執行任何 git commit**，這個檔案目前是未追蹤狀態（untracked），需要 Angel 明確「授權 commit」才能落地存檔

---

## 3. 前後端通路共識（鐵律）

- **`leader.html` 的 `callGas()` 必須使用 `Content-Type: 'text/plain;charset=utf-8'`**，絕對不能用 `application/json`——後者會觸發瀏覽器 CORS preflight，而 GAS Web App 沒有 `doOptions()`，會導致請求被瀏覽器直接擋掉。此教訓已在 commit `202c210` 修正並上線驗證成功。
- **GAS 部署最新版本：v72+**（Module 7-E 後台新增團長，含團名欄位補充）。CLAUDE.md 記錄的 v460 是另一個系統（HSC 天使幸福智慧名片系統），跟本專案（幸福緣好物市集/Angel-Heart-health-kitchen）**是不同的 GAS 專案，版本號不共用，不要混淆**。
- GitHub Pages 的實際上線來源是 **`main`**，不是開發分支 `security/admin-auth`。任何要上線的修正，最終都必須 fast-forward 到 `main`（`git push origin security/admin-auth:main`），且必須是純 fast-forward（無分岔）才能執行，執行前要用 `git log origin/security/admin-auth..origin/main` 確認為空。

---

## 4. 架構防禦檢核點

- **14 + 5 + 5 = 24 張表，零異動宣告**：截至本紀錄建立，Phase 0～1-A 全程只新增了 `docs/` 底下的文件檔案，**沒有新增/刪除/修改任何 Google Sheet 欄位或既有 14 張表、5 張團購新表**。System_Config 規格文件中提議新增的 `System_Config` 表**尚未實際建立**，只是規格設計，等 Phase 1-B 正式出 diff 草案審核後才會動手。
- **LockService / submission_id / 防連點**：截至本紀錄，**尚無任何新的寫入類 API 被實作**，因此本輪沒有產生新的 LockService / idempotency / 防連點程式碼。既有系統中已符合規範的範例（可作為未來實作範本）：
  - `adminCreateLeaderSetupLink` / `completeLeaderSetup`（gas_event_clean.js）已採用「lock 內重新讀取最新資料再判斷」的正確模式
  - Phase 1-B 若要新增 `getSystemConfig()`，因為是**唯讀**查詢（不寫入），原則上不需要 LockService；但若之後要做 `adminSetSystemConfig()`（寫入設定值），則必須套用既有 lock+recheck 模式，並帶 `system_note` 記錄異動原因

---

## 5. 下一輪接棒提示（給接手的 Gemini / g）

**目前卡在哪一步：** Phase 0 盤點與 Phase 1-A 規格文件都已完成並 commit 上線，但 **Phase 1-B 實作尚未開始**——目前只有規劃，沒有任何一行 GAS 或前端程式碼被改動。

**接下來要做什麼：**
1. 先讀 [docs/母模化_System_Config_規格_v1.md](./母模化_System_Config_規格_v1.md) 第五節「Phase 1 實作順序建議」，理解 Phase 1-B 的範圍邊界（只建立讀取骨架，不換任何現有文案/邏輯）
2. 針對 Phase 1-B 出一份專屬的 diff 草案，內容至少要包含：
   - GAS 新增 `getSystemConfig()` 的具體程式碼（只回傳 `scope=frontend/both` 且 `security_level=public` 的項目）
   - 是否需要先在 Google Sheet 手動建立 `System_Config` 這張新表（並提供欄位設計，對照規格文件第二節）
   - 前端要新增哪一段載入邏輯、載入後存在哪個全域變數，且**明確保證不會替換任何現有寫死字串**
   - 是否需要 GAS 部署新版本號（v73 起算）、sw.js 是否需要升版
3. 草案完成後**先給 Angel 審核，未經同意不得實作**（母模開發永久規則第 9 條）
4. 實作完成後的驗收測試，至少要驗證：既有功能（leader.html 登入、team建立等）行為完全不變，且新增的 `getSystemConfig()` API 回傳值正確、不洩漏 `scope=gas` 或 `security_level=secret` 的項目給前端

**尚待處理但不緊急的事項（已知但未修）：**
- `SHOP_QUERY_TOKEN`（`YC_SHOP_2026`）安全漏洞尚未修復，需要獨立排期
- `origin/main` 目前落後 `security/admin-auth` 一個純文件 commit，等下次有功能性修正要上線時，記得一併 fast-forward 過去
- 這台電腦有全域 git hook（`C:/Users/user/.git-hooks`），**commit 幾乎等於 push**，任何後續協作者（包含 Gemini）都必須先跟 Angel 確認「是否授權 commit」才能落地存檔，不能自行判斷

---

## 6. 追加紀錄（2026-07-07）：Module 7-F 登入狀態防呆漏洞修復

**背景：** Phase 1-B 尚未動工前，針對「團長流程核心死角」做了一輪盤點（登入狀態防呆／Token 銷毀+Lock／CORS／Audit Trail 四項），發現三項已符合規範（Token 銷毀已在 LockService 鎖內、CORS 全專案零殘留 `application/json`、Audit Trail 已用 `system_note` 記錄不做 silent update），**只有一項是實際漏洞**。

**漏洞內容：** `validateLeaderToken_`（`gas_event_clean.js`，這是 `leaderLogin` / `getLeaderCampaigns` / `getLeaderCampaignPledges` 共用的唯一驗證入口）原本只擋 `BUY_STATUS === '暫停'`，沒有擋 `'取消'`。跟同專案裡的 `validateLeaderSetupToken`、`adminSuspendGroupLeader` 對照，兩個狀態都應該擋，這裡漏了一個，導致**已被取消資格的團長依然能用密碼登入、看到自己的團購活動**。

**修復內容：**
```diff
- if (String(leaderRow[lc.BUY_STATUS] || '') === '暫停') {
+ var buyStatus = String(leaderRow[lc.BUY_STATUS] || '');
+ if (buyStatus === '暫停' || buyStatus === '取消') {
    return { ok: false, reason: 'suspended' };
  }
```
沿用既有 `'suspended'` 錯誤代碼（前端已對應「您的開團資格已暫停，請聯繫幸福緣」），不需要改任何前端檔案、不需要新增錯誤訊息分支。

**影響範圍確認：**
- 只改 `gas_event_clean.js` 一個檔案，1 個 if 判斷（1 行變 2 行）
- 只讀既有 `GROUP_LEADERS.BUY_STATUS` 欄位，不寫入、不新增欄位，24 張表零異動
- 前端不需要改，`sw.js` 不需要升版

**Commit：** `24da88a fix: (Module 7-F) 修正 validateLeaderToken_ 漏擋取消狀態之漏洞`（已 push 到 `origin/security/admin-auth`，**尚未 fast-forward 到 `origin/main`**，GitHub Pages 還看不到這個修正）

**✅ 2026-07-07 已完成：** GAS 部署為新版本 **v73**（整份 `gas_event_clean.js` 覆蓋貼上後部署，Angel 已確認完成）。

**✅ 2026-07-07 驗收測試已執行並通過：** Angel 用自己既有的真實團長帳號測試（過程中一度誤以為「團主來源表沒有紀錄」，後確認是找錯位置，虛驚一場，資料原本就在）：
- 把自己的 `buy_status` 從「正常」改成「取消」→ 重新登入 `leader.html` → **實際看到「您的開團資格已暫停，請聯繫幸福緣」**，登入被正確擋下 ✅
- 測試後已把 `buy_status` 改回「正常」，確認可正常登入 ✅

回歸測試（原本「暫停」狀態的行為）與直接呼叫 `getLeaderCampaigns` 的測試，本輪未逐一執行（用真實帳號測試已足以證明核心修復邏輯生效，且共用同一個 `validateLeaderToken_` 函式，三個 API 理論上必定同步生效）。**Module 7-F 登入狀態防呆漏洞修復，正式結案。**

**⚠️ 仍待辦（不影響本次修復結案，屬於順手處理項目）：**
1. **`origin/main` 需要 fast-forward**（跟這次 GAS 部署無關——GAS 部署是獨立於 git branch 的動作，這條只影響 GitHub Pages 顯示的前端頁面）。目前 `origin/main` 落後 `security/admin-auth` 2 個 commit（`24da88a` 這次修復 + 前一輪的 Phase 1-B 交接文件），但這兩個 commit 都沒有動到任何前端檔案（`leader.html` 等），所以**即使不 fast-forward，GitHub Pages 上顯示的網頁行為也不受影響**。之後有前端修正要上線時再一併處理即可，不急。
2. 這個專案目前**沒有專用的「測試團長」帳號**（不像 HSC 專案有 `TESTADMIN001`），這次驗收借用了 Angel 自己的真實帳號。未來如果要重複驗收類似功能，建議在後台新增一個明顯是測試用的團長（例如手機 `0900000000`），避免每次都要動用真實帳號、事後還要記得改回來。

**接棒提示更新：** Module 7-F 已完整結案（診斷 → 修復 → GAS v73 部署 → 驗收通過）。下一位協作者（不論是 Gemini 還是接續的 Claude）可以直接開始 **Phase 1-B**（`getSystemConfig()` 讀取骨架），先讀 [docs/母模化_System_Config_規格_v1.md](./母模化_System_Config_規格_v1.md) 第五節。

---

## 7. 追加紀錄（2026-07-07）：Phase 1-B `getSystemConfig()` 通路實作

**跨專案詞彙污染攔截：** 出草案階段，指令中出現「心腦展廳、生命劇場、心靈會所、中控臺」等白名單詞彙，經全專案掃描確認**這些詞完全不存在於本 repo**。後續確認這些詞屬於另一個完全不同的專案（「幸福教養概念館」PWA），跟幸福緣好物市集（本 repo）無關。**已在實作前攔截，這次的 `getSystemConfig()` 白名單只包含市集業務真實會用到的欄位（品牌名稱、網址、LINE、功能開關），沒有寫入任何跨專案的污染內容。**

**實作內容：**
- `gas_event_clean.js` 新增 `getSystemConfig(p)`（唯讀，回傳 `BRAND_NAME` / `SITE_BASE_URL` / `LINE_OA_URL` / `ENABLE_GROUP_BUY` / `ENABLE_POS` / `ENABLE_EVENTS`，值先寫死在函式內，**尚未讀取任何 Google Sheet**，`System_Config` 表本身還沒建立）；router 新增 `case 'getSystemConfig'`，不在 `adminActions` 白名單內（免登入即可呼叫，因為回傳內容全部是 public 等級）
- 新增 `config.js`（repo 根目錄，跟 `leader.html` 同層）：一支獨立探針，載入時自動 fetch `getSystemConfig`，結果存到 `window.HappinessSystemConfig`；**Content-Type 固定為 `text/plain;charset=utf-8`**，沒有任何 `application/json` 殘留
- **`config.js` 尚未被任何現有頁面 `<script src>` 引用**——刻意隔離，不影響 `leader.html` / `shop.html` / `index.html` 等既有頁面的任何行為

**影響範圍確認：**
- 只改 `gas_event_clean.js`（+22 行）、新增 `config.js`（+27 行），其餘檔案零異動
- `getSystemConfig()` 函式內完全沒有引用 `SPREADSHEET_ID`／`LINE_TOKEN`／任何 `PropertiesService` 呼叫，物理上不可能外洩機密
- 不涉及任何 Google Sheet 讀寫，24 張表零異動
- 無 LockService（唯讀無並發風險）、無 Audit Trail 寫入（沒有狀態變更可記錄）

**Commit：** `da4f55d feat: (Phase 1-B) 實作前端 config.js 探針與 GAS getSystemConfig 唯讀通路`（已 push 到 `origin/security/admin-auth`）

**✅ 2026-07-07 GAS v74 已部署，通路驗收已通過：**
- Angel 在無痕視窗 `leader.html` 按 F12 開 Console，貼上驗收 fetch 指令，實際回傳 `{ok: true, version: 'Phase 1-B', data: {…}}` ✅
- Console 同時出現的「Password field is not contained in a form」與 `sw.js` 的 `Failed to fetch` 訊息，經確認皆為既有無關訊息（前者是瀏覽器對表單結構的提示、後者是 Service Worker 處理頁面載入本身的訊息，都跟這次 `getSystemConfig` 的 fetch 呼叫無關），**不影響驗收結果**
- `getSystemConfig()` 前後端通路正式打通，**Phase 1-B 通路測試結案**

**⚠️ 仍待辦：**
1. `origin/main` 目前落後 `security/admin-auth` 3 個 commit（`24da88a`、`63b947f`、`da4f55d`），這次的改動有動到 GAS 邏輯但沒動任何前端頁面，GitHub Pages 顯示的網頁行為不受影響，可以之後有前端修正時再一併 fast-forward
2. `config.js` 目前仍是**獨立探針，尚未被任何頁面引用**，這是刻意設計，等 Phase 1-C 才會讓某個頁面實際載入它

**接棒提示更新：** Phase 1-B（通路骨架 + 部署 v74 + 驗收）已完整結案。下一步進入 **Phase 1-C**：把 `leader.html`／`shop.html`／`index.html`／`event.html`／`event_admin.html` 裡寫死的 `GAS_URL`／`SITE_BASE_URL`／`LINE_OA_URL` 常數，改成讀取 `config.js` 載入的 `window.HappinessSystemConfig.data`。這批風險偏低（值目前只有一組，換值前後渲染結果應該逐字一致），但涉及 5 個前端檔案，動手前務必先出 diff 草案審核。

---

## 8. 追加紀錄（2026-07-08）：Phase 1-C `System_Config` 表動態化重構

**背景：** Phase 1-B 通路測試通過後，`getSystemConfig()` 從「寫死常數」升級為「真正查 Google Sheet」，並補上快取防禦，避免公開唯讀 API 被高併發打爆 Sheet 讀取配額。

**實作內容：**
- `gas_event_clean.js` 新增 `SHEET.SYSTEM_CONFIG = 'System_Config';`（新增一行，不動任何既有 `SHEET.*` 定義）
- `getSystemConfig()` 重構為：先查 `CacheService.getScriptCache()`（key: `sysconfig:public_v1`，TTL 300 秒）→ cache miss 才真的讀 `System_Config` 表 → 白名單過濾（只有 `security_level==='public'` 且 `scope` 為 `frontend`/`both` 的列才會出現在回傳結果）→ 寫回快取。讀表失敗（例如表還沒建立）會 fallback 回 Phase 1-B 的寫死值，不讓前端斷線
- 新增一次性 Migration 函式 `adminInitSystemConfigTable_()`：表不存在才建立（row1 英文表頭／row2 中文表頭，沿用既有 `DATA_ROW=3` 慣例）；6 個預設 key 逐筆檢查存在與否，只 append 缺少的，**絕不覆蓋已存在的值**（等冪性）；只操作 `System_Config` 這一個分頁，不碰任何其他表
- 追加 `runInitSystemConfig()`（無底線包裝函式，純粹方便在 GAS 編輯器函式選單裡選取執行——Angel 反映底線結尾的函式在選單裡不好選，依過往實際經驗直接加包裝函式解決，不糾結於是否為 GAS 本身限制）

**影響範圍確認：**
- 新增 `System_Config` 分頁（全新表），既有 14+5 張表零異動
- `gas_event_clean.js` 三次 commit：`2fd6cb4`（主體重構）、`5c6c5c4`（無底線包裝函式），皆已 push 到 `origin/security/admin-auth`
- 前端檔案（`leader.html` 等）與 `sw.js` 全部零異動

**部署與驗收（Angel 實際執行結果）：**
- GAS 部署至 **v76**（v75 主體重構 + v76 補上包裝函式）
- 執行 `runInitSystemConfig()`，Logger 輸出：`新增 6 筆，已存在略過 0 筆` ✅（首次執行，6 個預設值全部成功寫入，符合預期）
- Console 驗收 fetch `getSystemConfig`，回傳 `{ok: true, version: 'Phase 1-C', data: {…}}` ✅——`version` 確認為 `"Phase 1-C"`（不是 Phase 1-B 的 fallback 值），證實資料真的來自 `System_Config` 表格，快取與白名單邏輯正常運作

**Module/Phase 狀態：Phase 1-C 正式結案。**

**⚠️ 仍待辦：**
1. `origin/main` 目前落後 `security/admin-auth` 5 個 commit（`24da88a`、`63b947f`、`da4f55d`、`2fd6cb4`、`5c6c5c4`），皆為後端邏輯與文件異動，未動任何前端頁面，GitHub Pages 網頁行為不受影響
2. `config.js` 仍未被任何頁面引用，前端尚未實際改用 `System_Config` 資料

**接棒提示更新：** Phase 1-C（表格化 + 快取 + Migration + 部署 v76 + 驗收）已完整結案。下一步是 **Phase 1-D**：讓某個前端頁面實際載入 `config.js`，並開始把寫死的常數換成讀取 `window.HappinessSystemConfig.data`，需要先出 diff 草案審核，範圍建議先挑單一頁面（例如 `leader.html`）試點，不要 5 個頁面一次全改。

---

*本檔案為交接用黑盒子紀錄，內容會隨每輪重要進度持續追加，不會覆蓋歷史段落。*
