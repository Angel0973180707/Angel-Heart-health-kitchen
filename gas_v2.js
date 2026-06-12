/**
 * 養清倉管 GAS 修改清單
 * 適用主程式版本：v2.0（2026-06-10）
 *
 * ════════════════════════════════════════════════
 * 操作方式：
 * 把下面每個「要加進 / 要替換」的函式，
 * 直接貼到 GAS 編輯器最下面（或取代對應舊函式）
 *
 * 改完後重新部署：管理部署 → 編輯 → 新版本 → 部署
 * ════════════════════════════════════════════════
 */


// ════════════════════════════════════════════════
// Task 2 & 3：LINE Notify
// 1. 把下面 sendLineNotify_ 貼到 GAS 最下面（新增）
// 2. 把下面 addOrder 取代主程式中的同名函式
// 3. 把下面 addRegistration 取代主程式中的同名函式
// 4. GAS 編輯器 → 齒輪「專案設定」→「指令碼屬性」
//    新增 LINE_NOTIFY_TOKEN，值填你的 LINE Notify token
// ════════════════════════════════════════════════

function sendLineNotify_(message) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_NOTIFY_TOKEN');
  if (!token) { console.warn('LINE_NOTIFY_TOKEN 未設定'); return; }
  try {
    UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + token },
      payload: { message: message },
      muteHttpExceptions: true
    });
  } catch(e) { console.warn('LINE Notify 發送失敗：' + e.message); }
}

// ── 取代主程式的 addOrder（加 LINE Notify）──
function addOrder(p) {
  if (p.token !== ORDER_TOKEN) {
    return { ok: false, error: '驗證失敗' };
  }
  if (!p.customer_name || !p.phone || !p.items) {
    return { ok: false, error: '缺少必要欄位' };
  }
  const id = 'ORD' + Date.now();
  getSheet(SHEET.ORDERS).appendRow([
    id, p.customer_name, p.phone, p.address||'',
    p.items, p.total||0, p.payment||'貨到付款',
    '待確認', p.note||'', now()
  ]);
  if (p.auto_deduct === 'true') {
    try {
      JSON.parse(p.items).forEach(function(item) {
        stockOut({ product_id: item.product_id, qty: item.qty,
                   price: item.price, partner: p.customer_name, note: '訂單:'+id });
      });
    } catch(e) {}
  }
  // LINE Notify
  try {
    sendLineNotify_(
      '\n🛒 新訂單通知！' +
      '\n客戶：' + p.customer_name +
      '\n電話：' + p.phone +
      '\n金額：NT$ ' + Number(p.total||0).toLocaleString() +
      '\n付款：' + (p.payment||'—') +
      '\n備註：' + (p.note||'無')
    );
  } catch(e) {}
  return { ok: true, order_id: id };
}

// ── 取代主程式的 addRegistration（加 LINE Notify）──
function addRegistration(p) {
  if (p.token !== REG_TOKEN) {
    return { ok: false, error: '驗證失敗' };
  }
  if (!p.event_id || !p.name || !p.phone) {
    return { ok: false, error: '缺少必要欄位' };
  }
  const found = findRow(SHEET.EVENTS, COL.EVENTS.ID, p.event_id);
  if (!found) return { ok: false, error: '找不到活動' };
  const event = found.row;
  const c = COL.EVENTS;
  const capacity   = parseInt(event[c.CAPACITY])   || 0;
  const registered = parseInt(event[c.REGISTERED]) || 0;
  if (capacity > 0 && registered >= capacity) {
    return { ok: false, error: '報名人數已額滿' };
  }
  const feeType   = p.fee_type || '單次';
  const feeAmount = feeType === '年繳'   ? (event[c.FEE_YEARLY] || 120000) :
                    feeType === '半年繳' ? (event[c.FEE_HALF]   || 132000) :
                                           (event[c.FEE_SINGLE] || 12000);
  const id = genId('R');
  getSheet(SHEET.REGISTRATIONS).appendRow([
    id, p.event_id, event[c.NAME],
    p.name, p.phone, p.address||'',
    feeType, feeAmount, '待審核',
    p.health||'', p.religion||'', p.skills||'',
    p.emergency_name||'', p.emergency_phone||'',
    p.accommodation||'不住宿', p.note||'', now()
  ]);
  getSheet(SHEET.EVENTS).getRange(found.rowNum, c.REGISTERED+1).setValue(registered + 1);
  // LINE Notify
  try {
    sendLineNotify_(
      '\n📝 新報名通知！' +
      '\n姓名：' + p.name +
      '\n電話：' + p.phone +
      '\n活動：' + event[c.NAME] +
      '\n費用方式：' + feeType +
      '\n費用：NT$ ' + Number(feeAmount).toLocaleString() +
      '\n住宿：' + (p.accommodation||'不住宿')
    );
  } catch(e) {}
  return { ok: true, reg_id: id, fee_amount: feeAmount };
}


// ════════════════════════════════════════════════
// Task 5：出庫庫存歸零自動下架
// 取代主程式中的 updateQty 函式
// ════════════════════════════════════════════════

function updateQty(productId, qty, type) {
  const sheet = getSheet(SHEET.INVENTORY);
  const found = findRow(SHEET.INVENTORY, COL.INVENTORY.ID, productId);
  if (!found) return { ok: false, error: '找不到庫存記錄' };
  const cur    = parseInt(found.row[COL.INVENTORY.QTY]) || 0;
  const newQty = type === 'in' ? cur + qty : cur - qty;
  if (newQty < 0) return { ok: false, error: '庫存不足，現有 ' + cur + ' 件' };
  sheet.getRange(found.rowNum, COL.INVENTORY.QTY+1).setValue(newQty);
  sheet.getRange(found.rowNum, COL.INVENTORY.UPDATED+1).setValue(now());
  // 出庫後庫存歸零 → 自動下架
  if (newQty === 0 && type === 'out') {
    try {
      const prodFound = findRow(SHEET.PRODUCTS, COL.PRODUCTS.ID, productId);
      if (prodFound) {
        getSheet(SHEET.PRODUCTS).getRange(prodFound.rowNum, COL.PRODUCTS.STATUS+1).setValue('下架');
        console.log('商品自動下架：' + productId);
      }
    } catch(e) {}
  }
  return { ok: true, new_qty: newQty, name: found.row[COL.INVENTORY.NAME] };
}


// ════════════════════════════════════════════════
// Task 7：點數記錄（新增，貼到 GAS 最下面）
//
// 需要在試算表手動新增工作表「點數記錄」，
// 第1列：標題 / 第2列：英文欄位名 / 第3列起資料
// 欄位（A~H）：
//   log_id | member_phone | member_name | action
//   points | balance | note | created_at
//
// 在 doGet switch 加入：
//   case 'getPointsLog': return res(getPointsLog(p));
// ════════════════════════════════════════════════

var SHEET_POINTS_LOG = '點數記錄';

function getPointsLog(p) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_POINTS_LOG);
  if (!sheet) return { ok: true, data: [] };
  var last = sheet.getLastRow();
  if (last < DATA_ROW) return { ok: true, data: [] };
  var rows = sheet.getRange(DATA_ROW, 1, last - DATA_ROW + 1, 8).getValues();
  var list = rows.map(function(r) {
    return {
      log_id:       r[0],
      member_phone: r[1],
      member_name:  r[2],
      action:       r[3],
      points:       r[4],
      balance:      r[5],
      note:         r[6],
      created_at:   r[7]
    };
  }).filter(function(x) { return x.log_id; });
  if (p.phone) list = list.filter(function(x) { return String(x.member_phone) === String(p.phone); });
  list.reverse();
  return { ok: true, data: list.slice(0, Number(p.limit)||100) };
}

// ── 取代主程式的 addPoints（加寫 點數記錄）──
function addPoints(p) {
  if (!p.phone || !p.points) return { ok: false, error: '缺少必要欄位' };
  var rows = getRows(SHEET.MEMBERS);
  var c = COL.MEMBERS;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][c.PHONE]) === String(p.phone)) {
      var sheet = getSheet(SHEET.MEMBERS);
      var rn = DATA_ROW + i;
      var cur   = Number(rows[i][c.POINTS]) || 0;
      var spent = Number(rows[i][c.TOTAL_SPENT]) || 0;
      var addPts = Number(p.points);
      var newBalance = cur + addPts;
      sheet.getRange(rn, c.POINTS+1).setValue(newBalance);
      sheet.getRange(rn, c.TOTAL_SPENT+1).setValue(spent + Number(p.amount || 0));
      // 寫點數記錄
      var logSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_POINTS_LOG);
      if (logSheet) {
        logSheet.appendRow([
          'PT' + Date.now(), p.phone, rows[i][c.NAME],
          addPts > 0 ? '加點' : '扣點',
          addPts, newBalance,
          p.note || '', now()
        ]);
      }
      return { ok: true, new_points: newBalance };
    }
  }
  return { ok: false, error: '找不到會員' };
}


// ════════════════════════════════════════════════
// Task 6：活動封面圖
//
// 步驟：
// 1. 在試算表「活動主檔」最右邊新增一欄：封面圖片
//    （第 15 欄，index 14）
//
// 2. 找到 GAS 主程式中的 COL 設定（大概長這樣）
//    EVENTS: { ID:0, NAME:1, ..., CREATED:13 }
//    在 CREATED:13 後面加逗號，再加：
//    IMAGE: 14
//
// 3. 把下面 addEvent 取代主程式中的同名函式
// ════════════════════════════════════════════════

function addEvent(p) {
  if (!p.name || !p.date || !p.location) {
    return { ok: false, error: '缺少必要欄位' };
  }
  const id = genId('E');
  getSheet(SHEET.EVENTS).appendRow([
    id, p.name, p.date, p.location,
    p.description || '', p.capacity || 0, 0,
    p.accom_quota || 0, p.no_accom_quota || 0,
    p.fee_single || 12000, p.fee_yearly || 120000, p.fee_half || 132000,
    p.status || '報名中', now(),
    p.image_url || ''
  ]);
  return { ok: true, event_id: id };
}
