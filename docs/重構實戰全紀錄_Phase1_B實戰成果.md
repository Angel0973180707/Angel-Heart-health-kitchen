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

*本檔案為交接用黑盒子紀錄，內容會隨每輪重要進度持續追加，不會覆蓋歷史段落。*
