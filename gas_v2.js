/**
 * 養清倉管 GAS v2 — 新增功能模組
 *
 * 使用方式：
 * 1. 開啟 GAS 編輯器，點「+」新增檔案，命名 gas_v2
 * 2. 把整個檔案內容貼進去
 * 3. 重新部署（管理部署 → 編輯 → 版本選「新版本」→ 部署）
 * 4. 需要的設定：
 *    - LINE Notify Token：GAS 編輯器 → 專案設定 → 指令碼屬性
 *      新增屬性 LINE_NOTIFY_TOKEN，值為你的 LINE Notify token
 *    - 確認試算表中有 "帳本" 工作表（欄位見下方 addAccount 說明）
 *    - 確認試算表中有 "點數記錄" 工作表（欄位見下方 getPointsLog 說明）
 */

// ─────────────────────────────────────────────────
// 工具函式（GAS 版）
// ─────────────────────────────────────────────────

function _getSheet(name) {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '你的試算表ID');
  return ss.getSheetByName(name);
}

function _rowToObj(headers, row) {
  var obj = {};
  headers.forEach(function(h, i) { obj[h] = row[i] !== undefined ? row[i] : ''; });
  return obj;
}

function _sendLineNotify(message) {
  var token = PropertiesService.getScriptProperties().getProperty('LINE_NOTIFY_TOKEN');
  if (!token) { console.warn('LINE_NOTIFY_TOKEN 未設定'); return; }
  UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
    method: 'post',
    headers: { Authorization: 'Bearer ' + token },
    payload: { message: message }
  });
}

// ─────────────────────────────────────────────────
// Task 4：新增帳目
// 試算表「帳本」工作表欄位（第一列）：
// account_id | type | partner | items | income | expense | date | note | status | created_at
// ─────────────────────────────────────────────────

function addAccount(params) {
  try {
    var sheet = _getSheet('帳本');
    if (!sheet) return { ok: false, error: '找不到帳本工作表' };
    var id = 'ACC' + Date.now();
    var now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    sheet.appendRow([
      id,
      params.type || '其他',
      params.partner || '',
      params.items || '',
      Number(params.income) || 0,
      Number(params.expense) || 0,
      params.date || now.slice(0, 10),
      params.note || '',
      params.status || '已記錄',
      now
    ]);
    return { ok: true, account_id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────
// Task 5：stockOut 自動下架（庫存歸零時）
// 在現有 stockOut 函式內，找到更新庫存的地方，
// 在 newQty <= 0 之後加入以下邏輯：
//
//   if (newQty <= 0) {
//     // 自動下架
//     productSheet.getRange(productRow, statusCol).setValue('下架');
//   }
//
// 以下是完整的 auto-archive 輔助函式：
// ─────────────────────────────────────────────────

function _autoArchiveIfZero(productId) {
  var sheet = _getSheet('商品主檔');
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[1]; // 第2列是英文欄位名稱
  var pidCol = headers.indexOf('product_id');
  var qtyCol = headers.indexOf('qty');
  var statusCol = headers.indexOf('status');
  if (pidCol < 0) return;
  for (var i = 2; i < data.length; i++) {
    if (String(data[i][pidCol]) === String(productId)) {
      var qty = Number(data[i][qtyCol]) || 0;
      if (qty <= 0 && statusCol >= 0) {
        sheet.getRange(i + 1, statusCol + 1).setValue('下架');
        console.log('商品已自動下架：' + productId);
      }
      break;
    }
  }
}

// ─────────────────────────────────────────────────
// Task 2：訂單通知（addOrder 成功後呼叫此函式）
// 在現有 addOrder 函式最後，成功寫入後加一行：
//   _notifyNewOrder(params);
// ─────────────────────────────────────────────────

function _notifyNewOrder(params) {
  try {
    var msg = '\n🛒 新訂單通知！\n'
      + '客戶：' + (params.customer_name || '—') + '\n'
      + '電話：' + (params.phone || '—') + '\n'
      + '金額：NT$ ' + Number(params.total).toLocaleString() + '\n'
      + '付款：' + (params.payment || '—') + '\n'
      + '備註：' + (params.note || '無');
    _sendLineNotify(msg);
  } catch (e) {
    console.warn('LINE Notify 發送失敗：' + e.message);
  }
}

// ─────────────────────────────────────────────────
// Task 3：報名通知（addRegistration 成功後呼叫此函式）
// 在現有 addRegistration 函式最後，成功寫入後加一行：
//   _notifyNewRegistration(params);
// ─────────────────────────────────────────────────

function _notifyNewRegistration(params) {
  try {
    var msg = '\n📝 新報名通知！\n'
      + '姓名：' + (params.name || '—') + '\n'
      + '電話：' + (params.phone || '—') + '\n'
      + '活動：' + (params.event_id || '—') + '\n'
      + '費用方式：' + (params.fee_type || '—') + '\n'
      + '住宿：' + (params.accommodation || '—');
    _sendLineNotify(msg);
  } catch (e) {
    console.warn('LINE Notify 發送失敗：' + e.message);
  }
}

// ─────────────────────────────────────────────────
// Task 7：點數紀錄
// 試算表「點數記錄」工作表欄位（第一列）：
// record_id | member_name | phone | action | points | balance | note | created_at
// ─────────────────────────────────────────────────

function addPoints(params) {
  try {
    var sheet = _getSheet('點數記錄');
    if (!sheet) return { ok: false, error: '找不到點數記錄工作表' };
    var id = 'PT' + Date.now();
    var now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    var pts = Math.abs(Number(params.points) || 0);
    var balance = _getPointsBalance(params.phone) + pts;
    sheet.appendRow([id, params.member_name || '', params.phone || '', '加點', pts, balance, params.note || '', now]);
    return { ok: true, record_id: id, balance: balance };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function usePoints(params) {
  try {
    var sheet = _getSheet('點數記錄');
    if (!sheet) return { ok: false, error: '找不到點數記錄工作表' };
    var pts = Math.abs(Number(params.points) || 0);
    var currentBalance = _getPointsBalance(params.phone);
    if (currentBalance < pts) return { ok: false, error: '點數不足（現有 ' + currentBalance + ' 點）' };
    var id = 'PT' + Date.now();
    var now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    var newBalance = currentBalance - pts;
    sheet.appendRow([id, params.member_name || '', params.phone || '', '扣點', -pts, newBalance, params.note || '', now]);
    return { ok: true, record_id: id, balance: newBalance };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function _getPointsBalance(phone) {
  var sheet = _getSheet('點數記錄');
  if (!sheet) return 0;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;
  var headers = data[0];
  var phoneCol = headers.indexOf('phone');
  var balanceCol = headers.indexOf('balance');
  var lastBalance = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][phoneCol]) === String(phone)) {
      lastBalance = Number(data[i][balanceCol]) || 0;
    }
  }
  return lastBalance;
}

function getPointsLog(params) {
  try {
    var sheet = _getSheet('點數記錄');
    if (!sheet) return { ok: true, data: [] };
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { ok: true, data: [] };
    var headers = data[0];
    var rows = data.slice(1).map(function(r) { return _rowToObj(headers, r); });
    if (params.phone) rows = rows.filter(function(r) { return String(r.phone) === String(params.phone); });
    rows.reverse();
    return { ok: true, data: rows.slice(0, Number(params.limit) || 100) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────
// doGet / doPost 路由（加到現有的 switch/case 中）
// ─────────────────────────────────────────────────
//
// 在現有 doGet 的 switch(action) 中加入：
//
//   case 'addAccount':
//     result = addAccount(params); break;
//   case 'addPoints':
//     result = addPoints(params); break;
//   case 'usePoints':
//     result = usePoints(params); break;
//   case 'getPointsLog':
//     result = getPointsLog(params); break;
//
// ─────────────────────────────────────────────────
