# 母模化重構實戰全紀錄 — Phase 0 ～ Phase 1-A 歷史檔案

> 建立日期：2026-07-07｜狀態：**歷史紀錄，非規格文件**
> 目的：完整保留這幾輪排查與重構的因果關係，避免未來對話因記憶截斷而重複踩雷或重複排查。
> 對應規格文件：[docs/母模化_System_Config_規格_v1.md](./母模化_System_Config_規格_v1.md)

---

## 一、事件起點：Module 7-E 團長啟用連結無效

Module 7-E（後台新增團長）完成並部署（GAS v72）後，後台成功新增團長、產生啟用連結（`leader.html#setup=...`），但用無痕視窗打開連結，一律顯示「連結無效或已過期」。

第一輪懷疑方向：token 產生/儲存/驗證邏輯有 bug。逐一檢查 `leader.html` 與 `gas_event_clean.js`：
- `leader.html` 正確讀 `location.hash`、正確呼叫 `validateLeaderSetupToken`、正確清 hash
- `gas_event_clean.js` 的 `hashSetupToken_` / `storeSetupToken_` / `lookupSetupByToken_` / `validateLeaderSetupToken` 邏輯全部正確

建立臨時診斷函式 `adminDebugLeaderSetupToken()`，請 Angel 貼到 GAS 編輯器手動執行，結果：`validate_result_ok: true`，token、手機、等級、狀態全部正確。**證實 GAS 後端完全沒問題。**

直接用 curl 打「正式部署的 GAS 網址」，模擬瀏覽器行為，同樣拿到 `{"ok":true,...}`。**證實不是後端問題，問題在瀏覽器端。**

---

## 二、真正根因：CORS Preflight 被 GAS 忽略

比對專案裡其他正常運作的頁面（shop.html、index.html、event_admin.html）發現：它們呼叫 GAS 時，`Content-Type` 一律用 `text/plain;charset=utf-8`（或完全不設定，預設也是 text/plain），**只有 `leader.html` 用了 `application/json`**。

原理：`application/json` 屬於瀏覽器認定的「非簡單請求」，會先送一個 OPTIONS 預檢請求（preflight）。Google Apps Script Web App **沒有實作 `doOptions()`**，不會回應這個預檢，導致瀏覽器判定失敗，直接擋掉真正的 POST 請求。fetch() 因此拋出錯誤，掉進 `.catch(showInvalidSetup)`，顯示出跟「token 真的過期」一模一樣的訊息——**這就是為什麼後端測都正常，瀏覽器打開卻一直失敗的原因**。

**修法：** 把 `leader.html` 的 `callGas()` 裡 `Content-Type` 從 `application/json` 改成 `text/plain;charset=utf-8`，body 仍維持 `JSON.stringify(body)`。只改這一行，不動 GAS、不動 sw.js（因為 `leader.html` 不在 sw.js 的 precache ASSETS 清單裡）。

Commit：`202c210 fix: 修正團長中心 GAS 請求格式`

---

## 三、Phase 0 母模化盤點：27+ 處硬編碼

診斷完成後，Angel 提出更大的目標：這套系統要從「幸福緣好物市集」單店專案，重構成可複製給多商家的 SaaS 輕量母模。第一步先做 Phase 0 盤點（只讀不改）。

### Phase 0-A：分支與部署來源盤點
- 當時發現：本機 `main` 落後 `security/admin-auth` 114 個 commit（`main` 最後一次本機已知更新是 2026-06-14）
- 當時推測：GitHub Pages 發布來源可能是 `security/admin-auth`（因為現場能看到最新功能）
- **這個推測後來被證實是錯的，詳見第五節**

### Phase 0-B：硬編碼掃描結果（節錄）

掃描 `index.html`／`shop.html`／`leader.html`／`event.html`／`event_admin.html`／`manifest.json`／`sw.js`／`gas_event_clean.js`／`gas_complete.js`，找出以下類別的寫死內容（完整清單見規格文件）：

| 類別 | 範例 | 優先級 |
|---|---|---|
| GAS_URL | 5 個前端檔案各自寫死同一個 script.google.com 網址 | A |
| SITE_BASE_URL | github.io 網址寫死在多處，前後端各一份 | A |
| LINE_OA_URL | shop.html 用 `lin.ee/tMag2XG`、event.html 用 `line.me/R/ti/p/@862hjyvx`，**兩種格式不一致但指向同一帳號** | A |
| 付款資訊 | 「中華郵政（700）」、帳號 `0041336-0597692`、戶名「李秀芳」，散落 3 個檔案 | A |
| 品牌名稱 | 「幸福緣好物市集」在 4 個 HTML 檔案裡出現 27+ 次 | A |
| 主題色票 | `:root { --green-dark: #1B3A2A; ... }` 完整一套色票，在 shop.html／event.html／leader.html **三份完全複製** | B（暫緩） |
| **安全漏洞**（不只是母模化問題） | shop.html 用寫死 token `YC_SHOP_2026` 當查詢驗證碼，前端原始碼可直接看到，等於沒有真正驗證 | A + 需獨立安全修復 |
| SPREADSHEET_ID | `gas_complete.js` 與 `gas_event_clean.js` **各存一份相同的值**，關係未明，暫不合併 | A |

盤點結論產出 `docs/母模化_System_Config_規格_v1.md`：定義 System_Config 表格設計、25 個初版 config key、三類讀取策略（public frontend / private GAS / derived）、Phase 1-B～1-F 實作順序，並明確排除本輪不做的事（不合併 main、不動 CSS 色票、不動 manifest 動態化、不合併 gas_complete.js/gas_event_clean.js、不一次替換全部品牌文案、不動既有 14 張表）。

---

## 四、驚天發現：全域 Git Hook 與 Upstream Tracking 錯誤指向 main

在文件 push 過程中，發現一連串異常線索並逐步拆解：

### 4.1 發現 upstream 指向錯誤
`git branch -vv` 顯示：
```
* security/admin-auth 202c210 [origin/main: ahead 1] ...
```
`git rev-parse security/admin-auth@{upstream}` 回傳 `origin/main`。**本機這條開發用的 `security/admin-auth` branch，upstream 追蹤目標居然是 `origin/main`，不是 `origin/security/admin-auth`。**

風險：任何一次「沒有明確指定目標」的 `git push`，預設行為會推去 `origin/main`。

### 4.2 發現全域自動 push hook
進一步排查，發現 `git config --list` 裡有：
```
core.hookspath=C:/Users/user/.git-hooks
```
這是**全域設定**（`git config --global --get core.hookspath` 有值），套用在這台電腦上的**所有** repo，不只這一個專案。

檢查 `C:/Users/user/.git-hooks/pre-commit`：
```sh
#!/bin/sh
echo "⬇️ 先從 GitHub 拉最新版本..."
git pull --rebase --autostash
```
檢查 `C:/Users/user/.git-hooks/post-commit`：
```sh
#!/bin/sh
git push
```

**真相：每一次 commit，都會自動觸發一個沒有指定任何參數的 `git push`。** 在 upstream 修正之前，這個自動 push 會默默推去 `origin/main`——這正是過去 `origin/main` 一直跟 `security/admin-auth` 保持同步的真正機制。不是人為疏失，也不是刻意的策略，是「upstream 設錯」加「全域自動 push」兩個問題疊加造成的**意外但長期存在的自動化行為**。

用 `git reflog show --date=iso origin/main` 交叉核對時間戳，證實每一次 `origin/main` 的更新時間，都精準對上 `security/admin-auth` 上對應 commit 的建立時間——鐵證。

### 4.3 修正 upstream tracking
執行（Angel 明確授權後）：
```
git branch --set-upstream-to=origin/security/admin-auth security/admin-auth
```
修正後驗證：`git branch -vv` 不再顯示 `[origin/main: ...]`，改顯示 `[origin/security/admin-auth]`。從此以後，這條 branch 上的自動 push（以及任何未指定目標的手動 push）都會正確推去 `origin/security/admin-auth`，不會再誤推到 main。

**這個修正本身完全正確、必要，但也在下一節製造了一個新問題。**

---

## 五、Pages 發布來源之謎：其實一直是 `main`

upstream 修好之後，`leader.html` 的 CORS 修正 push 上去超過 4 小時，線上網站依然是舊版本（`application/json`）。一開始懷疑是 GitHub Pages 建置卡死或 CDN 快取異常，做了多輪 curl 監控（含加時間戳、繞快取），結果都指向同一件事：線上版本的 `Last-Modified` 完全沒有變化。

Angel 依照白話檢查清單，登入 GitHub 網頁的 **Actions** 頁面，貼出 164 筆 `pages build and deployment` 紀錄——**每一筆都寫著 branch: `main`**，而且全部成功（20~40 秒完成，沒有紅叉）。

**真相大白：GitHub Pages 的實際發布來源從頭到尾都是 `main`，不是我們原先推測的 `security/admin-auth`。**

完整因果鏈：
1. GitHub Pages 只建置 `main`
2. 過去全域 hook 的自動 push（因 upstream 設錯）意外地讓每次在 `security/admin-auth` 上的 commit 都同步推到 `origin/main`
3. 這個「意外的同步」其實是讓網站持續更新的**真正生命線**，只是沒有人意識到
4. 第四節修正 upstream tracking 之後，自動 push 改推去 `origin/security/admin-auth`，`origin/main` 從此不再被自動更新
5. 於是 `202c210`（CORS 修正）和後續文件 commit，都只進了 `security/admin-auth`，**main 完全沒收到**，GitHub Pages 自然沒有新內容可建置——它沒有故障、沒有卡死，只是誠實反映「main 沒有新東西」這個事實

### 最終解法：安全 Fast-forward 推進 main

驗證 `origin/main` 與 `origin/security/admin-auth` 之間**完全沒有分岔**（`git log origin/security/admin-auth..origin/main` 為空），純粹是落後關係，可以安全 fast-forward。

Angel 明確授權後執行：
```
git push origin security/admin-auth:main
```
結果：`5f6e3cb..83606c6  security/admin-auth -> main`，乾淨的 fast-forward，無衝突、無 force、無 reset。

**push 完成後 1 分鐘內連續 6 次 curl 確認：** `Content-Type` 已變成 `text/plain;charset=utf-8`，`Last-Modified` 更新為 push 當下的時間——**GitHub Pages 在幾秒內就重新建置完成**，證實它從頭到尾運作正常，之前 4 小時的延遲純粹是「main 沒有新 commit」造成的，不是建置系統的問題。

---

## 六、技術長 X 定下的鋼鐵紀律

因為全域自動 push hook 的存在，2026-07-07 訂下以下規則（已存入 Claude 的永久記憶）：

> **「禁止 push」的指示，等同「嚴禁執行任何 commit」。**
> 除非得到 Angel 明確授權「同意 commit + push」，否則一律只做讀取、修改草稿（不落地到 git 歷史）、偵查診斷，不得執行任何 commit。
> 這條規則適用於這台電腦上的**所有** repo，不只 Angel-Heart-health-kitchen 這一個專案。

原因：這個全域 hook（`pre-commit` 自動 pull、`post-commit` 自動 push）沒有被移除，依然存在。只要執行 commit，就一定會自動觸發 push，沒有辦法用「只 commit 不 push」的方式繞過它。

---

## 七、目前狀態（截至本文件建立時）

- `leader.html` 的 CORS 修正已上線，GitHub Pages 已確認正常建置
- `security/admin-auth` 的 upstream tracking 已修正為 `origin/security/admin-auth`
- `origin/main` 已透過安全 fast-forward 同步到最新狀態，兩個 branch 目前完全一致
- `docs/母模化_System_Config_規格_v1.md` 已建立，作為後續 Phase 1 config-driven 重構的依據
- Phase 1 實作（Phase 1-B 建立 `getSystemConfig()` 讀取骨架起）尚未開始，需要 Angel 個別審核每一批 diff 草案才能動手
- `SHOP_QUERY_TOKEN`（`YC_SHOP_2026`）的安全漏洞尚未修復，需要獨立排期，不與母模化重構混在一起評估優先順序

---

*本文件為歷史紀錄，記錄「發生過什麼、為什麼、怎麼解決」，不是規格或待辦事項。後續規格與待辦請見 [docs/母模化_System_Config_規格_v1.md](./母模化_System_Config_規格_v1.md)。*
