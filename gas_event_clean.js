// ================================================================
// 養清倉管系統 GAS 後台 v2.4
// Spreadsheet ID: 1geF1x3u9T_S6gmJlnLiV6-x77t66WtI4bON_Nr3FH6w
// 更新日期：2026-06-15
// v2.4 修正：帳務防重複、待收款轉已收款、活動帳本分流、餘額公式修正
// ================================================================

const SPREADSHEET_ID = '1geF1x3u9T_S6gmJlnLiV6-x77t66WtI4bON_Nr3FH6w';
// 密碼 / LINE token 改存 Script Properties（ADMIN_PASSWORD、LINE_TOKEN、LINE_USER_ID）

function sendLineMsg(message) {
  try {
    var props  = PropertiesService.getScriptProperties();
    var token  = props.getProperty('LINE_TOKEN')   || '';
    var userId = props.getProperty('LINE_USER_ID') || '';
    if (!token || !userId) { Logger.log('LINE_TOKEN 或 LINE_USER_ID 未設定'); return; }
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      payload: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: message }]
      }),
      muteHttpExceptions: true
    });
  } catch(e) {
    Logger.log('LINE 通知失敗：' + e.toString());
  }
}

// 工作表名稱
const SHEET = {
  PRODUCTS:      '商品主檔',
  INVENTORY:     '庫存',
  STOCK_LOG:     '進出貨記錄',
  ORDERS:        '客戶訂單',
  ACCOUNTS:      '商品帳本',
  BALANCE:       '帳務總覽',
  EVENTS:        '活動主檔',
  REGISTRATIONS: '報名記錄',
  MEMBERS:         '會員',
  POINTS_LOG:      '點數記錄',
  RETURNS:         '退貨記錄',
  RETURN_STEPS:    '退貨處理記錄',
  SETTINGS:        '系統設定',
  EVENT_ACCOUNTS:  '活動帳本'
};

// 欄位索引（0起算）
const COL = {
  PRODUCTS: {
    ID:0, NAME:1, CODE:2, COST:3, PRICE:4, IMAGE:5,
    DESC:6, CATEGORY:7, STATUS:8, THRESHOLD:9, CREATED:10
  },
  INVENTORY: { ID:0, NAME:1, QTY:2, UPDATED:3, LAST_OP_ID:4 },
  STOCK_LOG: { ID:0, PID:1, NAME:2, TYPE:3, QTY:4, PRICE:5, PARTNER:6, NOTE:7, CREATED:8, REF_ID:9 },
  ORDERS: {
    ID:0, CNAME:1, PHONE:2, ADDRESS:3, ITEMS:4, TOTAL:5, PAYMENT:6, STATUS:7, NOTE:8, CREATED:9,
    SUBTOTAL:10, SHIPPING_FEE:11, COUPON_CODE:12,
    CANCELLED_BY:13, CANCELLED_AT:14, CANCEL_REASON:15
  },
  ACCOUNTS:  { ID:0, DATE:1, TYPE:2, PARTNER:3, ITEMS:4, INCOME:5, EXPENSE:6, PAYMENT:7, STATUS:8, NOTE:9, CREATED:10 },
  BALANCE:   { ITEM:0, AMOUNT:1, UPDATED:2 },
  EVENTS: {
    ID:0, NAME:1, DATE:2, LOCATION:3, DESC:4, CAPACITY:5, REGISTERED:6,
    ACCOM_QUOTA:7, NO_ACCOM_QUOTA:8, FEE_SINGLE:9, FEE_YEARLY:10, FEE_HALF:11,
    STATUS:12, CREATED:13, IMAGE:14, ACCOM_REGISTERED:15, NO_ACCOM_REGISTERED:16,
    FEE_ACCOM:17, FEE_NO_ACCOM:18
  },
  REGISTRATIONS: {
    ID:0, EID:1, ENAME:2, NAME:3, PHONE:4, ADDRESS:5, FEE_TYPE:6,
    FEE_AMOUNT:7, FEE_STATUS:8, HEALTH:9, RELIGION:10, SKILLS:11,
    EMERGENCY_NAME:12, EMERGENCY_PHONE:13, ACCOMMODATION:14, NOTE:15, CREATED:16,
    GENDER:17, CANCELLED_BY:18, CANCELLED_AT:19
  },
  MEMBERS: {
    ID:0, NAME:1, PHONE:2, BIRTHDAY:3, POINTS:4, TOTAL_SPENT:5, JOINED:6, NOTE:7,
    MEMBER_LEVEL:8, ANNUAL_SPEND:9, LEVEL_UPDATED_AT:10, BIRTH_DISC_YEAR:11, LAST_OP_ID:12
  },
  POINTS_LOG: { ID:0, PHONE:1, NAME:2, ACTION:3, POINTS:4, BALANCE:5, NOTE:6, CREATED:7, REF_ID:8 },
  RETURNS: {
    ID:0, ORDER_ID:1, PHONE:2, NAME:3, PRODUCT_ID:4, PRODUCT_NAME:5,
    QTY:6, REFUND_AMOUNT:7, PAYMENT:8, REASON:9, POINTS_DEDUCTED:10,
    STATUS:11, NOTE:12, CREATED:13, ACTUAL_POINTS_DEDUCTED:14, POINTS_SHORTFALL:15
  },
  RETURN_STEPS: {
    ID:0, RETURN_ID:1, STEP:2, STATUS:3, REF_ID:4,
    BEFORE_VALUE:5, EXPECTED_AFTER:6, UPDATED_AT:7, ERROR:8, CREATED:9
  },
  SETTINGS: { KEY:0, VALUE:1, DESC:2, UPDATED:3 }
};

const DATA_ROW = 3;

// 系統設定預設值（後台可覆寫）
const SETTING_DEFAULTS = {
  shipping_fee:             { value: 80,    desc: '宅配運費（NT$）' },
  free_shipping_threshold:  { value: 1000,  desc: '免運門檻商品小計（NT$）' },
  points_earn_rate:         { value: 100,   desc: '消費多少元得1點（運費不計）' },
  points_redeem_min:        { value: 100,   desc: '最低可兌換點數' },
  points_redeem_max_rate:   { value: 0.2,   desc: '最高折抵商品金額比例（0.2=20%）' },
  points_expiry_days:       { value: 365,   desc: '點數效期天數' },
  birthday_discount_rate:   { value: 0.05,  desc: '生日折扣（0.05=95折）' },
  birthday_discount_max:    { value: 100,   desc: '生日最高折抵金額（NT$）' },
  birthday_member_min_days: { value: 30,    desc: '會員建立滿幾天才有生日優惠' },
  low_stock_notify_hour:    { value: 9,     desc: '低庫存通知時間（整點）' }
};

// 讀取設定 Map（未設定者用預設值）
function getSettingsMap_() {
  try {
    const rows = getRows(SHEET.SETTINGS);
    const map  = {};
    rows.forEach(r => { if (r[COL.SETTINGS.KEY]) map[String(r[COL.SETTINGS.KEY])] = r[COL.SETTINGS.VALUE]; });
    Object.entries(SETTING_DEFAULTS).forEach(([k, v]) => { if (!(k in map)) map[k] = v.value; });
    return map;
  } catch(e) {
    const map = {};
    Object.entries(SETTING_DEFAULTS).forEach(([k, v]) => { map[k] = v.value; });
    return map;
  }
}

// ================================================================
// 入口
// ================================================================
function doGet(e)  { return handleRequest(e); }
function doPost(e) {
  try {
    const body = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    if (Array.isArray(body.events)) { return handleLineWebhook(body); }
  } catch(err) {}
  return handleRequest(e);
}

function handleLineWebhook(body) {
  (body.events || []).forEach(function(event) {
    if (event.type !== 'message') return;
    var props     = PropertiesService.getScriptProperties();
    var ownerName = props.getProperty('OWNER_NAME') || '養清倉管-幸福緣手作';
    var autoReply = props.getProperty('AUTO_REPLY') === 'true';
    var timeStr   = Utilities.formatDate(new Date(event.timestamp), 'Asia/Taipei', 'MM/dd HH:mm');
    var msgType   = event.message.type;
    var content   = msgType === 'text' ? event.message.text
                  : msgType === 'image' ? '【傳送了一張圖片】'
                  : msgType === 'sticker' ? '【傳送了一個貼圖】'
                  : '【傳送了' + msgType + '】';
    sendLineMsg('📩 ' + ownerName + ' 收到新訊息\n時間：' + timeStr + '\n顧客說：' + content);
    if (autoReply && event.replyToken) {
      var token = props.getProperty('LINE_TOKEN') || '';
      if (token) {
        UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'post',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          payload: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text: '您好！訊息已收到，我們會儘快回覆您。' }] }),
          muteHttpExceptions: true
        });
      }
    }
  });
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const post   = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    const p      = Object.assign({}, params, post);
    const action = p.action || '';

    const adminActions = [
      'addProduct','updateProduct','deleteProduct',
      'stockIn','stockOut','syncInventory',
      'getOrders','addPosSale','updateOrder','confirmOrderPayment','cancelOrder','applyPointsDiscount',
      'getAccounts','addAccount','updateAccount',
      'getBalance','refreshBalance',
      'addEvent','updateEvent','deleteEvent',
      'getRegistrations','updateRegistration','approveRegistration','cancelRegistration','refundCancelRegistration',
      'adminSyncEventCounts',
      'updateMember','addPoints','getPointsLog',
      'addReturn','getReturns','updateReturn',
      'updateSetting',
      'getMonthlyReport','getSalesRanking','getInventoryHealth','getMemberStats',
      'sendLowStockNotification','installTriggers',
      'adminEnableReturnMaintenance','adminDisableReturnMaintenance','adminCheckPendingReturns',
      'adminTestUpdateQty_','adminTestOldCodeCompatibility',
      'adminPreviewClearAllTestOrders','adminClearAllTestOrders'
    ];

    if (adminActions.includes(action) && !validateSession_(p.session_token)) {
      return res({ ok: false, error: '未授權', auth_required: true });
    }

    switch (action) {
      case 'getProducts':        return res(getProducts(p));
      case 'addProduct':         return res(addProduct(p));
      case 'updateProduct':      return res(updateProduct(p));
      case 'deleteProduct':      return res(deleteProduct(p));

      case 'getInventory':       return res(getInventory(p));
      case 'stockIn':            return res(stockIn(p));
      case 'stockOut':           return res(stockOut(p));
      case 'syncInventory':      return res(syncInventory());

      case 'getStockLog':        return res(getStockLog(p));

      case 'getOrders':              return res(getOrders(p));
      case 'addOrder':               return res(addOrder(p));
      case 'queryOrdersByPhone':     return res(queryOrdersByPhone(p));
      case 'addPosSale':             return res(addPosSale(p));
      case 'updateOrder':            return res(updateOrder(p));
      case 'cancelOrder':            return res(cancelOrder(p));
      case 'confirmOrderPayment':    return res(confirmOrderPayment(p));
      case 'applyPointsDiscount':    return res(applyPointsDiscount(p));

      case 'getAccounts':            return res(getAccounts(p));
      case 'addAccount':             return res(addAccount(p));
      case 'updateAccount':          return res(updateAccount(p));
      case 'getBalance':             return res(getBalance());
      case 'refreshBalance':         return res(refreshBalance());

      case 'getEvents':              return res(getEvents(p));
      case 'addEvent':               return res(addEvent(p));
      case 'updateEvent':            return res(updateEvent(p));
      case 'deleteEvent':            return res(deleteEvent(p));

      case 'getRegistrations':       return res(getRegistrations(p));
      case 'addRegistration':        return res(addRegistration(p));
      case 'updateRegistration':     return res(updateRegistration(p));
      case 'approveRegistration':    return res(approveRegistration(p));
      case 'cancelRegistration':     return res(cancelRegistration(p));
      case 'refundCancelRegistration': return res(refundCancelRegistration(p));
      case 'adminSyncEventCounts':   return res(adminSyncEventCounts_(p));

      case 'getMember':              return res(getMember(p));
      case 'registerMember':         return res(registerMember(p));
      case 'updateMember':           return res(updateMember(p));
      case 'addPoints':              return res(addPoints(p));
      case 'getPointsLog':           return res(getPointsLog(p));

      case 'addReturn':              return res(addReturn(p));
      case 'getReturns':             return res(getReturns(p));
      case 'updateReturn':           return res(updateReturn(p));

      case 'getSettings':            return res(getSettings());
      case 'updateSetting':          return res(updateSetting(p));

      case 'getMonthlyReport':       return res(getMonthlyReport(p));
      case 'getSalesRanking':        return res(getSalesRanking(p));
      case 'getInventoryHealth':     return res(getInventoryHealth(p));
      case 'getMemberStats':         return res(getMemberStats());
      case 'sendLowStockNotification': return res(sendLowStockNotification());
      case 'installTriggers':        return res(installTriggers());

      case 'adminEnableReturnMaintenance':  return res(adminEnableReturnMaintenance());
      case 'adminDisableReturnMaintenance': return res(adminDisableReturnMaintenance());
      case 'adminCheckPendingReturns':      return res(adminCheckPendingReturns());
      case 'adminTestUpdateQty_':           return res(adminTestUpdateQty_(p));
      case 'adminTestOldCodeCompatibility': return res(adminTestOldCodeCompatibility());
      case 'adminPreviewClearAllTestOrders': return res(adminPreviewClearAllTestOrders());
      case 'adminClearAllTestOrders':        return res(adminClearAllTestOrders(p));

      case 'loginAdmin':             return res(loginAdmin(p));
      case 'loginEventAdmin':        return res(loginEventAdmin(p));
      default:
        return res({ ok: false, error: '未知動作: ' + action });
    }
  } catch (err) {
    return res({ ok: false, error: err.toString() });
  }
}

function res(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================================================================
// 工具函式
// ================================================================
function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function getRows(name) {
  const sheet = getSheet(name);
  const last  = sheet.getLastRow();
  if (last < DATA_ROW) return [];
  return sheet.getRange(DATA_ROW, 1, last - DATA_ROW + 1, sheet.getLastColumn()).getValues();
}

function now() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}

function today() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

function genId(prefix) {
  return prefix + Date.now();
}

function findRow(sheetName, colIndex, value) {
  const rows = getRows(sheetName);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][colIndex]) === String(value)) {
      return { row: rows[i], rowNum: DATA_ROW + i, index: i };
    }
  }
  return null;
}

// ================================================================
// 鎖定與維護模式
// ================================================================
function _acquireLock_() {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); return lock; }
  catch(e) { return null; }
}

function isReturnMaintenanceOn_() {
  try {
    return PropertiesService.getScriptProperties().getProperty('RETURN_MAINTENANCE') === 'true';
  } catch(e) { return false; }
}

function adminEnableReturnMaintenance() {
  PropertiesService.getScriptProperties().setProperty('RETURN_MAINTENANCE', 'true');
  return { ok: true, message: '退貨維護模式已啟用' };
}

function adminDisableReturnMaintenance() {
  PropertiesService.getScriptProperties().deleteProperty('RETURN_MAINTENANCE');
  return { ok: true, message: '退貨維護模式已停用' };
}

function adminCheckPendingReturns() {
  const rows = getRows(SHEET.RETURNS);
  const c    = COL.RETURNS;
  const pending = rows.filter(r => r[c.ID] && String(r[c.STATUS]) === '待處理')
                      .map(r => ({ return_id: r[c.ID], name: r[c.NAME], product: r[c.PRODUCT_NAME], created_at: r[c.CREATED] }));
  return { ok: true, count: pending.length, data: pending };
}

// ================================================================
// 商品管理
// ================================================================
function getProducts(p) {
  const rows = getRows(SHEET.PRODUCTS);
  const c = COL.PRODUCTS;
  let list = rows.map(r => ({
    product_id:   r[c.ID],
    name:         r[c.NAME],
    code:         r[c.CODE],
    cost_price:   r[c.COST],
    retail_price: r[c.PRICE],
    image_url:    r[c.IMAGE],
    description:  r[c.DESC],
    category:     r[c.CATEGORY],
    status:       r[c.STATUS],
    threshold:    r[c.THRESHOLD],
    created_at:   r[c.CREATED]
  })).filter(x => x.product_id);

  if (p.category) list = list.filter(x => x.category === p.category);
  if (p.status)   list = list.filter(x => x.status   === p.status);
  return { ok: true, data: list };
}

function addProduct(p) {
  if (!p.name) return { ok: false, error: '缺少商品名稱' };
  const id = genId('P');
  getSheet(SHEET.PRODUCTS).appendRow([
    id, p.name, p.code||'', p.cost_price||'', p.retail_price||'',
    p.image_url||'', p.description||'', p.category||'',
    p.status||'上架', p.threshold||10, now()
  ]);
  getSheet(SHEET.INVENTORY).appendRow([id, p.name, 0, now()]);
  return { ok: true, product_id: id };
}

function updateProduct(p) {
  if (!p.product_id) return { ok: false, error: '缺少 product_id' };
  const found = findRow(SHEET.PRODUCTS, COL.PRODUCTS.ID, p.product_id);
  if (!found) return { ok: false, error: '找不到商品' };
  const sheet = getSheet(SHEET.PRODUCTS);
  const c = COL.PRODUCTS;
  const rn = found.rowNum;
  if (p.name         !== undefined) sheet.getRange(rn, c.NAME+1).setValue(p.name);
  if (p.code         !== undefined) sheet.getRange(rn, c.CODE+1).setValue(p.code);
  if (p.cost_price   !== undefined) sheet.getRange(rn, c.COST+1).setValue(p.cost_price);
  if (p.retail_price !== undefined) sheet.getRange(rn, c.PRICE+1).setValue(p.retail_price);
  if (p.image_url    !== undefined) sheet.getRange(rn, c.IMAGE+1).setValue(p.image_url);
  if (p.description  !== undefined) sheet.getRange(rn, c.DESC+1).setValue(p.description);
  if (p.category     !== undefined) sheet.getRange(rn, c.CATEGORY+1).setValue(p.category);
  if (p.status       !== undefined) sheet.getRange(rn, c.STATUS+1).setValue(p.status);
  if (p.threshold    !== undefined) sheet.getRange(rn, c.THRESHOLD+1).setValue(p.threshold);
  return { ok: true };
}

function deleteProduct(p) {
  if (!p.product_id) return { ok: false, error: '缺少 product_id' };
  return updateProduct({ product_id: p.product_id, status: '下架' });
}

// ================================================================
// 庫存管理
// ================================================================
function getInventory(p) {
  const invRows  = getRows(SHEET.INVENTORY);
  const prodRows = getRows(SHEET.PRODUCTS);
  const ci = COL.INVENTORY;
  const cp = COL.PRODUCTS;

  const prodMap = {};
  prodRows.forEach(r => { prodMap[r[cp.ID]] = r; });

  let list = invRows.map(r => {
    const prod = prodMap[r[ci.ID]] || [];
    const threshold = Number(prod[cp.THRESHOLD]) || 10;
    return {
      product_id:   r[ci.ID],
      name:         r[ci.NAME],
      qty:          Number(r[ci.QTY]) || 0,
      updated_at:   r[ci.UPDATED],
      retail_price: prod[cp.PRICE]    || 0,
      cost_price:   prod[cp.COST]     || 0,
      category:     prod[cp.CATEGORY] || '',
      threshold:    threshold,
      image_url:    prod[cp.IMAGE]    || '',
      status:       prod[cp.STATUS]   || '',
      is_low:       (Number(r[ci.QTY]) || 0) <= threshold
    };
  }).filter(x => x.product_id);

  if (p.low_only === 'true') list = list.filter(x => x.is_low);
  if (p.category) list = list.filter(x => x.category === p.category);
  return { ok: true, data: list };
}

function stockIn(p) {
  const qty = parseInt(p.qty);
  if (!p.product_id || !qty || qty < 1) return { ok: false, error: '缺少必要欄位' };
  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    const result = updateQty_(p.product_id, qty, 'in');
    if (!result.ok) return result;
    getSheet(SHEET.STOCK_LOG).appendRow([
      genId('L'), p.product_id, result.name, '入庫',
      qty, p.price||'', p.partner||'總部', p.note||'', now(), ''
    ]);
    if (p.price && p.auto_account !== 'false') {
      addAccount({
        date: today(), type: '進貨付款',
        partner: p.partner||'總部',
        items: result.name + ' x' + qty,
        income: '', expense: Number(p.price) * qty,
        payment: p.payment||'匯款', status: '待付款', note: p.note||''
      });
    }
    return { ok: true, new_qty: result.new_qty };
  } finally {
    lock.releaseLock();
  }
}

function stockOut(p) {
  const qty = parseInt(p.qty);
  if (!p.product_id || !qty || qty < 1) return { ok: false, error: '缺少必要欄位' };
  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    const result = updateQty_(p.product_id, qty, 'out');
    if (!result.ok) return result;
    getSheet(SHEET.STOCK_LOG).appendRow([
      genId('L'), p.product_id, result.name, '出庫',
      qty, p.price||'', p.partner||'', p.note||'', now(), ''
    ]);
    return { ok: true, new_qty: result.new_qty };
  } finally {
    lock.releaseLock();
  }
}

function updateQty(productId, qty, type) {
  const sheet = getSheet(SHEET.INVENTORY);
  const found = findRow(SHEET.INVENTORY, COL.INVENTORY.ID, productId);
  if (!found) return { ok: false, error: '找不到庫存記錄' };
  const cur    = parseInt(found.row[COL.INVENTORY.QTY]) || 0;
  const newQty = type === 'in' ? cur + qty : cur - qty;
  if (newQty < 0) return { ok: false, error: `庫存不足，現有 ${cur} 件` };
  sheet.getRange(found.rowNum, COL.INVENTORY.QTY+1).setValue(newQty);
  sheet.getRange(found.rowNum, COL.INVENTORY.UPDATED+1).setValue(now());
  // 出庫歸零 → 自動下架
  if (newQty === 0 && type === 'out') {
    try {
      const prodFound = findRow(SHEET.PRODUCTS, COL.PRODUCTS.ID, productId);
      if (prodFound) {
        getSheet(SHEET.PRODUCTS).getRange(prodFound.rowNum, COL.PRODUCTS.STATUS+1).setValue('下架');
      }
    } catch(e) {}
  }
  return { ok: true, new_qty: newQty, name: found.row[COL.INVENTORY.NAME] };
}

// 內部版：全列原子寫入（QTY + UPDATED + LAST_OP_ID 一次 setValues），呼叫前必須持有 lock
function updateQty_(productId, qty, type, opId) {
  const absQty = Math.abs(parseInt(qty) || 0);
  if (absQty <= 0)                          return { ok:false, error:'qty 必須大於 0' };
  if (type !== 'in' && type !== 'out')      return { ok:false, error:'未知 type: ' + type };
  const sheet = getSheet(SHEET.INVENTORY);
  const c     = COL.INVENTORY;
  const found = findRow(SHEET.INVENTORY, c.ID, productId);
  if (!found) return { ok:false, error:'找不到庫存記錄' };
  const cur    = parseInt(found.row[c.QTY]) || 0;
  const newQty = type === 'in' ? cur + absQty : cur - absQty;
  if (newQty < 0) return { ok:false, error:`庫存不足，現有 ${cur} 件` };
  const rowData = found.row.slice();
  rowData[c.QTY]     = newQty;
  rowData[c.UPDATED] = now();
  if (opId) rowData[c.LAST_OP_ID] = opId;
  sheet.getRange(found.rowNum, 1, 1, rowData.length).setValues([rowData]);
  if (newQty === 0 && type === 'out') {
    try {
      const pf = findRow(SHEET.PRODUCTS, COL.PRODUCTS.ID, productId);
      if (pf) getSheet(SHEET.PRODUCTS).getRange(pf.rowNum, COL.PRODUCTS.STATUS+1).setValue('下架');
    } catch(e) {}
  }
  return { ok:true, new_qty:newQty, name:found.row[c.NAME] };
}

function syncInventory() {
  const prodRows = getRows(SHEET.PRODUCTS);
  const invRows  = getRows(SHEET.INVENTORY);
  const cp = COL.PRODUCTS;
  const ci = COL.INVENTORY;
  const invSheet = getSheet(SHEET.INVENTORY);
  const invIds = new Set(invRows.map(r => r[ci.ID]));
  let added = 0;
  prodRows.forEach(r => {
    if (r[cp.ID] && !invIds.has(r[cp.ID])) {
      invSheet.appendRow([r[cp.ID], r[cp.NAME], 0, now()]);
      added++;
    }
  });
  return { ok: true, added };
}

// ================================================================
// 進出貨記錄
// ================================================================
function getStockLog(p) {
  const rows = getRows(SHEET.STOCK_LOG);
  const c = COL.STOCK_LOG;
  let list = rows.map(r => ({
    log_id:     r[c.ID],
    product_id: r[c.PID],
    name:       r[c.NAME],
    type:       r[c.TYPE],
    qty:        r[c.QTY],
    price:      r[c.PRICE],
    partner:    r[c.PARTNER],
    note:       r[c.NOTE],
    created_at: r[c.CREATED]
  })).filter(x => x.log_id);

  if (p.type)       list = list.filter(x => x.type       === p.type);
  if (p.product_id) list = list.filter(x => x.product_id === p.product_id);
  list.reverse();
  return { ok: true, data: list.slice(0, parseInt(p.limit)||100) };
}

// ================================================================
// 訂單管理
// ================================================================
function getOrders(p) {
  const rows = getRows(SHEET.ORDERS);
  const c = COL.ORDERS;
  let list = rows.map(r => ({
    order_id:      r[c.ID],
    customer_name: r[c.CNAME],
    phone:         r[c.PHONE],
    address:       r[c.ADDRESS],
    items:         r[c.ITEMS],
    total:         r[c.TOTAL],
    payment:       r[c.PAYMENT],
    status:        r[c.STATUS],
    note:          r[c.NOTE],
    created_at:    r[c.CREATED],
    subtotal:      r[c.SUBTOTAL]      || r[c.TOTAL] || 0,
    shipping_fee:  r[c.SHIPPING_FEE]  || 0,
    coupon_code:   r[c.COUPON_CODE]   || '',
    cancelled_by:  r[c.CANCELLED_BY]  || '',
    cancelled_at:  r[c.CANCELLED_AT]  || '',
    cancel_reason: r[c.CANCEL_REASON] || ''
  })).filter(x => x.order_id);

  if (p.status) list = list.filter(x => x.status === p.status);
  if (p.phone)  list = list.filter(x => String(x.phone) === String(p.phone));
  list.reverse();
  return { ok: true, data: list };
}

const ORDER_TOKEN = 'YC_SHOP_2026';

// 前台查詢訂單（公開端點，僅回傳白名單欄位，不含地址/備註/取消原因）
function queryOrdersByPhone(p) {
  if (p.token !== ORDER_TOKEN) return { ok: false, error: '驗證失敗' };
  if (!p.phone) return { ok: false, error: '請輸入手機號碼' };
  const rows = getRows(SHEET.ORDERS);
  const c = COL.ORDERS;
  const list = rows
    .filter(r => r[c.ID] && String(r[c.PHONE]) === String(p.phone))
    .map(r => ({
      order_id:     r[c.ID],
      customer_name:r[c.CNAME],
      phone:        r[c.PHONE],
      total:        r[c.TOTAL],
      payment:      r[c.PAYMENT],
      status:       r[c.STATUS],
      created_at:   r[c.CREATED],
      subtotal:     r[c.SUBTOTAL]     || r[c.TOTAL] || 0,
      shipping_fee: r[c.SHIPPING_FEE] || 0,
      items: (function(){ try { return JSON.parse(r[c.ITEMS]||'[]').map(function(i){ return {name:i.name,qty:i.qty,price:i.price}; }); } catch(e){ return []; } })()
    }))
    .reverse();
  return { ok: true, data: list };
}

function addOrder(p) {
  if (p.token !== ORDER_TOKEN) return { ok: false, error: '驗證失敗' };
  if (!p.customer_name || !p.phone || !p.items) return { ok: false, error: '缺少必要欄位' };

  let items;
  try { items = JSON.parse(p.items); } catch(e) { return { ok: false, error: '訂單資料格式錯誤' }; }
  if (!items.length) return { ok: false, error: '購物車是空的' };

  // lock 外快速擋：數量格式
  for (const item of items) {
    const qty = parseInt(item.qty);
    if (!item.product_id) return { ok: false, error: '商品缺少 product_id' };
    if (!qty || qty <= 0 || qty !== parseFloat(item.qty))
      return { ok: false, error: '「'+(item.name||item.product_id)+'」數量必須為正整數' };
  }

  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    // 後端重算價格 + lock 內驗商品/庫存（送單時庫存快照，非正式保留；後台確認才扣庫存）
    const backendItems = [];
    var backendSubtotal = 0;
    for (const item of items) {
      const qty = parseInt(item.qty);
      const prodRow = findRow(SHEET.PRODUCTS, COL.PRODUCTS.ID, item.product_id);
      if (!prodRow) return { ok: false, error: '商品「'+(item.name||item.product_id)+'」不存在' };
      const prodStatus = String(prodRow.row[COL.PRODUCTS.STATUS] || '');
      if (prodStatus !== '上架')
        return { ok: false, error: '商品「'+(item.name||item.product_id)+'」狀態非上架（'+prodStatus+'）' };
      const rp = Number(prodRow.row[COL.PRODUCTS.PRICE]) || 0;
      const invRow = findRow(SHEET.INVENTORY, COL.INVENTORY.ID, item.product_id);
      if (!invRow) return { ok: false, error: '商品「'+(item.name||item.product_id)+'」無庫存記錄' };
      const stock = parseInt(invRow.row[COL.INVENTORY.QTY]) || 0;
      if (stock < qty)
        return { ok: false, error: '「'+(item.name||item.product_id)+'」庫存不足（剩餘 '+stock+' 件，需要 '+qty+' 件）' };
      backendItems.push({ product_id: item.product_id, name: item.name || String(prodRow.row[COL.PRODUCTS.NAME]), qty, price: rp });
      backendSubtotal += rp * qty;
    }

    const settings = getSettingsMap_();
    const freeThres = Number(settings.free_shipping_threshold) || 1000;
    const isPickup  = (p.payment === '現場取貨');
    const shipFee   = isPickup ? 0 : (backendSubtotal >= freeThres ? 0 : (Number(settings.shipping_fee) || 80));
    const total     = backendSubtotal + shipFee;

    const id = 'ORD' + Date.now();
    const sheet = getSheet(SHEET.ORDERS);
    sheet.appendRow([
      id, p.customer_name, p.phone, p.address||'',
      JSON.stringify(backendItems), total, p.payment||'ATM轉帳',
      '待確認', p.note||'', now(),
      backendSubtotal, shipFee, p.coupon_code||'',
      '', '', ''
    ]);
    sheet.getRange(sheet.getLastRow(), COL.ORDERS.PHONE+1).setNumberFormat('@').setValue(p.phone||'');
    sendLineMsg(`🛒 新訂單！\n客人：${p.customer_name}\n電話：${p.phone}\n小計：NT$ ${backendSubtotal.toLocaleString()}${shipFee>0?' 運費：NT$ '+shipFee:' 免運'}\n合計：NT$ ${total.toLocaleString()}\n付款：${p.payment||'ATM轉帳'}\n備註：${p.note||'無'}\n時間：${now()}`);
    return { ok: true, order_id: id, subtotal: backendSubtotal, shipping_fee: shipFee, total };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// 現場銷售 / 快速結帳（POS）
// ================================================================
function addPosSale(p) {
  // ── 基本格式驗證 ──
  if (!p.items) return { ok:false, error:'缺少商品資料' };
  var items;
  try { items = JSON.parse(p.items); } catch(e) { return { ok:false, error:'商品格式錯誤' }; }
  if (!items.length) return { ok:false, error:'購物車是空的' };

  // ── 付款方式白名單 ──
  var ALLOWED_PMT = ['現金','轉帳','LINE Pay','刷卡','其他'];
  var pmt = p.payment_method || '現金';
  if (ALLOWED_PMT.indexOf(pmt) < 0)
    return { ok:false, error:'不支援的付款方式：' + pmt };

  // ── 後端重算商品資料（不信任前端 price）──
  var backendPrices = {};   // product_id -> retail_price
  var backendSubtotal = 0;
  for (var vi = 0; vi < items.length; vi++) {
    var vit = items[vi];
    // qty 必須是正整數
    var vQty = parseInt(vit.qty);
    if (!vit.product_id)            return { ok:false, error:'第 '+(vi+1)+' 項商品缺少 product_id' };
    if (!vQty || vQty <= 0 || vQty !== parseFloat(vit.qty))
      return { ok:false, error:'「'+vit.name+'」數量必須為正整數' };
    // 查商品（取 retail_price + status）
    var prodRow = findRow(SHEET.PRODUCTS, COL.PRODUCTS.ID, vit.product_id);
    if (!prodRow) return { ok:false, error:'商品「'+(vit.name||vit.product_id)+'」不存在' };
    var prodStatus = String(prodRow.row[COL.PRODUCTS.STATUS] || '');
    if (prodStatus !== '上架') return { ok:false, error:'商品「'+(vit.name||vit.product_id)+'」狀態非上架（'+prodStatus+'）' };
    var rp = Number(prodRow.row[COL.PRODUCTS.PRICE]) || 0;
    backendPrices[vit.product_id] = rp;
    backendSubtotal += rp * vQty;
    // 庫存預檢（lock 外，快速回傳錯誤）
    var invRow = findRow(SHEET.INVENTORY, COL.INVENTORY.ID, vit.product_id);
    if (!invRow) return { ok:false, error:'商品「'+(vit.name||vit.product_id)+'」無庫存記錄' };
    if ((parseInt(invRow.row[COL.INVENTORY.QTY])||0) < vQty)
      return { ok:false, error:'「'+(vit.name||vit.product_id)+'」庫存不足' };
  }

  // ── 折扣驗證 ──
  var discount = Number(p.discount);
  if (isNaN(discount) || discount < 0) return { ok:false, error:'折扣必須 >= 0' };
  if (discount > backendSubtotal) return { ok:false, error:'折扣（'+discount+'）不可大於小計（'+backendSubtotal+'）' };
  var total = backendSubtotal - discount;

  // ── orderId / accountId ──
  var orderId   = p.pos_id || ('POS'+Date.now()+'_'+Math.random().toString(36).slice(2,6).toUpperCase());
  var accountId = 'A_POS_' + orderId;

  // ── lock 外預檢（fast path）──
  if (p.pos_id) {
    var preEx = findRow(SHEET.ORDERS, COL.ORDERS.ID, p.pos_id);
    if (preEx) {
      var preSt = String(preEx.row[COL.ORDERS.STATUS]);
      if (preSt === '已完成')   return { ok:true,  order_id:p.pos_id, idempotent:true };
      if (preSt === '處理中')   return { ok:false, error:'訂單處理中，請稍後再試' };
      if (preSt === '處理失敗') return { ok:false, error:'此 POS 交易曾處理失敗，請重新開一筆' };
      return { ok:false, error:'此 POS 編號已存在，需人工檢查' };
    }
  }

  // ── 取 Lock ──
  var lock = _acquireLock_();
  if (!lock) return { ok:false, error:'系統忙碌，請稍後再試' };

  var orderRowNum = -1, deductedItems = [], completedSteps = [];

  try {
    // ★ lock 內再次確認 pos_id 不存在（防競態）
    var lockEx = findRow(SHEET.ORDERS, COL.ORDERS.ID, orderId);
    if (lockEx) {
      var lockSt = String(lockEx.row[COL.ORDERS.STATUS]);
      if (lockSt === '已完成')   return { ok:true,  order_id:orderId, idempotent:true };
      if (lockSt === '處理中')   return { ok:false, error:'訂單處理中，請稍後再試' };
      if (lockSt === '處理失敗') return { ok:false, error:'此 POS 交易曾處理失敗，請重新開一筆' };
      return { ok:false, error:'此 POS 編號已存在，需人工檢查' };
    }

    // Step 0: lock 內重新確認庫存（TOCTOU 防護）
    for (var si = 0; si < items.length; si++) {
      var sit = items[si];
      var sinv = findRow(SHEET.INVENTORY, COL.INVENTORY.ID, sit.product_id);
      if (!sinv) throw new Error('商品「'+(sit.name||sit.product_id)+'」無庫存記錄');
      var sstock = parseInt(sinv.row[COL.INVENTORY.QTY]) || 0;
      if (sstock < (parseInt(sit.qty)||0))
        throw new Error('「'+(sit.name||sit.product_id)+'」庫存不足（剩'+sstock+'件，需'+sit.qty+'件）');
    }
    completedSteps.push('stock_check');

    // Step 1: 建立訂單（處理中）
    var os = getSheet(SHEET.ORDERS), c = COL.ORDERS;
    var itemsForStorage = JSON.stringify(items.map(function(it) {
      return { product_id:it.product_id, name:it.name, qty:parseInt(it.qty), price:backendPrices[it.product_id] };
    }));
    os.appendRow([
      orderId, p.customer_name||'現場客人', p.phone||'', '',
      itemsForStorage, total, pmt,
      '處理中', p.note||'', now(),
      backendSubtotal, 0, '', '', '', ''
    ]);
    orderRowNum = os.getLastRow();
    if (p.phone) os.getRange(orderRowNum, c.PHONE+1).setNumberFormat('@').setValue(p.phone);
    completedSteps.push('order_created');

    // Step 2: 扣庫存 + STOCK_LOG
    var logSheet = getSheet(SHEET.STOCK_LOG);
    for (var di = 0; di < items.length; di++) {
      var dit = items[di];
      var dqty = parseInt(dit.qty);
      var qr = updateQty_(dit.product_id, dqty, 'out');
      if (!qr.ok) throw new Error('扣庫存失敗：「'+(dit.name||dit.product_id)+'」'+qr.error);
      logSheet.appendRow([
        genId('L'), dit.product_id, dit.name||qr.name, '出庫',
        dqty, backendPrices[dit.product_id]||'', p.customer_name||'現場客人',
        '[POS:'+orderId+']', now(), ''
      ]);
      deductedItems.push({ product_id:dit.product_id, name:dit.name||qr.name, qty:dqty });
    }
    completedSteps.push('stock_deducted');

    // Step 3: 帳本（帶固定 accountId，檢查回傳）
    var accResult = addAccount({
      id: accountId,
      date: today(), type: '銷售收款',
      partner: p.customer_name||'現場客人',
      items: '現場銷售 '+orderId,
      income: total, expense: '',
      payment: pmt,
      status: '已收款',
      note: '[POS:'+orderId+']'+(discount>0?' 折扣NT$'+discount:'')
    });
    if (!accResult.ok) throw new Error('帳本寫入失敗：'+(accResult.error||''));
    completedSteps.push('account_written');

    // Step 4: 訂單改已完成
    os.getRange(orderRowNum, c.STATUS+1).setValue('已完成');
    completedSteps.push('order_completed');

    try { refreshBalance(); } catch(e) {}

    // Step 5: 加點（訂單確認後執行；失敗只記錄 points_skipped，不 rollback 主交易）
    var pointsAdded = 0;
    if (p.phone && total > 0) {
      var earnRate = Number(getSettingsMap_().points_earn_rate) || 100;
      pointsAdded = Math.floor(total / earnRate);
      if (pointsAdded > 0) {
        try {
          addPoints_({ phone:p.phone, points:pointsAdded, amount:total,
                       note:'現場銷售 [POS:'+orderId+']',
                       refId:'POS:'+orderId });
          completedSteps.push('points_added:'+pointsAdded);
        } catch(e2) { completedSteps.push('points_skipped:'+e2.message); }
      }
    }

    // LINE（選配）
    if (p.notify === 'true') {
      try { sendLineMsg('🏪 現場銷售\n訂單：'+orderId+
        '\n客人：'+(p.customer_name||'現場客人')+
        '\n合計：NT$ '+total.toLocaleString()+'\n付款：'+pmt+
        '\n時間：'+now()); } catch(e) {}
    }

    return { ok:true, order_id:orderId, subtotal:backendSubtotal, discount:discount,
             total:total, points_added:pointsAdded, completed_steps:completedSteps };

  } catch(e) {
    var rollbackSteps = [];
    // 補回已扣庫存
    for (var ri = 0; ri < deductedItems.length; ri++) {
      var rdi = deductedItems[ri];
      try {
        updateQty_(rdi.product_id, rdi.qty, 'in');
        getSheet(SHEET.STOCK_LOG).appendRow([
          genId('L'), rdi.product_id, rdi.name, '入庫（補回）',
          rdi.qty, '', '系統補回',
          '[POS:'+orderId+'][ROLLBACK]', now(), ''
        ]);
        rollbackSteps.push({ type:'stock', product_id:rdi.product_id, status:'rolled_back' });
      } catch(e2) {
        rollbackSteps.push({ type:'stock', product_id:rdi.product_id, status:'rollback_failed', error:e2.message });
      }
    }
    // 帳本作廢（若已寫入）
    if (completedSteps.indexOf('account_written') >= 0) {
      try {
        var vr = updateAccount({ account_id:accountId, status:'已作廢',
          note:'[POS:'+orderId+'][ROLLBACK] '+e.message });
        rollbackSteps.push({ type:'account', status:vr.ok?'voided':'account_void_failed',
          error:vr.ok?undefined:vr.error });
      } catch(e4) {
        rollbackSteps.push({ type:'account', status:'account_void_failed', error:e4.message });
      }
    }
    // 訂單標記處理失敗
    if (orderRowNum > 0) {
      try {
        var os5 = getSheet(SHEET.ORDERS);
        os5.getRange(orderRowNum, COL.ORDERS.STATUS+1).setValue('處理失敗');
        os5.getRange(orderRowNum, COL.ORDERS.CANCEL_REASON+1).setValue(e.message);
      } catch(e5) {}
    }
    return { ok:false, error:e.message, order_id:orderId,
             completed_steps:completedSteps, rollback_steps:rollbackSteps };
  } finally {
    lock.releaseLock();
  }
}

function updateOrder(p) {
  if (!p.order_id) return { ok: false, error: '缺少 order_id' };
  const found = findRow(SHEET.ORDERS, COL.ORDERS.ID, p.order_id);
  if (!found) return { ok: false, error: '找不到訂單' };
  const sheet = getSheet(SHEET.ORDERS);
  const c = COL.ORDERS;
  const rn = found.rowNum;
  const currentStatus = String(found.row[c.STATUS]);
  // 防止重複扣庫存：已確認以後的狀態不可再次傳 deduct=true
  if (p.status === '已確認' && p.deduct === 'true' &&
      ['已確認','已出貨','已付款','已完成'].includes(currentStatus)) {
    return { ok: false, error: '訂單已確認，不可重複扣庫存' };
  }
  if (p.status !== undefined) sheet.getRange(rn, c.STATUS+1).setValue(p.status);
  if (p.note   !== undefined) sheet.getRange(rn, c.NOTE+1).setValue(p.note);
  if (p.status === '已確認' && p.deduct === 'true') {
    const lock = _acquireLock_();
    if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
    try {
      const items = JSON.parse(found.row[c.ITEMS]);
      const logSheet = getSheet(SHEET.STOCK_LOG);
      items.forEach(item => {
        const qr = updateQty_(item.product_id, parseInt(item.qty)||0, 'out');
        if (!qr.ok) throw new Error(qr.error);
        logSheet.appendRow([
          genId('L'), item.product_id, item.name||qr.name, '出庫',
          parseInt(item.qty)||0, item.price||'', found.row[c.CNAME], '訂單:'+p.order_id, now(), ''
        ]);
      });
      addAccount({
        date: today(), type: '銷售收款',
        partner: found.row[c.CNAME],
        items: '訂單 ' + p.order_id,
        income: found.row[c.TOTAL], expense: '',
        payment: found.row[c.PAYMENT], status: '待收款', note: ''
      });
    } catch(e) {
      return { ok: false, error: '扣庫存失敗：' + e.message };
    } finally {
      lock.releaseLock();
    }
    try { refreshBalance(); } catch(e) {}
  }
  return { ok: true };
}

function cancelOrder(p) {
  if (!p.order_id) return { ok: false, error: '缺少 order_id' };
  const found = findRow(SHEET.ORDERS, COL.ORDERS.ID, p.order_id);
  if (!found) return { ok: false, error: '找不到訂單' };
  const order = found.row;
  const c = COL.ORDERS;
  const status = String(order[c.STATUS]);
  if (['已完成', '已取消', '已付款'].includes(status)) {
    return { ok: false, error: `此訂單狀態「${status}」無法取消，需走退款流程` };
  }
  const sheet = getSheet(SHEET.ORDERS);
  const rn = found.rowNum;
  sheet.getRange(rn, c.STATUS+1).setValue('已取消');
  sheet.getRange(rn, c.CANCELLED_BY+1).setValue(p.cancelled_by || '管理員');
  sheet.getRange(rn, c.CANCELLED_AT+1).setValue(now());
  sheet.getRange(rn, c.CANCEL_REASON+1).setValue(p.cancel_reason || '');

  // 庫存回補：訂單已確認或已出貨才補
  if (['已確認', '已出貨'].includes(status)) {
    const lock = _acquireLock_();
    if (lock) {
      try {
        const orderItems = JSON.parse(order[c.ITEMS] || '[]');
        const logSheet = getSheet(SHEET.STOCK_LOG);
        orderItems.forEach(item => {
          const qty = parseInt(item.qty) || 0;
          if (!item.product_id || qty <= 0) return;
          updateQty_(item.product_id, qty, 'in');
          logSheet.appendRow([
            genId('SL'), item.product_id, item.name || '', '退回',
            qty, item.price || '', order[c.CNAME] || '', '取消訂單退回：' + p.order_id, now(), ''
          ]);
        });
      } catch(e) {
        Logger.log('取消訂單庫存回補失敗：' + e.toString());
      } finally {
        lock.releaseLock();
      }
    } else {
      Logger.log('取消訂單：無法取得鎖定，庫存未回補');
    }
  }

  // 作廢待收款
  try {
    const accRows = getRows(SHEET.ACCOUNTS);
    const ca = COL.ACCOUNTS;
    const pendingIdx = accRows.findIndex(r =>
      String(r[ca.ITEMS]).includes(p.order_id) && String(r[ca.STATUS]) === '待收款'
    );
    if (pendingIdx >= 0) {
      getSheet(SHEET.ACCOUNTS).getRange(DATA_ROW + pendingIdx, ca.STATUS+1).setValue('已作廢');
    }
  } catch(e) {}

  try { refreshBalance(); } catch(e2) {}
  sendLineMsg(`❌ 訂單取消\n訂單：${p.order_id}\n客人：${order[c.CNAME]}\n原因：${p.cancel_reason||'—'}\n時間：${now()}`);
  return { ok: true };
}

function applyPointsDiscount(p) {
  if (!p.order_id || !p.phone || !p.points_to_use) return { ok: false, error: '缺少必要欄位' };
  const ptsUse = parseInt(p.points_to_use);
  if (isNaN(ptsUse) || ptsUse <= 0) return { ok: false, error: '點數數量無效' };

  const found = findRow(SHEET.ORDERS, COL.ORDERS.ID, p.order_id);
  if (!found) return { ok: false, error: '找不到訂單' };
  const order = found.row;
  const c = COL.ORDERS;
  if (String(order[c.STATUS]) === '已取消') return { ok: false, error: '訂單已取消' };

  const settings = getSettingsMap_();
  const minPts   = Number(settings.points_redeem_min)      || 100;
  const maxRate  = Number(settings.points_redeem_max_rate)  || 0.2;
  if (ptsUse < minPts) return { ok: false, error: `最少需使用 ${minPts} 點` };

  // 讀取會員點數
  const memRows = getRows(SHEET.MEMBERS);
  const cm = COL.MEMBERS;
  const memIdx = memRows.findIndex(r => String(r[cm.PHONE]) === String(p.phone));
  if (memIdx < 0) return { ok: false, error: '找不到會員' };
  const mem = memRows[memIdx];
  const balance = Number(mem[cm.POINTS]) || 0;
  if (balance < ptsUse) return { ok: false, error: `點數不足（現有 ${balance} 點）` };

  const subtotal = Number(order[c.SUBTOTAL]) || Number(order[c.TOTAL]) || 0;
  const maxDisc  = Math.floor(subtotal * maxRate);
  if (ptsUse > maxDisc) return { ok: false, error: `最多可折抵 ${maxDisc} 點（商品金額的 ${Math.round(maxRate*100)}%）` };

  // 扣點並更新訂單
  const newBal = balance - ptsUse;
  const sheet = getSheet(SHEET.ORDERS);
  const newTotal = Math.max(0, Number(order[c.TOTAL]) - ptsUse);
  sheet.getRange(found.rowNum, c.TOTAL+1).setValue(newTotal);
  sheet.getRange(found.rowNum, c.NOTE+1).setValue((order[c.NOTE]||'') + ` [折抵${ptsUse}點]`);

  const memSheet = getSheet(SHEET.MEMBERS);
  memSheet.getRange(DATA_ROW + memIdx, cm.POINTS+1).setValue(newBal);
  const logSheet = getSheet(SHEET.POINTS_LOG);
  if (logSheet) logSheet.appendRow(['PT'+Date.now(), p.phone, mem[cm.NAME], '折抵消費', -ptsUse, newBal, '訂單折抵：'+p.order_id, now()]);

  return { ok: true, points_used: ptsUse, new_total: newTotal, new_points_balance: newBal };
}

// ================================================================
// 商品帳本
// ================================================================
function getAccounts(p) {
  const rows = getRows(SHEET.ACCOUNTS);
  const c = COL.ACCOUNTS;
  let list = rows.map(r => ({
    account_id: r[c.ID],
    date:       r[c.DATE],
    type:       r[c.TYPE],
    partner:    r[c.PARTNER],
    items:      r[c.ITEMS],
    income:     r[c.INCOME],
    expense:    r[c.EXPENSE],
    payment:    r[c.PAYMENT],
    status:     r[c.STATUS],
    note:       r[c.NOTE],
    created_at: r[c.CREATED]
  })).filter(x => x.account_id);

  if (p.type)   list = list.filter(x => x.type   === p.type);
  if (p.status) list = list.filter(x => x.status === p.status);
  if (p.month)  list = list.filter(x => String(x.date).startsWith(p.month));
  list.reverse();
  return { ok: true, data: list };
}

function addAccount(p) {
  // 冪等性：若呼叫端指定 id，先查是否已存在
  if (p.id) {
    const existing = findRow(SHEET.ACCOUNTS, COL.ACCOUNTS.ID, p.id);
    if (existing) {
      const exType = String(existing.row[COL.ACCOUNTS.TYPE]);
      if (exType === (p.type || '')) return { ok: true, account_id: p.id };
      return { ok: false, error: 'needs_review：帳目 ' + p.id + ' 已存在但類型不符' };
    }
  }
  const id = p.id || genId('A');
  getSheet(SHEET.ACCOUNTS).appendRow([
    id, p.date||today(), p.type||'', p.partner||'',
    p.items||'', p.income||0, p.expense||0,
    p.payment||'', p.status||'', p.note||'', now()
  ]);
  return { ok: true, account_id: id };
}

function updateAccount(p) {
  if (!p.account_id) return { ok: false, error: '缺少 account_id' };
  const found = findRow(SHEET.ACCOUNTS, COL.ACCOUNTS.ID, p.account_id);
  if (!found) return { ok: false, error: '找不到帳目' };
  const sheet = getSheet(SHEET.ACCOUNTS);
  const c = COL.ACCOUNTS;
  const rn = found.rowNum;
  if (p.status  !== undefined) sheet.getRange(rn, c.STATUS+1).setValue(p.status);
  if (p.income  !== undefined) sheet.getRange(rn, c.INCOME+1).setValue(p.income);
  if (p.expense !== undefined) sheet.getRange(rn, c.EXPENSE+1).setValue(p.expense);
  if (p.note    !== undefined) sheet.getRange(rn, c.NOTE+1).setValue(p.note);
  return { ok: true };
}

// ================================================================
// 帳務總覽
// ================================================================
function getBalance() {
  const rows = getRows(SHEET.BALANCE);
  const c = COL.BALANCE;
  const map = {};
  rows.forEach(r => { if (r[c.ITEM]) map[r[c.ITEM]] = r[c.AMOUNT]; });
  return { ok: true, data: map };
}

function refreshBalance() {
  const thisMonth = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  let totalIncome = 0, totalExpense = 0, receivable = 0, payable = 0;
  let monthIncome = 0, monthExpense = 0;
  const c = COL.ACCOUNTS;

  // 商品帳本 + 活動帳本 合計
  [SHEET.ACCOUNTS, SHEET.EVENT_ACCOUNTS].forEach(sheetName => {
    try {
      getRows(sheetName).forEach(r => {
        if (!r[c.ID]) return;
        const status  = String(r[c.STATUS] || '');
        if (status === '已作廢') return;
        const income  = Number(r[c.INCOME])  || 0;
        const expense = Number(r[c.EXPENSE]) || 0;
        // 只計算真正入帳的金額
        if (status === '已收款') { totalIncome  += income;  }
        if (status === '已付款' || status === '已完成') { totalExpense += expense; }
        if (status === '待收款') { receivable   += income;  }
        if (status === '待付款') { payable       += expense; }
        if (String(r[c.DATE]).startsWith(thisMonth)) {
          if (status === '已收款') { monthIncome  += income;  }
          if (status === '已付款' || status === '已完成') { monthExpense += expense; }
        }
      });
    } catch(e) {}
  });

  const sheet = getSheet(SHEET.BALANCE);
  sheet.clearContents();
  sheet.getRange(1,1,2,3).setValues([
    ['項目','金額','更新時間'],
    ['item','amount','updated_at']
  ]);
  const balanceData = [
    ['累計收入',totalIncome],['累計支出',totalExpense],
    ['淨利',totalIncome-totalExpense],['應收帳款',receivable],
    ['應付帳款',payable],['本月收入',monthIncome],
    ['本月支出',monthExpense],['本月淨利',monthIncome-monthExpense]
  ];
  balanceData.forEach((row, i) => {
    sheet.getRange(DATA_ROW + i, 1, 1, 3).setValues([[row[0], row[1], now()]]);
  });
  return { ok: true, data: Object.fromEntries(balanceData) };
}

// ================================================================
// 活動管理
// ================================================================
function getEvents(p) {
  const rows = getRows(SHEET.EVENTS);
  const c = COL.EVENTS;
  let list = rows.map(r => ({
    event_id:       r[c.ID],
    name:           r[c.NAME],
    date:           r[c.DATE],
    location:       r[c.LOCATION],
    description:    r[c.DESC],
    capacity:       r[c.CAPACITY],
    registered:     r[c.REGISTERED],
    accom_quota:    r[c.ACCOM_QUOTA],
    no_accom_quota: r[c.NO_ACCOM_QUOTA],
    fee_single:     r[c.FEE_SINGLE],
    fee_yearly:     r[c.FEE_YEARLY],
    fee_half:       r[c.FEE_HALF],
    status:              r[c.STATUS],
    created_at:          r[c.CREATED],
    image_url:           r[c.IMAGE] || '',
    accom_registered:    Number(r[c.ACCOM_REGISTERED])    || 0,
    no_accom_registered: Number(r[c.NO_ACCOM_REGISTERED]) || 0,
    fee_accom:    Number(r[c.FEE_ACCOM])    || 0,
    fee_no_accom: Number(r[c.FEE_NO_ACCOM]) || 0
  })).filter(x => x.event_id);

  if (p.status) list = list.filter(x => x.status === p.status);
  return { ok: true, data: list };
}

function addEvent(p) {
  if (!p.name || !p.date || !p.location) return { ok: false, error: '缺少必要欄位' };
  const id = genId('E');
  getSheet(SHEET.EVENTS).appendRow([
    id, p.name, p.date, p.location,
    p.description||'', p.capacity||0, 0,
    p.accom_quota||0, p.no_accom_quota||0,
    p.fee_single||12000, p.fee_yearly||120000, p.fee_half||132000,
    p.status||'報名中', now(),
    p.image_url||'', 0, 0,
    p.fee_accom||'', p.fee_no_accom||''
  ]);
  return { ok: true, event_id: id };
}

function updateEvent(p) {
  if (!p.event_id) return { ok: false, error: '缺少 event_id' };
  const found = findRow(SHEET.EVENTS, COL.EVENTS.ID, p.event_id);
  if (!found) return { ok: false, error: '找不到活動' };
  const sheet = getSheet(SHEET.EVENTS);
  const c = COL.EVENTS;
  const rn = found.rowNum;
  if (p.name        !== undefined) sheet.getRange(rn, c.NAME+1).setValue(p.name);
  if (p.date        !== undefined) sheet.getRange(rn, c.DATE+1).setValue(p.date);
  if (p.location    !== undefined) sheet.getRange(rn, c.LOCATION+1).setValue(p.location);
  if (p.description !== undefined) sheet.getRange(rn, c.DESC+1).setValue(p.description);
  if (p.capacity    !== undefined) sheet.getRange(rn, c.CAPACITY+1).setValue(p.capacity);
  if (p.status      !== undefined) sheet.getRange(rn, c.STATUS+1).setValue(p.status);
  if (p.fee_single  !== undefined) sheet.getRange(rn, c.FEE_SINGLE+1).setValue(p.fee_single);
  if (p.fee_yearly  !== undefined) sheet.getRange(rn, c.FEE_YEARLY+1).setValue(p.fee_yearly);
  if (p.fee_half    !== undefined) sheet.getRange(rn, c.FEE_HALF+1).setValue(p.fee_half);
  if (p.image_url    !== undefined) sheet.getRange(rn, c.IMAGE+1).setValue(p.image_url);
  if (p.fee_accom    !== undefined) sheet.getRange(rn, c.FEE_ACCOM+1).setValue(p.fee_accom);
  if (p.fee_no_accom !== undefined) sheet.getRange(rn, c.FEE_NO_ACCOM+1).setValue(p.fee_no_accom);
  return { ok: true };
}

function deleteEvent(p) {
  if (!p.event_id) return { ok: false, error: '缺少 event_id' };
  const found = findRow(SHEET.EVENTS, COL.EVENTS.ID, p.event_id);
  if (!found) return { ok: false, error: '找不到活動' };
  getSheet(SHEET.EVENTS).deleteRow(found.rowNum);
  return { ok: true };
}

// ================================================================
// 報名管理
// ================================================================
function getRegistrations(p) {
  const rows = getRows(SHEET.REGISTRATIONS);
  const c = COL.REGISTRATIONS;
  let list = rows.map(r => ({
    reg_id:          r[c.ID],
    event_id:        r[c.EID],
    event_name:      r[c.ENAME],
    name:            r[c.NAME],
    phone:           r[c.PHONE],
    address:         r[c.ADDRESS],
    fee_type:        r[c.FEE_TYPE],
    fee_amount:      r[c.FEE_AMOUNT],
    fee_status:      r[c.FEE_STATUS],
    health:          r[c.HEALTH],
    religion:        r[c.RELIGION],
    skills:          r[c.SKILLS],
    emergency_name:  r[c.EMERGENCY_NAME],
    emergency_phone: r[c.EMERGENCY_PHONE],
    accommodation:   r[c.ACCOMMODATION],
    note:            r[c.NOTE],
    created_at:      r[c.CREATED],
    gender:          r[c.GENDER]       || '',
    cancelled_by:    r[c.CANCELLED_BY] || '',
    cancelled_at:    r[c.CANCELLED_AT] || ''
  })).filter(x => x.reg_id);

  if (p.event_id)   list = list.filter(x => x.event_id   === p.event_id);
  if (p.fee_status) list = list.filter(x => x.fee_status === p.fee_status);
  list.reverse();
  return { ok: true, data: list };
}

const REG_TOKEN = 'YC_EVENT_2026';

function addRegistration(p) {
  if (p.token !== REG_TOKEN) return { ok: false, error: '驗證失敗' };
  if (!p.event_id || !p.name || !p.phone) return { ok: false, error: '缺少必要欄位' };

  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    // 取鎖後讀取最新活動資料
    const found = findRow(SHEET.EVENTS, COL.EVENTS.ID, p.event_id);
    if (!found) return { ok: false, error: '找不到活動' };
    const event = found.row;
    const c = COL.EVENTS;

    // 重複報名檢查：event_id + 正規化手機 + 正規化姓名（允許同手機不同姓名代家人報名）
    const normalPhone = String(p.phone).replace(/[\s\-\(\)]/g, '');
    const normalName  = String(p.name).replace(/\s/g, '').toLowerCase();
    const existingRegs = getRows(SHEET.REGISTRATIONS);
    const cr = COL.REGISTRATIONS;
    const duplicate = existingRegs.find(r =>
      String(r[cr.EID]) === p.event_id &&
      String(r[cr.PHONE]).replace(/[\s\-\(\)]/g, '') === normalPhone &&
      String(r[cr.NAME]).replace(/\s/g, '').toLowerCase() === normalName &&
      String(r[cr.FEE_STATUS]) !== '已取消'
    );
    if (duplicate) return { ok: false, error: '此姓名與手機號碼已報名本活動' };

    // accom 在名額檢查前定義
    const accom = p.accommodation || '不住宿';

    // 住宿/不住宿分開名額檢查
    if (accom === '住宿') {
      const q = parseInt(event[c.ACCOM_QUOTA])      || 0;
      const r = parseInt(event[c.ACCOM_REGISTERED]) || 0;
      if (q > 0 && r >= q) return { ok: false, error: '住宿名額已額滿' };
    } else {
      const q = parseInt(event[c.NO_ACCOM_QUOTA])      || 0;
      const r = parseInt(event[c.NO_ACCOM_REGISTERED]) || 0;
      if (q > 0 && r >= q) return { ok: false, error: '不住宿名額已額滿' };
    }
    const capacity   = parseInt(event[c.CAPACITY])   || 0;
    const registered = parseInt(event[c.REGISTERED]) || 0;
    if (capacity > 0 && registered >= capacity) return { ok: false, error: '報名人數已額滿' };

    // 後端重算費用，不信任前端 fee_amount
    // 兩邊都有值才啟用住宿分開定價，否則 fallback 舊邏輯
    const feeAccom   = Number(event[c.FEE_ACCOM])    || 0;
    const feeNoAccom = Number(event[c.FEE_NO_ACCOM]) || 0;
    let feeType, feeAmount;
    if (feeAccom > 0 && feeNoAccom > 0 && accom === '住宿') {
      feeType = '住宿';   feeAmount = feeAccom;
    } else if (feeAccom > 0 && feeNoAccom > 0 && accom !== '住宿') {
      feeType = '不住宿'; feeAmount = feeNoAccom;
    } else {
      feeType = p.fee_type || '單次';
      feeAmount = feeType === '年繳'   ? (event[c.FEE_YEARLY] || 120000) :
                 feeType === '半年繳' ? (event[c.FEE_HALF]   || 132000) :
                                         (event[c.FEE_SINGLE] || 12000);
    }
    const id = genId('R');
    const regSheet = getSheet(SHEET.REGISTRATIONS);
    regSheet.appendRow([
      id, p.event_id, event[c.NAME],
      p.name, p.phone, p.address||'',
      feeType, feeAmount, '申請中',
      p.health||'', p.religion||'', p.skills||'',
      p.emergency_name||'', p.emergency_phone||'',
      p.accommodation||'不住宿', p.note||'', now(),
      p.gender||'', '', ''
    ]);
    const lastReg = regSheet.getLastRow();
    regSheet.getRange(lastReg, cr.PHONE+1).setNumberFormat('@').setValue(p.phone||'');
    regSheet.getRange(lastReg, cr.EMERGENCY_PHONE+1).setNumberFormat('@').setValue(p.emergency_phone||'');

    // 名額更新（已在鎖內，資料一致）
    const evSheet = getSheet(SHEET.EVENTS);
    evSheet.getRange(found.rowNum, c.REGISTERED+1).setValue(registered + 1);
    if (accom === '住宿') {
      const cur = parseInt(event[c.ACCOM_REGISTERED]) || 0;
      evSheet.getRange(found.rowNum, c.ACCOM_REGISTERED+1).setValue(cur + 1);
    } else {
      const cur = parseInt(event[c.NO_ACCOM_REGISTERED]) || 0;
      evSheet.getRange(found.rowNum, c.NO_ACCOM_REGISTERED+1).setValue(cur + 1);
    }

    sendLineMsg(`📅 新報名！\n活動：${event[c.NAME]}\n姓名：${p.name}\n電話：${p.phone}\n住宿：${accom}\n繳費：${feeType} NT$ ${Number(feeAmount).toLocaleString()}\n時間：${now()}`);
    return { ok: true, reg_id: id, fee_amount: feeAmount };
  } finally {
    lock.releaseLock();
  }
}

function updateRegistration(p) {
  if (!p.reg_id) return { ok: false, error: '缺少 reg_id' };

  // 住宿選項修改需同步名額，暫不允許（取消後重新報名）
  if (p.accommodation !== undefined)
    return { ok: false, error: '住宿選項不可修改，如需調整請取消後重新報名' };

  // ── 確認收款（有鎖路徑）──
  if (p.fee_status === '已付款') {
    const lock = _acquireLock_();
    if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
    try {
      // 取鎖後重讀，避免 TOCTOU
      const found = findRow(SHEET.REGISTRATIONS, COL.REGISTRATIONS.ID, p.reg_id);
      if (!found) return { ok: false, error: '找不到報名記錄' };
      const c         = COL.REGISTRATIONS;
      const curStatus = String(found.row[c.FEE_STATUS]);

      // 冪等：已付款直接擋
      if (curStatus === '已付款')
        return { ok: false, error: '此報名費已付款，不可重複確認' };
      // 白名單：只允許 待付款 → 已付款
      if (curStatus !== '待付款')
        return { ok: false, error: `狀態「${curStatus}」不可確認收款，僅允許待付款` };

      // EVENT_ACCOUNTS 冪等：精確比對 NOTE = '[REG:reg_id]'，不用 includes 避免 ID 誤撞
      const NOTE_MARKER   = '[REG:' + p.reg_id + ']';
      const evtRows       = getRows(SHEET.EVENT_ACCOUNTS);
      const ca            = COL.ACCOUNTS;
      const alreadyBooked = evtRows.some(r =>
        String(r[ca.NOTE]) === NOTE_MARKER && String(r[ca.STATUS]) !== '已作廢'
      );

      if (!alreadyBooked) {
        const evtSheet = getSheet(SHEET.EVENT_ACCOUNTS);
        if (evtSheet) {
          evtSheet.appendRow([
            genId('EA'), today(), '活動報名費',
            found.row[c.NAME],
            found.row[c.ENAME],
            found.row[c.FEE_AMOUNT], 0,
            p.payment || '匯款', '已收款', NOTE_MARKER, now()
          ]);
        }
      }
      // 不論帳本是否新增都執行，確保餘額正確
      refreshBalance();

      // 所有副作用完成後才寫狀態（最後一步）
      const sheet = getSheet(SHEET.REGISTRATIONS);
      sheet.getRange(found.rowNum, c.FEE_STATUS + 1).setValue('已付款');
      if (p.note !== undefined) sheet.getRange(found.rowNum, c.NOTE + 1).setValue(p.note);
      return { ok: true };
    } finally {
      lock.releaseLock();
    }
  }

  // ── 一般欄位更新（僅備註，無鎖）──
  const found = findRow(SHEET.REGISTRATIONS, COL.REGISTRATIONS.ID, p.reg_id);
  if (!found) return { ok: false, error: '找不到報名記錄' };
  const sheet = getSheet(SHEET.REGISTRATIONS);
  const c     = COL.REGISTRATIONS;
  if (p.note !== undefined) sheet.getRange(found.rowNum, c.NOTE + 1).setValue(p.note);
  return { ok: true };
}

function approveRegistration(p) {
  if (!p.reg_id) return { ok: false, error: '缺少 reg_id' };

  let result, lineMsg;
  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    const found = findRow(SHEET.REGISTRATIONS, COL.REGISTRATIONS.ID, p.reg_id);
    if (!found) { result = { ok: false, error: '找不到報名記錄' }; return result; }
    const reg   = found.row;
    const c     = COL.REGISTRATIONS;
    const stat  = String(reg[c.FEE_STATUS]);
    const sheet = getSheet(SHEET.REGISTRATIONS);

    // ── 審核通過路徑 ──
    if (p.approved === 'true') {
      // 冪等：已是待付款
      if (stat === '待付款') { result = { ok: true, idempotent: true, new_status: '待付款' }; return result; }
      if (stat !== '申請中' && stat !== '待審核') {
        result = { ok: false, error: `目前狀態「${stat}」不可審核通過` };
        return result;
      }
      if (p.note !== undefined) sheet.getRange(found.rowNum, c.NOTE + 1).setValue(p.note);
      // 先寫狀態（授權行為），組訊息；LINE 推播在 lock 釋放後執行
      sheet.getRange(found.rowNum, c.FEE_STATUS + 1).setValue('待付款');
      const feeName = reg[c.FEE_TYPE];
      const feeAmt  = Number(reg[c.FEE_AMOUNT]) || 0;
      const payLine = (p.bank || p.account || p.payee)
        ? `\n💳 繳費資訊\n銀行：${p.bank||'—'}\n帳號：${p.account||'—'}\n戶名：${p.payee||'—'}`
        : '';
      lineMsg = `✅ 審核通過（管理員通知）\n活動：${reg[c.ENAME]}\n姓名：${reg[c.NAME]}\n費用：${feeName} NT$ ${feeAmt.toLocaleString()}${payLine}\n請手動通知學員於 3 天內繳費。\n備註：${p.note||'—'}`;
      result = { ok: true, new_status: '待付款' };

    // ── 未錄取路徑 ──
    } else {
      // 冪等：已是未錄取，重新 sync 後回傳 ok
      if (stat === '未錄取') {
        _syncEventRegistrationCounts_(String(reg[c.EID]));
        result = { ok: true, idempotent: true, new_status: '未錄取' };
        return result;
      }
      if (stat !== '申請中' && stat !== '待審核') {
        result = { ok: false, error: `目前狀態「${stat}」不可設為未錄取` };
        return result;
      }
      if (p.note !== undefined) sheet.getRange(found.rowNum, c.NOTE + 1).setValue(p.note);
      // 先寫狀態，再重算名額（sync 冪等，失敗可補呼叫 adminSyncEventCounts）
      sheet.getRange(found.rowNum, c.FEE_STATUS + 1).setValue('未錄取');
      _syncEventRegistrationCounts_(String(reg[c.EID]));
      // 組訊息；LINE 推播在 lock 釋放後執行
      lineMsg = `📋 未錄取（管理員通知）\n活動：${reg[c.ENAME]}\n姓名：${reg[c.NAME]}\n原因：${p.note||'—'}`;
      result = { ok: true, new_status: '未錄取' };
    }
  } finally {
    lock.releaseLock();
  }
  if (lineMsg) sendLineMsg(lineMsg);
  return result;
}

// ── 活動名額重算（呼叫前必須持有 ScriptLock）──────────────────────────
// 排除「已取消」與「未錄取」，只寫三欄，冪等安全
function _syncEventRegistrationCounts_(eventId) {
  const evFound = findRow(SHEET.EVENTS, COL.EVENTS.ID, eventId);
  if (!evFound) return { ok: false, error: '找不到活動：' + eventId };

  const regs     = getRows(SHEET.REGISTRATIONS);
  const cr       = COL.REGISTRATIONS;
  const EXCLUDED = ['已取消', '未錄取'];
  let registered = 0, accom = 0, noAccom = 0;

  regs.forEach(r => {
    if (String(r[cr.EID]) !== String(eventId)) return;
    if (EXCLUDED.includes(String(r[cr.FEE_STATUS]))) return;
    registered++;
    if (String(r[cr.ACCOMMODATION]) === '住宿') accom++;
    else noAccom++;
  });

  const ce      = COL.EVENTS;
  const evSheet = getSheet(SHEET.EVENTS);
  evSheet.getRange(evFound.rowNum, ce.REGISTERED + 1).setValue(registered);
  // ACCOM_REGISTERED(col 15+1=16) 與 NO_ACCOM_REGISTERED(col 16+1=17) 相鄰，合併寫入
  evSheet.getRange(evFound.rowNum, ce.ACCOM_REGISTERED + 1, 1, 2)
         .setValues([[accom, noAccom]]);

  return { ok: true, registered, accom_registered: accom, no_accom_registered: noAccom };
}

// 管理員動作：獨立修復用（自行取鎖，可在 sync 失敗後補呼叫）
function adminSyncEventCounts_(p) {
  if (!p.event_id) return { ok: false, error: '缺少 event_id' };
  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    return _syncEventRegistrationCounts_(p.event_id);
  } finally {
    lock.releaseLock();
  }
}

function cancelRegistration(p) {
  if (!p.reg_id) return { ok: false, error: '缺少 reg_id' };

  let result, lineMsg;
  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    const found = findRow(SHEET.REGISTRATIONS, COL.REGISTRATIONS.ID, p.reg_id);
    if (!found) { result = { ok: false, error: '找不到報名記錄' }; return result; }
    const reg  = found.row;
    const c    = COL.REGISTRATIONS;
    const stat = String(reg[c.FEE_STATUS]);

    // 已取消：重新 sync（修復可能殘留的名額錯誤），冪等回傳 ok
    if (stat === '已取消') {
      _syncEventRegistrationCounts_(String(reg[c.EID]));
      result = { ok: true, idempotent: true };
      return result;
    }
    // 已付款/已完成：須走退款流程
    if (stat === '已付款' || stat === '已完成') {
      result = { ok: false, error: `狀態「${stat}」不可直接取消，請先辦理退款流程` };
      return result;
    }
    // 允許：申請中、待付款、待審核、未錄取

    const sheet = getSheet(SHEET.REGISTRATIONS);
    const rn = found.rowNum;
    // 先寫狀態（授權行為）
    sheet.getRange(rn, c.FEE_STATUS + 1).setValue('已取消');
    sheet.getRange(rn, c.CANCELLED_BY + 1).setValue(p.cancelled_by || '管理員');
    sheet.getRange(rn, c.CANCELLED_AT + 1).setValue(now());
    if (p.note !== undefined) sheet.getRange(rn, c.NOTE + 1).setValue(p.note);

    // 重算名額（冪等，已取消與未錄取自動排除；sync 失敗可補呼叫 adminSyncEventCounts）
    _syncEventRegistrationCounts_(String(reg[c.EID]));

    // 組訊息，lock 釋放後再送出（避免 LINE 網路請求拖住全域 lock）
    lineMsg = `🚫 報名取消（管理員通知）\n活動：${reg[c.ENAME]}\n姓名：${reg[c.NAME]}\n原因：${p.note||'—'}\n時間：${now()}`;
    result = { ok: true };
  } finally {
    lock.releaseLock();
  }
  if (lineMsg) sendLineMsg(lineMsg);
  return result;
}

function refundCancelRegistration(p) {
  if (!p.reg_id) return { ok: false, error: '缺少 reg_id' };

  let result, lineMsg;
  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    const found = findRow(SHEET.REGISTRATIONS, COL.REGISTRATIONS.ID, p.reg_id);
    if (!found) { result = { ok: false, error: '找不到報名記錄' }; return result; }
    const reg  = found.row;
    const c    = COL.REGISTRATIONS;
    const stat = String(reg[c.FEE_STATUS]);

    if (stat === '已取消') {
      _syncEventRegistrationCounts_(String(reg[c.EID]));
      result = { ok: true, idempotent: true, new_status: '已取消' };
      return result;
    }
    if (stat !== '已付款') {
      result = { ok: false, error: `狀態「${stat}」不可走取消退款，僅允許已付款` };
      return result;
    }

    const refundAmount = Number(p.refund_amount) || Number(reg[c.FEE_AMOUNT]) || 0;
    if (refundAmount <= 0) {
      result = { ok: false, error: '退款金額必須大於 0' };
      return result;
    }

    const marker  = '[REFUND:' + p.reg_id + ']';
    const evtRows = getRows(SHEET.EVENT_ACCOUNTS);
    const ca      = COL.ACCOUNTS;
    const alreadyRefunded = evtRows.some(r =>
      String(r[ca.NOTE]).indexOf(marker) >= 0 && String(r[ca.STATUS]) !== '已作廢'
    );

    if (!alreadyRefunded) {
      const evtSheet = getSheet(SHEET.EVENT_ACCOUNTS);
      evtSheet.appendRow([
        genId('EA'), today(), '活動退款',
        reg[c.NAME],
        reg[c.ENAME] + ' / 報名取消退款',
        0, refundAmount,
        p.payment || '匯款', '已付款',
        marker + ' ' + (p.note || '已付款取消退款'),
        now()
      ]);
    }

    const sheet = getSheet(SHEET.REGISTRATIONS);
    const cancelNote = p.note || ('已付款取消，人工退款完成；活動帳本 ' + marker);
    sheet.getRange(found.rowNum, c.FEE_STATUS + 1).setValue('已取消');
    sheet.getRange(found.rowNum, c.CANCELLED_BY + 1).setValue(p.cancelled_by || '管理員');
    sheet.getRange(found.rowNum, c.CANCELLED_AT + 1).setValue(now());
    sheet.getRange(found.rowNum, c.NOTE + 1).setValue(cancelNote);

    _syncEventRegistrationCounts_(String(reg[c.EID]));
    refreshBalance();

    lineMsg = `↩️ 活動取消退款\n活動：${reg[c.ENAME]}\n姓名：${reg[c.NAME]}\n退款：NT$ ${refundAmount.toLocaleString()}\n報名編號：${p.reg_id}\n時間：${now()}`;
    result = { ok: true, new_status: '已取消', refund_amount: refundAmount };
  } finally {
    lock.releaseLock();
  }
  if (lineMsg) sendLineMsg(lineMsg);
  return result;
}

// ================================================================
// 會員管理
// ================================================================
function getMember(p) {
  if (p.all === 'true') {
    if (!validateSession_(p.session_token)) return { ok: false, error: '未授權', auth_required: true };
    const rows = getRows(SHEET.MEMBERS);
    const c = COL.MEMBERS;
    return {
      ok: true,
      data: rows.map(r => ({
        member_id:        r[c.ID],
        name:             r[c.NAME],
        phone:            r[c.PHONE],
        birthday:         r[c.BIRTHDAY],
        points:           Number(r[c.POINTS])       || 0,
        total_spent:      Number(r[c.TOTAL_SPENT])  || 0,
        joined_at:        r[c.JOINED],
        note:             r[c.NOTE],
        member_level:     r[c.MEMBER_LEVEL]     || '一般',
        annual_spend:     Number(r[c.ANNUAL_SPEND]) || 0,
        level_updated_at: r[c.LEVEL_UPDATED_AT] || ''
      })).filter(x => x.member_id)
    };
  }
  if (!p.phone) return { ok: false, error: '請輸入手機號碼' };
  const rows = getRows(SHEET.MEMBERS);
  const c = COL.MEMBERS;
  const member = rows.find(r => String(r[c.PHONE]) === String(p.phone));
  if (!member) return { ok: false, error: '查無會員資料' };
  const orders = getRows(SHEET.ORDERS);
  const co = COL.ORDERS;
  const myOrders = orders.filter(r => String(r[co.PHONE]) === String(p.phone))
    .map(r => ({ order_id:r[co.ID], total:r[co.TOTAL], status:r[co.STATUS], created_at:r[co.CREATED] }))
    .reverse().slice(0, 10);
  const birthday = member[c.BIRTHDAY] ? new Date(member[c.BIRTHDAY]) : null;
  return {
    ok: true,
    data: {
      member_id:        member[c.ID],
      name:             member[c.NAME],
      phone:            member[c.PHONE],
      birthday:         member[c.BIRTHDAY],
      points:           Number(member[c.POINTS])      || 0,
      total_spent:      Number(member[c.TOTAL_SPENT]) || 0,
      joined_at:        member[c.JOINED],
      note:             member[c.NOTE],
      member_level:     member[c.MEMBER_LEVEL]    || '一般',
      annual_spend:     Number(member[c.ANNUAL_SPEND]) || 0,
      level_updated_at: member[c.LEVEL_UPDATED_AT] || '',
      is_birth_month:   birthday && birthday.getMonth() === new Date().getMonth(),
      recent_orders:    myOrders
    }
  };
}

function registerMember(p) {
  if (!p.name || !p.phone) return { ok: false, error: '請填寫姓名和手機號碼' };
  const rows = getRows(SHEET.MEMBERS);
  const c = COL.MEMBERS;
  if (rows.find(r => String(r[c.PHONE]) === String(p.phone))) {
    return { ok: false, error: '此手機號碼已是會員' };
  }
  const id = 'M' + Date.now();
  const memSheet = getSheet(SHEET.MEMBERS);
  memSheet.appendRow([id, p.name, p.phone, p.birthday||'', 0, 0, now(), p.note||'']);
  memSheet.getRange(memSheet.getLastRow(), c.PHONE+1).setNumberFormat('@').setValue(p.phone||'');
  return { ok: true, member_id: id };
}

function updateMember(p) {
  if (!p.phone) return { ok: false, error: '缺少手機號碼' };
  const rows = getRows(SHEET.MEMBERS);
  const c = COL.MEMBERS;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][c.PHONE]) === String(p.phone)) {
      const sheet = getSheet(SHEET.MEMBERS);
      const rn = DATA_ROW + i;
      if (p.birthday !== undefined) sheet.getRange(rn, c.BIRTHDAY+1).setValue(p.birthday);
      if (p.note     !== undefined) sheet.getRange(rn, c.NOTE+1).setValue(p.note);
      return { ok: true };
    }
  }
  return { ok: false, error: '找不到會員' };
}

function addPoints(p) {
  if (!p.phone || !p.points) return { ok: false, error: '缺少必要欄位' };
  const rows = getRows(SHEET.MEMBERS);
  const c = COL.MEMBERS;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][c.PHONE]) === String(p.phone)) {
      const sheet = getSheet(SHEET.MEMBERS);
      const rn     = DATA_ROW + i;
      const cur    = Number(rows[i][c.POINTS]) || 0;
      const spent  = Number(rows[i][c.TOTAL_SPENT]) || 0;
      const addPts = Number(p.points);
      const newBal = cur + addPts;
      sheet.getRange(rn, c.POINTS+1).setValue(newBal);
      sheet.getRange(rn, c.TOTAL_SPENT+1).setValue(spent + Number(p.amount || 0));
      // 寫點數記錄（9 欄，最後一欄 ref_id 留空）
      const logSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET.POINTS_LOG);
      if (logSheet) {
        logSheet.appendRow(['PT'+Date.now(), p.phone, rows[i][c.NAME],
          addPts > 0 ? '加點' : '扣點', addPts, newBal, p.note||'', now(), '']);
      }
      return { ok: true, new_points: newBal };
    }
  }
  return { ok: false, error: '找不到會員' };
}

// 內部版：全列原子寫入（POINTS + TOTAL_SPENT + LAST_OP_ID 一次 setValues），呼叫前必須持有 lock
function addPoints_(p) {
  const rows = getRows(SHEET.MEMBERS);
  const c    = COL.MEMBERS;
  const i    = rows.findIndex(r => String(r[c.PHONE]) === String(p.phone));
  if (i < 0) return { ok:false, error:'找不到會員' };
  const sheet  = getSheet(SHEET.MEMBERS);
  const rn     = DATA_ROW + i;
  const cur    = Number(rows[i][c.POINTS]) || 0;
  const newBal = cur + Number(p.points);
  const rowData = rows[i].slice();
  rowData[c.POINTS]      = newBal;
  rowData[c.TOTAL_SPENT] = (Number(rows[i][c.TOTAL_SPENT]) || 0) + Number(p.amount || 0);
  if (p.refId) rowData[c.LAST_OP_ID] = p.refId;
  sheet.getRange(rn, 1, 1, rowData.length).setValues([rowData]);
  getSheet(SHEET.POINTS_LOG).appendRow([
    genId('PL'), p.phone, rows[i][c.NAME],
    Number(p.points) > 0 ? '加點' : '扣點',
    p.points, newBal, p.note || '', now(), p.refId || ''
  ]);
  return { ok:true, new_points:newBal };
}

// ================================================================
// 點數記錄
// ================================================================
function getPointsLog(p) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET.POINTS_LOG);
  if (!sheet) return { ok: true, data: [] };
  const last = sheet.getLastRow();
  if (last < DATA_ROW) return { ok: true, data: [] };
  const c = COL.POINTS_LOG;
  let list = sheet.getRange(DATA_ROW, 1, last - DATA_ROW + 1, 9).getValues()
    .map(r => ({
      log_id:       r[c.ID],
      member_phone: r[c.PHONE],
      member_name:  r[c.NAME],
      action:       r[c.ACTION],
      points:       r[c.POINTS],
      balance:      r[c.BALANCE],
      note:         r[c.NOTE],
      created_at:   r[c.CREATED]
    })).filter(x => x.log_id);
  if (p.phone) list = list.filter(x => String(x.member_phone) === String(p.phone));
  list.reverse();
  return { ok: true, data: list.slice(0, Number(p.limit) || 100) };
}

// ================================================================
// 確認收款
// ================================================================
function confirmOrderPayment(p) {
  if (!p.order_id) return { ok: false, error: '缺少 order_id' };
  const found = findRow(SHEET.ORDERS, COL.ORDERS.ID, p.order_id);
  if (!found) return { ok: false, error: '找不到訂單' };
  const order = found.row;
  const c = COL.ORDERS;

  // 白名單：只允許「已確認」或「已出貨」狀態確認付款
  const curStatus = String(order[c.STATUS]);
  const ALLOW_PAYMENT = ['已確認', '已出貨'];
  if (!ALLOW_PAYMENT.includes(curStatus)) {
    if (curStatus === '已付款' || curStatus === '已完成') {
      return { ok: false, error: '此訂單已付款，不可重複確認' };
    }
    if (curStatus === '待確認') {
      return { ok: false, error: '請先確認訂單並扣庫存後，再確認付款' };
    }
    if (curStatus === '已取消') {
      return { ok: false, error: '已取消訂單不可確認付款' };
    }
    return { ok: false, error: '訂單狀態不可確認付款：' + curStatus };
  }

  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    const amount  = Number(p.received_amount) || Number(order[c.TOTAL]) || 0;
    const payDate = p.payment_date || today();

    // 更新訂單狀態
    const sheet = getSheet(SHEET.ORDERS);
    sheet.getRange(found.rowNum, c.STATUS+1).setValue('已付款');

    // 待收款 → 已收款（找到就更新，沒找到才新增）
    const accRows = getRows(SHEET.ACCOUNTS);
    const ca = COL.ACCOUNTS;
    const pendingIdx = accRows.findIndex(r =>
      String(r[ca.ITEMS]).includes(p.order_id) && String(r[ca.STATUS]) === '待收款'
    );
    if (pendingIdx >= 0) {
      const accSheet = getSheet(SHEET.ACCOUNTS);
      const accRn = DATA_ROW + pendingIdx;
      accSheet.getRange(accRn, ca.STATUS+1).setValue('已收款');
      accSheet.getRange(accRn, ca.INCOME+1).setValue(amount);
      accSheet.getRange(accRn, ca.DATE+1).setValue(payDate);
    } else {
      addAccount({
        date: payDate, type: '銷售收款',
        partner: order[c.CNAME],
        items: '訂單 ' + p.order_id,
        income: amount, expense: '',
        payment: order[c.PAYMENT] || 'ATM轉帳',
        status: '已收款', note: ''
      });
    }

    // 加點數：依商品小計計算（不含運費），每 N 元得 1 點
    let pointsAdded = 0;
    if (p.member_phone && amount > 0) {
      const settings    = getSettingsMap_();
      const earnRate    = Number(settings.points_earn_rate) || 100;
      const subtotalAmt = Number(order[c.SUBTOTAL]) || amount;
      pointsAdded = Math.floor(subtotalAmt / earnRate);
      if (pointsAdded > 0) {
        try {
          addPoints_({ phone: p.member_phone, points: pointsAdded,
                       amount: subtotalAmt, note: '訂單消費：' + p.order_id });
        } catch(e) {}
      }
    }

    refreshBalance();
    sendLineMsg(`💰 收款確認\n客人：${order[c.CNAME]}\n實收：NT$ ${amount.toLocaleString()}\n訂單：${p.order_id}${pointsAdded>0?'\n加點：'+pointsAdded+' 點':''}\n時間：${now()}`);
    return { ok: true, points_added: pointsAdded };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// 退貨退款
// ================================================================

// ── 退貨流程輔助函式（內部用，呼叫前須持有 lock 或確認單執行緒） ──

function findReturnStep_(returnId, step) {
  const rows = getRows(SHEET.RETURN_STEPS);
  const c    = COL.RETURN_STEPS;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][c.RETURN_ID]) === String(returnId) &&
        String(rows[i][c.STEP])      === String(step)) {
      return { row: rows[i], rowNum: DATA_ROW + i };
    }
  }
  return null;
}

function findStockLogByRefId_(refId) {
  if (!refId) return null;
  return findRow(SHEET.STOCK_LOG, COL.STOCK_LOG.REF_ID, refId);
}

function findPointsLogByRefId_(refId) {
  if (!refId) return null;
  return findRow(SHEET.POINTS_LOG, COL.POINTS_LOG.REF_ID, refId);
}

function _getOrCreateStep_(returnId, step, beforeVal, expectedVal, newOpId) {
  const existing = findReturnStep_(returnId, step);
  if (existing) return existing;
  const sheet = getSheet(SHEET.RETURN_STEPS);
  sheet.appendRow([
    genId('RS'), returnId, step, 'pending', newOpId,
    beforeVal, expectedVal, now(), '', now()
  ]);
  const rowNum = sheet.getLastRow();
  return { rowNum, row: [null, returnId, step, 'pending', newOpId, beforeVal, expectedVal, now(), '', now()] };
}

function _updateReturnStepRow(rowNum, status, refId, error) {
  const sheet = getSheet(SHEET.RETURN_STEPS);
  const c     = COL.RETURN_STEPS;
  sheet.getRange(rowNum, c.STATUS + 1).setValue(status);
  if (refId !== undefined) {
    sheet.getRange(rowNum, c.REF_ID + 1).setValue(refId === null ? '' : refId);
  }
  sheet.getRange(rowNum, c.UPDATED_AT + 1, 1, 2).setValues([[now(), error || '']]);
}

function _executeInventoryStep_(ret, returnId) {
  const cs  = COL.RETURN_STEPS;
  const productId = String(ret.row[COL.RETURNS.PRODUCT_ID]);
  if (!productId) return { ok: true, skipped: true };

  const qty    = parseInt(ret.row[COL.RETURNS.QTY]) || 0;
  const invRow = findRow(SHEET.INVENTORY, COL.INVENTORY.ID, productId);
  const curQty = invRow ? parseInt(invRow.row[COL.INVENTORY.QTY]) || 0 : 0;
  const opId   = genId('OP');
  const step   = _getOrCreateStep_(returnId, 'inventory', curQty, curQty + qty, opId);
  const storedOpId = String(step.row[cs.REF_ID]);
  const stepStatus = String(step.row[cs.STATUS]);

  if (stepStatus === 'done') return { ok: true };
  if (stepStatus === 'needs_review') return { ok: false, error: 'inventory step needs_review' };

  // 路徑 A：stock_log 已有 ref_id 記錄
  if (findStockLogByRefId_(storedOpId)) {
    _updateReturnStepRow(step.rowNum, 'done', storedOpId, '');
    return { ok: true };
  }
  // 路徑 B：INVENTORY.LAST_OP_ID 已等於 storedOpId（log 寫入失敗）
  const invCheck = findRow(SHEET.INVENTORY, COL.INVENTORY.ID, productId);
  if (invCheck && String(invCheck.row[COL.INVENTORY.LAST_OP_ID]) === storedOpId) {
    getSheet(SHEET.STOCK_LOG).appendRow([
      genId('SL'), productId, invCheck.row[COL.INVENTORY.NAME], '退貨入庫',
      qty, '', ret.row[COL.RETURNS.NAME], '退貨：' + returnId, now(), storedOpId
    ]);
    _updateReturnStepRow(step.rowNum, 'done', storedOpId, '');
    return { ok: true };
  }
  // 路徑 C：當前數量 === before_value → 尚未執行，安全重試
  const beforeVal = Number(step.row[cs.BEFORE_VALUE]);
  if (invCheck && (parseInt(invCheck.row[COL.INVENTORY.QTY]) || 0) === beforeVal) {
    const qr = updateQty_(productId, qty, 'in', storedOpId);
    if (!qr.ok) { _updateReturnStepRow(step.rowNum, 'needs_review', null, qr.error); return { ok: false, error: qr.error }; }
    getSheet(SHEET.STOCK_LOG).appendRow([
      genId('SL'), productId, qr.name, '退貨入庫',
      qty, '', ret.row[COL.RETURNS.NAME], '退貨：' + returnId, now(), storedOpId
    ]);
    _updateReturnStepRow(step.rowNum, 'done', storedOpId, '');
    return { ok: true };
  }
  // 路徑 D：需人工確認
  _updateReturnStepRow(step.rowNum, 'needs_review', null, '庫存數量與 before_value 不符，需人工確認');
  return { ok: false, error: 'inventory step needs_review：庫存數量異常' };
}

function _executeAccountStep_(ret, returnId) {
  const cs          = COL.RETURN_STEPS;
  const refundAmt   = Number(ret.row[COL.RETURNS.REFUND_AMOUNT]) || 0;
  const opId        = genId('OP');
  const step        = _getOrCreateStep_(returnId, 'account', 0, refundAmt, opId);
  const storedOpId  = String(step.row[cs.REF_ID]);
  const stepStatus  = String(step.row[cs.STATUS]);

  if (stepStatus === 'done') return { ok: true };
  if (stepStatus === 'needs_review') return { ok: false, error: 'account step needs_review' };

  // 冪等：addAccount 以 storedOpId 為 id，若已存在則自動回傳 ok
  const ar = addAccount({
    id: storedOpId,
    date: today(), type: '退款支出',
    partner: String(ret.row[COL.RETURNS.NAME]),
    items: String(ret.row[COL.RETURNS.PRODUCT_NAME]) + ' x' + String(ret.row[COL.RETURNS.QTY]) + ' 退貨',
    income: '', expense: refundAmt,
    payment: String(ret.row[COL.RETURNS.PAYMENT]) || '現金',
    status: '待退款',
    note: String(ret.row[COL.RETURNS.REASON]) || ''
  });
  if (!ar.ok) { _updateReturnStepRow(step.rowNum, 'needs_review', null, ar.error); return { ok: false, error: ar.error }; }
  _updateReturnStepRow(step.rowNum, 'done', storedOpId, '');
  return { ok: true };
}

function _executePointsStep_(ret, returnId) {
  const cs         = COL.RETURN_STEPS;
  const pointsDed  = Number(ret.row[COL.RETURNS.POINTS_DEDUCTED]) || 0;
  const phone      = String(ret.row[COL.RETURNS.PHONE]);

  if (pointsDed <= 0 || !phone) {
    // 沒有點數需扣，直接標記 done
    const step = _getOrCreateStep_(returnId, 'points', 0, 0, genId('OP'));
    if (String(step.row[cs.STATUS]) !== 'done') _updateReturnStepRow(step.rowNum, 'done', '', '');
    getSheet(SHEET.RETURNS).getRange(ret.rowNum, COL.RETURNS.ACTUAL_POINTS_DEDUCTED + 1, 1, 2)
      .setValues([[0, 0]]);
    return { ok: true };
  }

  const existingPtStep = findReturnStep_(returnId, 'points');
  let ptStep, ptOpId, frozenBefore, frozenExpect, frozenDeduct, frozenShortfall;

  if (existingPtStep) {
    ptStep         = existingPtStep;
    ptOpId         = String(ptStep.row[cs.REF_ID]);
    frozenBefore   = Number(ptStep.row[cs.BEFORE_VALUE]);
    frozenExpect   = Number(ptStep.row[cs.EXPECTED_AFTER]);
    frozenDeduct   = frozenBefore - frozenExpect;
    frozenShortfall = pointsDed - frozenDeduct;
  } else {
    const memRow    = findRow(SHEET.MEMBERS, COL.MEMBERS.PHONE, phone);
    const currentPts = memRow ? Number(memRow.row[COL.MEMBERS.POINTS]) || 0 : 0;
    frozenBefore    = currentPts;
    frozenDeduct    = Math.min(pointsDed, currentPts);
    frozenExpect    = currentPts - frozenDeduct;
    frozenShortfall = pointsDed - frozenDeduct;
    ptOpId          = genId('OP');
    ptStep          = _getOrCreateStep_(returnId, 'points', frozenBefore, frozenExpect, ptOpId);
    ptOpId          = String(ptStep.row[cs.REF_ID]);
  }

  // 寫入凍結值至 RETURNS（冪等）
  getSheet(SHEET.RETURNS).getRange(ret.rowNum, COL.RETURNS.ACTUAL_POINTS_DEDUCTED + 1, 1, 2)
    .setValues([[frozenDeduct, frozenShortfall]]);

  const stepStatus = String(ptStep.row[cs.STATUS]);
  if (stepStatus === 'done') return { ok: true };
  if (stepStatus === 'needs_review') return { ok: false, error: 'points step needs_review' };

  if (frozenDeduct <= 0) {
    _updateReturnStepRow(ptStep.rowNum, 'done', ptOpId, '');
    return { ok: true };
  }

  // 路徑 A：points_log 已有 ref_id
  if (findPointsLogByRefId_(ptOpId)) {
    _updateReturnStepRow(ptStep.rowNum, 'done', ptOpId, '');
    return { ok: true };
  }
  // 路徑 B：MEMBERS.LAST_OP_ID === ptOpId
  const memCheck = findRow(SHEET.MEMBERS, COL.MEMBERS.PHONE, phone);
  if (memCheck && String(memCheck.row[COL.MEMBERS.LAST_OP_ID]) === ptOpId) {
    getSheet(SHEET.POINTS_LOG).appendRow([
      genId('PL'), phone, memCheck.row[COL.MEMBERS.NAME], '扣點',
      -frozenDeduct, frozenExpect, '退貨扣點（補記錄）：' + returnId, now(), ptOpId
    ]);
    _updateReturnStepRow(ptStep.rowNum, 'done', ptOpId, '');
    return { ok: true };
  }
  // 路徑 C：當前點數 === frozenBefore
  if (memCheck && (Number(memCheck.row[COL.MEMBERS.POINTS]) || 0) === frozenBefore) {
    const pr = addPoints_({ phone, points: -frozenDeduct, refId: ptOpId,
                             note: '退貨扣點：' + String(ret.row[COL.RETURNS.PRODUCT_NAME]) });
    if (!pr.ok) { _updateReturnStepRow(ptStep.rowNum, 'needs_review', null, pr.error); return { ok: false, error: pr.error }; }
    _updateReturnStepRow(ptStep.rowNum, 'done', ptOpId, '');
    return { ok: true };
  }
  // 路徑 D
  _updateReturnStepRow(ptStep.rowNum, 'needs_review', null, '點數與 before_value 不符，需人工確認');
  return { ok: false, error: 'points step needs_review：點數異常' };
}

function addReturn(p) {
  if (!p.name || !p.product_name || !p.qty) return { ok: false, error: '缺少必要欄位' };
  if (isReturnMaintenanceOn_()) return { ok: false, error: '退貨功能維護中，請稍後再試' };

  const id             = genId('RT');
  const qty            = parseInt(p.qty);
  const refundAmount   = Number(p.refund_amount) || 0;
  const pointsDeducted = parseInt(p.points_deducted) || 0;

  // 只寫退貨記錄（status=待處理），不立即執行庫存/帳本/點數
  getSheet(SHEET.RETURNS).appendRow([
    id, p.order_id||'', p.phone||'', p.name,
    p.product_id||'', p.product_name,
    qty, refundAmount, p.payment||'現金',
    p.reason||'', pointsDeducted,
    '待處理', p.note||'', now(), '', ''
  ]);

  sendLineMsg(`↩️ 退貨申請\n客人：${p.name}${p.phone?' · '+p.phone:''}\n商品：${p.product_name} × ${qty}\n退款：NT$ ${refundAmount.toLocaleString()}\n原因：${p.reason||'—'}\n時間：${now()}`);
  return { ok: true, return_id: id };
}

function getReturns(p) {
  const rows = getRows(SHEET.RETURNS);
  const c = COL.RETURNS;
  let list = rows.map(r => ({
    return_id:              r[c.ID],
    order_id:               r[c.ORDER_ID],
    phone:                  r[c.PHONE],
    name:                   r[c.NAME],
    product_id:             r[c.PRODUCT_ID],
    product_name:           r[c.PRODUCT_NAME],
    qty:                    r[c.QTY],
    refund_amount:          r[c.REFUND_AMOUNT],
    payment:                r[c.PAYMENT],
    reason:                 r[c.REASON],
    points_deducted:        r[c.POINTS_DEDUCTED],
    status:                 r[c.STATUS],
    note:                   r[c.NOTE],
    created_at:             r[c.CREATED],
    actual_points_deducted: r[c.ACTUAL_POINTS_DEDUCTED] || '',
    points_shortfall:       r[c.POINTS_SHORTFALL] || ''
  })).filter(x => x.return_id);
  if (p.status) list = list.filter(x => x.status === p.status);
  list.reverse();
  return { ok: true, data: list };
}

function updateReturn(p) {
  if (!p.return_id) return { ok: false, error: '缺少 return_id' };
  if (isReturnMaintenanceOn_()) return { ok: false, error: '退貨功能維護中，請稍後再試' };

  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };

  try {
    const found = findRow(SHEET.RETURNS, COL.RETURNS.ID, p.return_id);
    if (!found) return { ok: false, error: '找不到退貨記錄' };

    const sheet     = getSheet(SHEET.RETURNS);
    const c         = COL.RETURNS;
    const rn        = found.rowNum;
    const returnId  = p.return_id;
    const curStatus = String(found.row[c.STATUS]);

    // 只更新備註（不觸發流程）
    if (p.note !== undefined) sheet.getRange(rn, c.NOTE+1).setValue(p.note);

    // 狀態為「確認退貨」→ 執行三步驟流程
    if (p.status === '確認退貨') {
      if (curStatus === '已完成') return { ok: true, message: '已完成，略過' };

      const steps = [];
      const invResult  = _executeInventoryStep_(found, returnId);
      steps.push({ step:'inventory', ok: invResult.ok, error: invResult.error });
      if (!invResult.ok && !invResult.skipped) {
        return { ok: false, error: '庫存步驟失敗：' + invResult.error, steps };
      }

      const accResult = _executeAccountStep_(found, returnId);
      steps.push({ step:'account', ok: accResult.ok, error: accResult.error });
      if (!accResult.ok) {
        return { ok: false, error: '帳本步驟失敗：' + accResult.error, steps };
      }

      const ptResult  = _executePointsStep_(found, returnId);
      steps.push({ step:'points', ok: ptResult.ok, error: ptResult.error });
      if (!ptResult.ok) {
        return { ok: false, error: '點數步驟失敗：' + ptResult.error, steps };
      }

      sheet.getRange(rn, c.STATUS+1).setValue('已完成');
      refreshBalance();
      sendLineMsg(`✅ 退貨完成\n退貨ID：${returnId}\n客人：${found.row[c.NAME]}\n商品：${found.row[c.PRODUCT_NAME]}\n時間：${now()}`);
      return { ok: true, steps };
    }

    // 一般狀態更新（非確認退貨）
    if (p.status !== undefined) sheet.getRange(rn, c.STATUS+1).setValue(p.status);
    if (p.status === '已退款') refreshBalance();
    return { ok: true };

  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// 身份驗證
// ================================================================
function validateSession_(token) {
  if (!token) return false;
  try {
    return !!CacheService.getScriptCache().get('session:' + token);
  } catch(e) {
    return false;
  }
}

function loginAdmin(p) {
  var props = PropertiesService.getScriptProperties();
  var correctPwd = props.getProperty('ADMIN_PASSWORD') || '';
  if (!correctPwd) return { ok: false, error: '系統尚未設定管理密碼，請聯繫管理員' };
  if (!p.password || p.password !== correctPwd) {
    return { ok: false, error: '密碼錯誤，請重試' };
  }
  var token = Utilities.getUuid();
  try {
    CacheService.getScriptCache().put('session:' + token, '1', 21600);
  } catch(e) {
    return { ok: false, error: '建立 session 失敗：' + e.toString() };
  }
  return { ok: true, token: token, expires_in: 21600 };
}

function loginEventAdmin(p) {
  var props = PropertiesService.getScriptProperties();
  var correctPwd = props.getProperty('EVENT_ADMIN_PASSWORD') || '';
  if (!correctPwd) return { ok: false, error: '系統尚未設定活動後台密碼，請聯繫管理員' };
  if (!p.password || p.password !== correctPwd) {
    return { ok: false, error: '密碼錯誤，請重試' };
  }
  var token = Utilities.getUuid();
  try {
    CacheService.getScriptCache().put('session:' + token, '1', 21600);
  } catch(e) {
    return { ok: false, error: '建立 session 失敗：' + e.toString() };
  }
  return { ok: true, token: token, expires_in: 21600 };
}

// ================================================================
// 系統設定管理
// ================================================================
function getSettings() {
  const rows = getRows(SHEET.SETTINGS);
  const c    = COL.SETTINGS;
  const map  = {};
  rows.forEach(r => { if (r[c.KEY]) map[r[c.KEY]] = { value: r[c.VALUE], desc: r[c.DESC], updated: r[c.UPDATED] }; });
  // 補上未在表中的預設值
  Object.entries(SETTING_DEFAULTS).forEach(([k, v]) => {
    if (!map[k]) map[k] = { value: v.value, desc: v.desc, updated: '' };
  });
  return { ok: true, data: map };
}

function updateSetting(p) {
  if (!p.key || p.value === undefined) return { ok: false, error: '缺少 key 或 value' };
  const sheet = getSheet(SHEET.SETTINGS);
  const rows  = getRows(SHEET.SETTINGS);
  const c     = COL.SETTINGS;
  const idx   = rows.findIndex(r => String(r[c.KEY]) === String(p.key));
  if (idx >= 0) {
    const rn = DATA_ROW + idx;
    sheet.getRange(rn, c.VALUE+1).setValue(p.value);
    sheet.getRange(rn, c.UPDATED+1).setValue(now());
  } else {
    const desc = (SETTING_DEFAULTS[p.key] || {}).desc || '';
    sheet.appendRow([p.key, p.value, desc, now()]);
  }
  return { ok: true };
}

// ================================================================
// 報表功能
// ================================================================
function getMonthlyReport(p) {
  const month = p.month || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  const orders = getRows(SHEET.ORDERS);
  const c = COL.ORDERS;

  let revenue = 0, orderCount = 0, cancelCount = 0, pendingCount = 0;
  const productSales = {};
  orders.forEach(r => {
    if (!r[c.ID] || !String(r[c.CREATED]).startsWith(month)) return;
    if (r[c.STATUS] === '已取消') { cancelCount++; return; }
    if (!['已付款','已完成'].includes(String(r[c.STATUS]))) { pendingCount++; return; }
    orderCount++;
    revenue += Number(r[c.TOTAL]) || 0;
    try {
      JSON.parse(r[c.ITEMS] || '[]').forEach(it => {
        if (!productSales[it.product_id]) productSales[it.product_id] = { name: it.name, qty: 0, revenue: 0 };
        productSales[it.product_id].qty     += Number(it.qty)   || 0;
        productSales[it.product_id].revenue += (Number(it.price)||0) * (Number(it.qty)||0);
      });
    } catch(e) {}
  });

  // 進貨成本
  const accounts = getRows(SHEET.ACCOUNTS);
  const ca = COL.ACCOUNTS;
  let cost = 0;
  accounts.forEach(r => {
    if (String(r[ca.TYPE]) === '進貨付款' && String(r[ca.DATE]).startsWith(month)) {
      cost += Number(r[ca.EXPENSE]) || 0;
    }
  });

  const topProducts = Object.values(productSales).sort((a,b) => b.revenue - a.revenue).slice(0,10);
  return { ok: true, data: { month, order_count: orderCount, pending_count: pendingCount, cancel_count: cancelCount, revenue, cost, profit: revenue - cost, top_products: topProducts } };
}

function getSalesRanking(p) {
  const days   = parseInt(p.days) || 30;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutStr = Utilities.formatDate(cutoff, 'Asia/Taipei', 'yyyy-MM-dd');
  const orders = getRows(SHEET.ORDERS);
  const c = COL.ORDERS;
  const rank = {};
  orders.forEach(r => {
    if (!r[c.ID] || String(r[c.STATUS]) === '已取消') return;
    if (String(r[c.CREATED]).slice(0,10) < cutStr) return;
    try {
      JSON.parse(r[c.ITEMS] || '[]').forEach(it => {
        if (!rank[it.product_id]) rank[it.product_id] = { name: it.name||it.product_id, qty: 0, revenue: 0 };
        rank[it.product_id].qty     += Number(it.qty) || 0;
        rank[it.product_id].revenue += (Number(it.price)||0) * (Number(it.qty)||0);
      });
    } catch(e) {}
  });
  const list = Object.entries(rank).map(([id, v]) => ({ product_id: id, ...v }))
                     .sort((a,b) => b.qty - a.qty).slice(0, parseInt(p.limit)||20);
  return { ok: true, data: list, days };
}

function getInventoryHealth(p) {
  const inv  = getRows(SHEET.INVENTORY);
  const prod = getRows(SHEET.PRODUCTS);
  const ci   = COL.INVENTORY;
  const cp   = COL.PRODUCTS;
  const prodMap = {};
  prod.forEach(r => { prodMap[r[cp.ID]] = r; });

  const result = { ok: true, low_stock: [], zero_stock: [], healthy: [], total: 0, total_value: 0 };
  inv.forEach(r => {
    if (!r[ci.ID]) return;
    const qty  = Number(r[ci.QTY]) || 0;
    const pr   = prodMap[r[ci.ID]] || [];
    const thr  = Number(pr[cp.THRESHOLD]) || 10;
    const cost = Number(pr[cp.COST]) || 0;
    result.total++;
    result.total_value += qty * cost;
    const item = { product_id: r[ci.ID], name: r[ci.NAME], qty, threshold: thr };
    if (qty === 0) result.zero_stock.push(item);
    else if (qty <= thr) result.low_stock.push(item);
    else result.healthy.push(item);
  });
  return result;
}

function getMemberStats() {
  const rows    = getRows(SHEET.MEMBERS);
  const c       = COL.MEMBERS;
  const total   = rows.filter(r => r[c.ID]).length;
  const active  = rows.filter(r => r[c.ID] && (Number(r[c.TOTAL_SPENT])||0) > 0).length;
  const pts     = rows.reduce((s, r) => s + (Number(r[c.POINTS])||0), 0);
  const spent   = rows.reduce((s, r) => s + (Number(r[c.TOTAL_SPENT])||0), 0);
  const now_    = new Date();
  const bMonth  = rows.filter(r => {
    if (!r[c.ID] || !r[c.BIRTHDAY]) return false;
    try { return new Date(r[c.BIRTHDAY]).getMonth() === now_.getMonth(); } catch(e) { return false; }
  }).length;
  return { ok: true, data: { total, active, birthday_this_month: bMonth, total_points: pts, total_spent: spent } };
}

// ================================================================
// 低庫存通知
// ================================================================
function sendLowStockNotification() {
  const health = getInventoryHealth({});
  const low    = [...health.zero_stock, ...health.low_stock];
  if (low.length === 0) return { ok: true, notified: 0 };
  const lines = low.map(x => x.qty === 0
    ? `❌ ${x.name}：庫存歸零`
    : `⚠️ ${x.name}：剩 ${x.qty} 件（門檻 ${x.threshold}）`);
  sendLineMsg(`📦 低庫存警示（共 ${low.length} 項）\n${lines.join('\n')}\n時間：${now()}`);
  return { ok: true, notified: low.length };
}

function sendMonthlyReport() {
  const month  = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  const prev   = new Date(); prev.setMonth(prev.getMonth() - 1);
  const pMonth = Utilities.formatDate(prev, 'Asia/Taipei', 'yyyy-MM');
  const r      = getMonthlyReport({ month: pMonth }).data;
  const msg    = `📊 ${pMonth} 月結報表\n訂單數：${r.order_count}（取消 ${r.cancel_count}）\n收入：NT$ ${Number(r.revenue).toLocaleString()}\n進貨成本：NT$ ${Number(r.cost).toLocaleString()}\n毛利：NT$ ${Number(r.profit).toLocaleString()}\n\n熱銷商品 Top 3：\n${(r.top_products||[]).slice(0,3).map((x,i)=>`${i+1}. ${x.name}（${x.qty}件）`).join('\n')||'—'}\n\n報表產生時間：${now()}`;
  sendLineMsg(msg);
  return { ok: true };
}

// ================================================================
// 定時觸發器安裝
// ================================================================
function installTriggers() {
  // 清除舊觸發器（同名）
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'sendLowStockNotification' || fn === 'sendMonthlyReport') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // 每天早上 9 點：低庫存通知
  ScriptApp.newTrigger('sendLowStockNotification')
    .timeBased().everyDays(1).atHour(9).create();
  // 每月 1 日：月結報表
  ScriptApp.newTrigger('sendMonthlyReport')
    .timeBased().onMonthDay(1).atHour(8).create();
  return { ok: true, triggers: ['每日09:00 低庫存通知', '每月1日08:00 月結報表'] };
}

// ================================================================
// updateQty_ 單元測試（在 GAS 編輯器執行，不異動真實資料）
// ================================================================
function adminTestUpdateQty_(p) {
  const log = [];
  const errors = [];
  function pass(msg) { log.push('✅ ' + msg); }
  function fail(msg) { errors.push('❌ ' + msg); log.push('❌ ' + msg); }

  // 情境 1：qty 為 0 應被擋
  const r1 = updateQty_('DUMMY', 0, 'in');
  if (!r1.ok && r1.error.includes('qty')) pass('情境1 qty=0 被擋：' + r1.error);
  else fail('情境1 qty=0 未被擋');

  // 情境 2：type 未知應被擋
  const r2 = updateQty_('DUMMY', 5, 'unknown');
  if (!r2.ok && r2.error.includes('type')) pass('情境2 type=unknown 被擋：' + r2.error);
  else fail('情境2 type=unknown 未被擋');

  // 情境 3：找不到商品
  const r3 = updateQty_('NONEXIST_XYZ_99999', 5, 'in');
  if (!r3.ok && r3.error.includes('找不到')) pass('情境3 商品不存在被擋');
  else fail('情境3 商品不存在未被擋');

  // 情境 4/5：找第一個有庫存的商品，驗證 in/out 各加減一次（需有真實資料，跳過 dry-run）
  // 若想測試真實庫存寫入，請搭配 adminRunPaymentTest 使用
  const summary = errors.length === 0
    ? '✅ updateQty_ 基本驗證全部通過'
    : '⚠️ 有 ' + errors.length + ' 項失敗';
  Logger.log(log.join('\n'));
  return { ok: errors.length === 0, summary, log };
}

// 驗證舊碼索引不受新欄位影響（non-destructive read-only 測試）
function adminTestOldCodeCompatibility() {
  const log = [];
  const errors = [];
  function pass(msg) { log.push('✅ ' + msg); }
  function fail(msg) { errors.push('❌ ' + msg); log.push('❌ ' + msg); }

  // INVENTORY：舊碼讀 r[ci.QTY] (col 2)，新 LAST_OP_ID 在 col 4
  const invRows = getRows(SHEET.INVENTORY);
  const ci = COL.INVENTORY;
  if (ci.QTY === 2 && ci.UPDATED === 3 && ci.LAST_OP_ID === 4) pass('INVENTORY 索引正確（QTY=2, UPDATED=3, LAST_OP_ID=4）');
  else fail('INVENTORY 索引錯誤');

  // MEMBERS：舊碼讀 r[c.POINTS] (col 4)，新 LAST_OP_ID 在 col 12
  const cm = COL.MEMBERS;
  if (cm.POINTS === 4 && cm.TOTAL_SPENT === 5 && cm.BIRTH_DISC_YEAR === 11 && cm.LAST_OP_ID === 12)
    pass('MEMBERS 索引正確（POINTS=4, LAST_OP_ID=12）');
  else fail('MEMBERS 索引錯誤');

  // POINTS_LOG：舊碼讀 8 欄，REF_ID 在 col 8（新第 9 欄）
  const cp = COL.POINTS_LOG;
  if (cp.CREATED === 7 && cp.REF_ID === 8) pass('POINTS_LOG 索引正確（CREATED=7, REF_ID=8）');
  else fail('POINTS_LOG 索引錯誤');

  // STOCK_LOG：REF_ID 在 col 9
  const cs = COL.STOCK_LOG;
  if (cs.CREATED === 8 && cs.REF_ID === 9) pass('STOCK_LOG 索引正確（CREATED=8, REF_ID=9）');
  else fail('STOCK_LOG 索引錯誤');

  // RETURNS：新欄在 14/15
  const cr = COL.RETURNS;
  if (cr.CREATED === 13 && cr.ACTUAL_POINTS_DEDUCTED === 14 && cr.POINTS_SHORTFALL === 15)
    pass('RETURNS 索引正確（CREATED=13, ACTUAL_POINTS_DEDUCTED=14, POINTS_SHORTFALL=15）');
  else fail('RETURNS 索引錯誤');

  // 舊碼讀取 INVENTORY 第一筆，驗證 QTY 欄位還是數字
  if (invRows.length > 0) {
    const qty = Number(invRows[0][ci.QTY]);
    if (!isNaN(qty)) pass('舊碼讀 INVENTORY[0].QTY = ' + qty + '（正常）');
    else fail('INVENTORY[0].QTY 讀取失敗，值：' + invRows[0][ci.QTY]);
  }

  const summary = errors.length === 0
    ? '✅ 舊碼相容性驗證全部通過'
    : '⚠️ 有 ' + errors.length + ' 項失敗';
  Logger.log(log.join('\n'));
  return { ok: errors.length === 0, summary, log };
}

// ================================================================
// 活動報名 v26 自動驗收測試
// 在 GAS 編輯器選取此函式直接執行，不加入 router
// 測試完成後自動清理測試資料
// ================================================================
function adminTestEventRegistrationV26_() {
  var pass    = [];
  var fail    = [];
  var cleanup = [];
  var errors  = [];

  // ── 測試資料（時間戳尾碼，避免前次殘留擋住） ─────────────────
  var ts    = Utilities.formatDate(new Date(), 'Asia/Taipei', 'HHmmss');
  var stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss');
  var name  = 'TEST_V26_' + stamp;
  var phone1 = '0999' + ts;   // 主線 T01–T11
  var phone2 = '0998' + ts;   // 副線 T16

  var eventId        = null;
  var regId1         = null;
  var regId2         = null;
  var snapRegistered = 0;
  var snapAccom      = 0;
  var snapNoAccom    = 0;

  // ── Helpers（定義在外層，try/finally 都可用） ─────────────────
  function _pass(tag, msg) {
    var s = tag + ': ' + msg;
    pass.push(s);
    Logger.log('✅ ' + s);
  }
  function _fail(tag, msg) {
    var s = tag + ': ' + msg;
    fail.push(s);
    Logger.log('❌ ' + s);
  }
  function _regStatus(rid) {
    var f = findRow(SHEET.REGISTRATIONS, COL.REGISTRATIONS.ID, rid);
    return f ? String(f.row[COL.REGISTRATIONS.FEE_STATUS]) : '(not found)';
  }
  function _evCounts() {
    var f = findRow(SHEET.EVENTS, COL.EVENTS.ID, eventId);
    if (!f) return null;
    var ce = COL.EVENTS;
    return {
      registered: Number(f.row[ce.REGISTERED])          || 0,
      accom:      Number(f.row[ce.ACCOM_REGISTERED])    || 0,
      noAccom:    Number(f.row[ce.NO_ACCOM_REGISTERED]) || 0
    };
  }
  function _eaRows(matchFn) {
    return getRows(SHEET.EVENT_ACCOUNTS).filter(matchFn);
  }
  // 先讀全列，再從底部往上刪，避免 deleteRow 後列號位移
  function _delRows(sheetName, matchFn, label) {
    try {
      var sheet   = getSheet(sheetName);
      var lastRow = sheet.getLastRow();
      if (lastRow < DATA_ROW) { cleanup.push(label + ': 無資料列'); return; }
      var lastCol = sheet.getLastColumn();
      var allData = sheet.getRange(DATA_ROW, 1, lastRow - DATA_ROW + 1, lastCol).getValues();
      var toDelete = [];
      for (var idx = 0; idx < allData.length; idx++) {
        if (matchFn(allData[idx])) toDelete.push(idx + DATA_ROW);
      }
      for (var k = toDelete.length - 1; k >= 0; k--) {
        sheet.deleteRow(toDelete[k]);
      }
      cleanup.push(label + ': ' + (toDelete.length > 0 ? '已刪 ' + toDelete.length + ' 列' : '無符合列'));
    } catch(e2) { errors.push('cleanup [' + label + ']: ' + e2.toString()); }
  }

  Logger.log('=== V26 TEST START ===');
  Logger.log('name:   ' + name);
  Logger.log('phone1: ' + phone1 + '（主線 T01-T11）');
  Logger.log('phone2: ' + phone2 + '（副線 T16）');

  try {
    var ce = COL.EVENTS;
    var cr = COL.REGISTRATIONS;
    var ca = COL.ACCOUNTS;

    // ── Step 0: 找第一個報名中活動 ──────────────────────────────
    var evRows = getRows(SHEET.EVENTS);
    var evFound = null;
    for (var ei = 0; ei < evRows.length; ei++) {
      if (String(evRows[ei][ce.STATUS]) === '報名中' && evRows[ei][ce.ID]) {
        evFound = evRows[ei]; break;
      }
    }
    if (!evFound) {
      return { ok: false, pass: pass, fail: ['Step0: 找不到 status=報名中 的活動'], cleanup: cleanup, errors: errors };
    }
    eventId = String(evFound[ce.ID]);
    Logger.log('eventId: ' + eventId);

    // ── Step 0b: 費用欄位 + 不住宿名額驗證 ─────────────────────
    var feeA = Number(evFound[ce.FEE_ACCOM])           || 0;
    var feeN = Number(evFound[ce.FEE_NO_ACCOM])        || 0;
    var qN   = Number(evFound[ce.NO_ACCOM_QUOTA])      || 0;
    var rN   = Number(evFound[ce.NO_ACCOM_REGISTERED]) || 0;
    if (feeA !== 12000)
      return { ok: false, pass: pass, fail: ['Step0b: fee_accom=' + feeA + '，預期 12000'], cleanup: cleanup, errors: errors };
    if (feeN !== 10000)
      return { ok: false, pass: pass, fail: ['Step0b: fee_no_accom=' + feeN + '，預期 10000'], cleanup: cleanup, errors: errors };
    if (qN <= rN)
      return { ok: false, pass: pass, fail: ['Step0b: 不住宿名額不足 quota=' + qN + ' registered=' + rN], cleanup: cleanup, errors: errors };
    _pass('Step0b', 'fee_accom=12000 fee_no_accom=10000 不住宿餘額=' + (qN - rN));

    // ── Step 0c: 快照活動名額 ────────────────────────────────────
    snapRegistered = Number(evFound[ce.REGISTERED])          || 0;
    snapAccom      = Number(evFound[ce.ACCOM_REGISTERED])    || 0;
    snapNoAccom    = Number(evFound[ce.NO_ACCOM_REGISTERED]) || 0;
    Logger.log('snap: registered=' + snapRegistered + ' accom=' + snapAccom + ' no_accom=' + snapNoAccom);

    // ══ T01：不住宿報名 ══════════════════════════════════════════
    var r01 = addRegistration({
      token: REG_TOKEN,
      event_id: eventId, name: name, phone: phone1,
      accommodation: '不住宿', note: '[V26_TEST]',
      emergency_name: 'V26_TEST_EC', emergency_phone: '0999000099'
    });
    if (!r01.ok) { _fail('T01', r01.error || 'addRegistration 失敗'); throw new Error('T01 失敗，中止主線'); }
    regId1 = String(r01.reg_id);
    Logger.log('regId1: ' + regId1);
    var rRow1 = findRow(SHEET.REGISTRATIONS, cr.ID, regId1);
    var ft1   = rRow1 ? String(rRow1.row[cr.FEE_TYPE])   : '';
    var fa1   = rRow1 ? Number(rRow1.row[cr.FEE_AMOUNT]) : 0;
    (ft1 === '不住宿' && fa1 === 10000)
      ? _pass('T01', 'fee_type=不住宿 fee_amount=10000 regId1=' + regId1)
      : _fail('T01', 'fee_type=' + ft1 + ' fee_amount=' + fa1 + '（預期 不住宿/10000）');

    // ══ T06：審核通過 ════════════════════════════════════════════
    var r06 = approveRegistration({ reg_id: regId1, approved: 'true' });
    if (!r06.ok) { _fail('T06', r06.error || 'approveRegistration 失敗'); }
    else {
      var s06 = _regStatus(regId1);
      s06 === '待付款' ? _pass('T06', 'status=待付款') : _fail('T06', 'status=' + s06 + '（預期待付款）');
    }

    // ══ T08：確認收款 ════════════════════════════════════════════
    var m1  = '[REG:'    + regId1 + ']';
    var rm1 = '[REFUND:' + regId1 + ']';
    var r08 = updateRegistration({ reg_id: regId1, fee_status: '已付款' });
    if (!r08.ok) { _fail('T08', r08.error || 'updateRegistration 失敗'); }
    else {
      var s08  = _regStatus(regId1);
      var ea08 = _eaRows(function(r) { return String(r[ca.NOTE]) === m1; });
      if      (s08 !== '已付款')   _fail('T08', 'status=' + s08 + '（預期已付款）');
      else if (ea08.length !== 1)  _fail('T08', 'EA[REG:regId1] 筆數=' + ea08.length + '（預期1）');
      else if (Number(ea08[0][ca.INCOME]) !== 10000) _fail('T08', 'INCOME=' + ea08[0][ca.INCOME] + '（預期10000）');
      else    _pass('T08', 'status=已付款 EA[REG:regId1] income=10000 status=已收款');
    }

    // ══ T09：重複確認收款被擋 ════════════════════════════════════
    var r09   = updateRegistration({ reg_id: regId1, fee_status: '已付款' });
    var cnt09 = _eaRows(function(r) { return String(r[ca.NOTE]) === m1; }).length;
    if   (r09.ok)        _fail('T09', '重複確認收款未被擋');
    else if (cnt09 !== 1) _fail('T09', 'EA[REG:regId1] 筆數=' + cnt09 + '（預期仍為1）');
    else  _pass('T09', '重複確認收款被擋 EA冪等=1筆 error=' + r09.error);

    // ══ T11a：已付款取消退款 ═════════════════════════════════════
    var r11  = refundCancelRegistration({ reg_id: regId1, refund_amount: 10000 });
    if (!r11.ok) { _fail('T11a', r11.error || 'refundCancelRegistration 失敗'); }
    else {
      var s11   = _regStatus(regId1);
      var ref11 = _eaRows(function(r) { return String(r[ca.NOTE]).indexOf(rm1) === 0; });
      if      (s11 !== '已取消')    _fail('T11a', 'status=' + s11 + '（預期已取消）');
      else if (ref11.length !== 1)  _fail('T11a', 'EA[REFUND:regId1] 筆數=' + ref11.length + '（預期1）');
      else if (Number(ref11[0][ca.EXPENSE]) !== 10000) _fail('T11a', 'EXPENSE=' + ref11[0][ca.EXPENSE] + '（預期10000）');
      else    _pass('T11a', 'status=已取消 EA[REFUND:regId1] expense=10000');
    }

    // ══ T11b 第一段：退款後立即驗名額（refundCancelRegistration 內已 sync）
    var cnts11 = _evCounts();
    if (!cnts11) { _fail('T11b', '找不到活動列'); }
    else if (cnts11.registered === snapRegistered && cnts11.noAccom === snapNoAccom && cnts11.accom === snapAccom) {
      _pass('T11b', '名額回到快照 registered=' + cnts11.registered + ' no_accom=' + cnts11.noAccom);
    } else {
      _fail('T11b', '名額未回快照 got ' + cnts11.registered + '/' + cnts11.noAccom + ' snap ' + snapRegistered + '/' + snapNoAccom);
    }

    // ══ T16a：副線報名 ═══════════════════════════════════════════
    var r16a = addRegistration({
      token: REG_TOKEN,
      event_id: eventId, name: name, phone: phone2,
      accommodation: '不住宿', note: '[V26_TEST]',
      emergency_name: 'V26_TEST_EC', emergency_phone: '0999000099'
    });
    if (!r16a.ok) { _fail('T16a', r16a.error || 'addRegistration 失敗'); throw new Error('T16a 失敗，中止副線'); }
    regId2 = String(r16a.reg_id);
    Logger.log('regId2: ' + regId2);
    _pass('T16a', 'regId2=' + regId2);

    // ══ T16b：審核通過 ═══════════════════════════════════════════
    var r16b = approveRegistration({ reg_id: regId2, approved: 'true' });
    r16b.ok ? _pass('T16b', 'status=待付款') : _fail('T16b', r16b.error || 'approveRegistration 失敗');

    // ══ T16c：確認收款 + 驗 EA ═══════════════════════════════════
    var m2   = '[REG:'    + regId2 + ']';
    var rm2  = '[REFUND:' + regId2 + ']';
    var r16c = updateRegistration({ reg_id: regId2, fee_status: '已付款' });
    if (!r16c.ok) { _fail('T16c', r16c.error || 'updateRegistration 失敗'); }
    else {
      var ea16c = _eaRows(function(r) { return String(r[ca.NOTE]) === m2; });
      (ea16c.length === 1 && Number(ea16c[0][ca.INCOME]) === 10000)
        ? _pass('T16c', 'EA[REG:regId2] income=10000 筆數=1')
        : _fail('T16c', '筆數=' + ea16c.length + (ea16c[0] ? ' income=' + ea16c[0][ca.INCOME] : ''));
    }

    // ══ T16d：已付款直接取消被擋 ═════════════════════════════════
    var r16d = cancelRegistration({ reg_id: regId2 });
    if (r16d.ok) {
      _fail('T16d', 'cancelRegistration 未被擋（已付款不可直接取消）');
    } else if (r16d.error && (r16d.error.indexOf('已付款') >= 0 || r16d.error.indexOf('退款') >= 0)) {
      _pass('T16d', '被擋 error=' + r16d.error);
    } else {
      _fail('T16d', '被擋但訊息不符 error=' + (r16d.error || ''));
    }

    // ══ T16e：退款清理 + 驗帳 ════════════════════════════════════
    var r16e = refundCancelRegistration({ reg_id: regId2, refund_amount: 10000 });
    if (!r16e.ok) { _fail('T16e', r16e.error || 'refundCancelRegistration 失敗'); }
    else {
      var eaAll  = getRows(SHEET.EVENT_ACCOUNTS);
      var ref16e = eaAll.filter(function(r) { return String(r[ca.NOTE]).indexOf(rm2) === 0; });
      var reg16e = eaAll.filter(function(r) { return String(r[ca.NOTE]) === m2; });
      (ref16e.length === 1 && Number(ref16e[0][ca.EXPENSE]) === 10000 && reg16e.length === 1)
        ? _pass('T16e', 'EA[REFUND:regId2] expense=10000 [REG:regId2] 仍=1（不重複）')
        : _fail('T16e', '[REFUND]=' + ref16e.length + ' [REG]=' + reg16e.length);
    }

  } catch(e) {
    errors.push('測試例外：' + e.toString());
    Logger.log('EXCEPTION: ' + e.toString());
  } finally {
    Logger.log('--- CLEANUP START ---');
    Logger.log('regId1=' + regId1 + ' regId2=' + regId2 + ' eventId=' + eventId);

    var crC = COL.REGISTRATIONS;
    var caC = COL.ACCOUNTS;

    // 1-2: 刪測試報名記錄（精確比對 ID）
    if (regId1) _delRows(SHEET.REGISTRATIONS, function(r) { return String(r[crC.ID]) === regId1; }, 'REGISTRATIONS/regId1');
    if (regId2) _delRows(SHEET.REGISTRATIONS, function(r) { return String(r[crC.ID]) === regId2; }, 'REGISTRATIONS/regId2');
    // 3-4: 刪活動帳本收入（嚴格 === 比對）
    if (regId1) _delRows(SHEET.EVENT_ACCOUNTS, function(r) { return String(r[caC.NOTE]) === '[REG:'+regId1+']'; }, '[REG:regId1]');
    if (regId2) _delRows(SHEET.EVENT_ACCOUNTS, function(r) { return String(r[caC.NOTE]) === '[REG:'+regId2+']'; }, '[REG:regId2]');
    // 5-6: 刪活動帳本退款（startsWith 比對，因 NOTE 含附帶文字）
    if (regId1) _delRows(SHEET.EVENT_ACCOUNTS, function(r) { return String(r[caC.NOTE]).indexOf('[REFUND:'+regId1+']') === 0; }, '[REFUND:regId1]');
    if (regId2) _delRows(SHEET.EVENT_ACCOUNTS, function(r) { return String(r[caC.NOTE]).indexOf('[REFUND:'+regId2+']') === 0; }, '[REFUND:regId2]');

    // 7: adminSyncEventCounts_（自行取鎖，安全）
    // 只有真正建過報名記錄才需要 sync，前置檢查失敗（regId 皆 null）則跳過
    if (eventId && (regId1 || regId2)) {
      try {
        var sync = adminSyncEventCounts_({ event_id: eventId });
        cleanup.push('adminSyncEventCounts: ' + JSON.stringify(sync));
      } catch(e2) { errors.push('cleanup adminSyncEventCounts: ' + e2.toString()); }
    }

    // 8: 最終驗證 — 名額回快照 + EA 無殘留
    if (eventId && (regId1 || regId2)) {
      try {
        var evFinal = findRow(SHEET.EVENTS, COL.EVENTS.ID, eventId);
        if (evFinal) {
          var ce2 = COL.EVENTS;
          var rowF = evFinal.row;
          var rF = Number(rowF[ce2.REGISTERED])          || 0;
          var aF = Number(rowF[ce2.ACCOM_REGISTERED])    || 0;
          var nF = Number(rowF[ce2.NO_ACCOM_REGISTERED]) || 0;
          Logger.log('FINAL quota: registered=' + rF + ' accom=' + aF + ' no_accom=' + nF +
                     ' (snap ' + snapRegistered + '/' + snapAccom + '/' + snapNoAccom + ')');
          (rF === snapRegistered && aF === snapAccom && nF === snapNoAccom)
            ? pass.push('FINAL: 名額回到快照 registered=' + rF + ' accom=' + aF + ' no_accom=' + nF)
            : fail.push('FINAL: 名額未回快照 got ' + rF+'/'+aF+'/'+nF + ' snap ' + snapRegistered+'/'+snapAccom+'/'+snapNoAccom);

          var eaFinal = getRows(SHEET.EVENT_ACCOUNTS);
          var leftover = eaFinal.filter(function(r) {
            var n = String(r[caC.NOTE]);
            return (regId1 && (n === '[REG:'+regId1+']' || n.indexOf('[REFUND:'+regId1+']') === 0)) ||
                   (regId2 && (n === '[REG:'+regId2+']' || n.indexOf('[REFUND:'+regId2+']') === 0));
          });
          leftover.length === 0
            ? pass.push('FINAL: EVENT_ACCOUNTS 測試資料已全部清除')
            : fail.push('FINAL: EVENT_ACCOUNTS 仍有 ' + leftover.length + ' 筆測試資料殘留');
        } else {
          errors.push('FINAL: 找不到活動列 eventId=' + eventId);
        }
      } catch(e2) { errors.push('cleanup 最終驗證: ' + e2.toString()); }
    }
    Logger.log('--- CLEANUP END ---');
  }

  var ok = fail.length === 0 && errors.length === 0;
  var result = { ok: ok, pass: pass, fail: fail, cleanup: cleanup, errors: errors };
  Logger.log('=== V26 TEST END ok=' + ok + ' pass=' + pass.length + ' fail=' + fail.length + ' errors=' + errors.length + ' ===');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

// 讓 GAS 下拉選單看得到（底線結尾函式不會出現）
function runTestEventRegistrationV26() { return adminTestEventRegistrationV26_(); }

// ================================================================
// 一次性初始化：電話欄位格式設為純文字（避免首字0消失）
// 在 GAS 編輯器直接點「執行」這個函式即可，只需執行一次
// ================================================================
function adminSetupPhoneFormats() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const targets = [
    { sheet: SHEET.ORDERS,         col: COL.ORDERS.PHONE + 1,                label: '客戶訂單/電話' },
    { sheet: SHEET.REGISTRATIONS,  col: COL.REGISTRATIONS.PHONE + 1,         label: '報名記錄/電話' },
    { sheet: SHEET.REGISTRATIONS,  col: COL.REGISTRATIONS.EMERGENCY_PHONE+1, label: '報名記錄/緊急聯絡電話' },
    { sheet: SHEET.MEMBERS,        col: COL.MEMBERS.PHONE + 1,               label: '會員/電話' },
    { sheet: SHEET.POINTS_LOG,     col: COL.POINTS_LOG.PHONE + 1,            label: '點數記錄/電話' },
    { sheet: SHEET.RETURNS,        col: COL.RETURNS.PHONE + 1,               label: '退貨記錄/電話' }
  ];
  const done = [];
  const errors = [];
  targets.forEach(({ sheet, col, label }) => {
    try {
      const s = ss.getSheetByName(sheet);
      if (!s) { errors.push(label + '（找不到工作表）'); return; }
      s.getRange(1, col, Math.max(s.getMaxRows(), 100), 1).setNumberFormat('@');
      done.push(label);
    } catch(e) {
      errors.push(label + '：' + e.message);
    }
  });
  Logger.log('✅ 完成：' + done.join('、'));
  if (errors.length) Logger.log('⚠️ 錯誤：' + errors.join('、'));
  return { ok: true, done, errors };
}

// ================================================================
// 測試訂單清除工具（預覽 + 清除）
// ================================================================

function adminPreviewClearAllTestOrders() {
  return { ok: false, error: '測試訂單清除工具已停用' };
  const orders = getRows(SHEET.ORDERS);
  const c = COL.ORDERS;
  const DEDUCTED = ['已確認','已出貨','已付款','已完成'];

  const statusCount = {};
  const riskyOrders = [];
  let needsInventoryReturn = 0;

  orders.forEach(r => {
    if (!r[c.ID]) return;
    const st = String(r[c.STATUS]);
    statusCount[st] = (statusCount[st] || 0) + 1;
    if (DEDUCTED.includes(st)) needsInventoryReturn++;
    if (st === '處理中' || st === '處理失敗') riskyOrders.push(String(r[c.ID]));
  });

  const orderIds = new Set(orders.filter(r => r[c.ID]).map(r => String(r[c.ID])));
  const ptRows = getRows(SHEET.POINTS_LOG);
  const cp = COL.POINTS_LOG;
  const PTS_PREFIX = '訂單消費：';
  const ptsEntries = ptRows.filter(r => {
    const note = String(r[cp.NOTE] || '');
    const ref  = String(r[cp.REF_ID] || '');
    if (note.startsWith(PTS_PREFIX) && orderIds.has(note.slice(PTS_PREFIX.length))) return true;
    if (ref.startsWith('POS:') && orderIds.has(ref.slice(4))) return true;
    return false;
  });

  const accRows = getRows(SHEET.ACCOUNTS);
  const ca = COL.ACCOUNTS;
  const relatedAcc = accRows.filter(r => {
    if (!r[ca.ID]) return false;
    const items = String(r[ca.ITEMS] || '');
    return [...orderIds].some(id => items.includes(id));
  });

  return {
    ok: true,
    total_orders: orders.filter(r => r[c.ID]).length,
    status_breakdown: statusCount,
    needs_inventory_return: needsInventoryReturn,
    needs_points_revert: ptsEntries.length,
    related_accounts: relatedAcc.length,
    risky_orders: riskyOrders,
    warning: riskyOrders.length > 0
      ? '狀態為處理中/處理失敗的訂單庫存狀態不明，清除功能會被阻擋，請先人工處理：' + riskyOrders.join(', ')
      : null
  };
}

function adminClearAllTestOrders(p) {
  return { ok: false, error: '測試訂單清除工具已停用' };
  if (p.confirm !== 'YES_CLEAR_ALL_TEST_ORDERS')
    return { ok: false, error: '請帶 confirm=YES_CLEAR_ALL_TEST_ORDERS 確認清除' };

  const lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };

  try {
    const orders = getRows(SHEET.ORDERS);
    const c = COL.ORDERS;
    const DEDUCTED = ['已確認','已出貨','已付款','已完成'];

    // 方案 A：發現 risky_orders 直接擋，不做任何清除
    const riskyOrders = orders
      .filter(r => r[c.ID] && (String(r[c.STATUS]) === '處理中' || String(r[c.STATUS]) === '處理失敗'))
      .map(r => String(r[c.ID]));
    if (riskyOrders.length > 0) {
      return { ok: false, error: '存在處理中/處理失敗訂單，請先人工處理', risky_orders: riskyOrders };
    }

    const logSheet = getSheet(SHEET.STOCK_LOG);
    const ptRows   = getRows(SHEET.POINTS_LOG);
    const cp = COL.POINTS_LOG;
    const cm = COL.MEMBERS;
    const PTS_PREFIX = '訂單消費：';
    const summary = {
      orders_cleared: 0,
      inventory_returned: [],
      inventory_failed: [],
      points_reverted: [],
      points_failed: [],
      accounts_voided: 0
    };

    // Step 1：庫存回補 + 點數沖回
    for (const r of orders) {
      if (!r[c.ID]) continue;
      const orderId = String(r[c.ID]);
      const status  = String(r[c.STATUS]);

      if (DEDUCTED.includes(status)) {
        try {
          const items = JSON.parse(r[c.ITEMS] || '[]');
          for (const item of items) {
            const qty = parseInt(item.qty) || 0;
            if (!item.product_id || qty <= 0) continue;
            const qr = updateQty_(item.product_id, qty, 'in');
            if (qr.ok) {
              logSheet.appendRow([
                genId('L'), item.product_id, item.name || qr.name, '入庫（測試清除）',
                qty, '', '系統', '[TEST_CLEAR:' + orderId + ']', now(), ''
              ]);
              summary.inventory_returned.push(orderId + ':' + item.product_id);
            } else {
              summary.inventory_failed.push(orderId + ':' + item.product_id + ':' + qr.error);
            }
          }
        } catch(e) {
          summary.inventory_failed.push(orderId + ':json_error:' + e.message);
        }
      }

      const ptEntry = ptRows.find(pt => {
        const note = String(pt[cp.NOTE] || '');
        const ref  = String(pt[cp.REF_ID] || '');
        return note === PTS_PREFIX + orderId || ref === 'POS:' + orderId;
      });
      if (ptEntry) {
        const phone    = String(ptEntry[cp.PHONE]);
        const ptsAdded = Number(ptEntry[cp.POINTS]) || 0;
        if (phone && ptsAdded > 0) {
          const memRow = findRow(SHEET.MEMBERS, cm.PHONE, phone);
          const curBal = memRow ? Number(memRow.row[cm.POINTS]) || 0 : 0;
          const deduct = Math.min(ptsAdded, curBal);
          if (deduct > 0) {
            try {
              const pr = addPoints_({ phone, points: -deduct,
                note: '[TEST_CLEAR:' + orderId + ']', refId: '' });
              if (pr.ok) summary.points_reverted.push(orderId + ':' + phone + ':-' + deduct);
              else summary.points_failed.push(orderId + ':' + phone + ':' + pr.error);
            } catch(e) {
              summary.points_failed.push(orderId + ':' + e.message);
            }
          }
        }
      }
    }

    // Step 2：相關帳本改「已作廢」（不刪，保留稽核）
    const accRows = getRows(SHEET.ACCOUNTS);
    const ca = COL.ACCOUNTS;
    const accSheet = getSheet(SHEET.ACCOUNTS);
    const orderIds = new Set(orders.filter(r => r[c.ID]).map(r => String(r[c.ID])));
    accRows.forEach((r, i) => {
      if (!r[ca.ID]) return;
      const items = String(r[ca.ITEMS] || '');
      if ([...orderIds].some(id => items.includes(id)) && String(r[ca.STATUS]) !== '已作廢') {
        accSheet.getRange(DATA_ROW + i, ca.STATUS + 1).setValue('已作廢');
        summary.accounts_voided++;
      }
    });

    // Step 3：一次刪除所有訂單列（保留 row 1–2 表頭）
    const orderSheet = getSheet(SHEET.ORDERS);
    const lastRow = orderSheet.getLastRow();
    const validCount = orders.filter(r => r[c.ID]).length;
    if (lastRow >= DATA_ROW) {
      orderSheet.deleteRows(DATA_ROW, lastRow - DATA_ROW + 1);
      summary.orders_cleared = validCount;
    }

    try { refreshBalance(); } catch(e) {}

    return { ok: true, summary };

  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// Schema 初始化：自動補齊新欄位 + 建立系統設定工作表
// 在 GAS 編輯器選此函式點「執行」，只需執行一次
// ================================================================
function adminSetupSchema() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const HEADER_ROW = 2;
  const log = [];

  function writeHeaders(sheetName, colStart, headers) {
    const s = ss.getSheetByName(sheetName);
    if (!s) { log.push('找不到工作表：' + sheetName); return; }
    s.getRange(HEADER_ROW, colStart, 1, headers.length).setValues([headers]);
    log.push(sheetName + ' OK（' + headers.join(', ') + '）');
  }

  // 確保指定欄位存在於最後一欄（不移動現有欄位）
  function _ensureLastCol_(sheetName, colHeader) {
    const s = ss.getSheetByName(sheetName);
    if (!s) { log.push('找不到工作表（ensureLastCol）：' + sheetName); return; }
    const lastCol = s.getLastColumn();
    const headers = lastCol > 0 ? s.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0] : [];
    if (headers.includes(colHeader)) {
      log.push(sheetName + ' 欄位已存在：' + colHeader);
    } else {
      s.getRange(HEADER_ROW, lastCol + 1).setValue(colHeader);
      log.push(sheetName + ' 新增欄位：' + colHeader + '（第 ' + (lastCol+1) + ' 欄）');
    }
  }

  writeHeaders(SHEET.ORDERS,        11, ['subtotal','shipping_fee','coupon_code','cancelled_by','cancelled_at','cancel_reason']);
  writeHeaders(SHEET.REGISTRATIONS, 18, ['gender','cancelled_by','cancelled_at']);
  writeHeaders(SHEET.EVENTS,        16, ['accom_registered','no_accom_registered']);
  writeHeaders(SHEET.MEMBERS,        9, ['member_level','annual_spend','level_updated_at','birth_disc_year']);

  // v10.1 新增欄位（append-only，不影響現有索引）
  _ensureLastCol_(SHEET.INVENTORY,  'last_op_id');
  _ensureLastCol_(SHEET.MEMBERS,    'last_op_id');
  _ensureLastCol_(SHEET.STOCK_LOG,  'ref_id');
  _ensureLastCol_(SHEET.POINTS_LOG, 'ref_id');
  _ensureLastCol_(SHEET.RETURNS,    'actual_points_deducted');
  _ensureLastCol_(SHEET.RETURNS,    'points_shortfall');

  // P0：活動住宿/不住宿分開收費
  _ensureLastCol_(SHEET.EVENTS, 'fee_accom');
  _ensureLastCol_(SHEET.EVENTS, 'fee_no_accom');

  // 退貨處理記錄（新工作表）
  let retStepsSheet = ss.getSheetByName(SHEET.RETURN_STEPS);
  if (!retStepsSheet) {
    retStepsSheet = ss.insertSheet(SHEET.RETURN_STEPS);
    log.push('建立工作表：' + SHEET.RETURN_STEPS);
  }
  retStepsSheet.getRange(HEADER_ROW, 1, 1, 10).setValues([[
    'id','return_id','step','status','ref_id','before_value','expected_after','updated_at','error','created_at'
  ]]);
  log.push(SHEET.RETURN_STEPS + ' 表頭 OK');

  // 活動帳本（與商品帳本同結構）
  let evtAccSheet = ss.getSheetByName(SHEET.EVENT_ACCOUNTS);
  if (!evtAccSheet) {
    evtAccSheet = ss.insertSheet(SHEET.EVENT_ACCOUNTS);
    log.push('建立工作表：活動帳本');
  }
  evtAccSheet.getRange(HEADER_ROW, 1, 1, 11).setValues([['id','date','type','partner','items','income','expense','payment','status','note','created_at']]);
  log.push('活動帳本 OK');

  let settingsSheet = ss.getSheetByName(SHEET.SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET.SETTINGS);
    log.push('建立工作表：系統設定');
  }
  settingsSheet.getRange(HEADER_ROW, 1, 1, 4).setValues([['key','value','desc','updated']]);

  const now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm');
  const existingData  = settingsSheet.getDataRange().getValues();
  const existingKeys  = existingData.slice(DATA_ROW - 1).map(r => String(r[0])).filter(k => k);
  const toAdd = Object.entries(SETTING_DEFAULTS)
    .filter(([k]) => !existingKeys.includes(k))
    .map(([k, v]) => [k, v.value, v.desc, now]);

  if (toAdd.length > 0) {
    const startRow = Math.max(settingsSheet.getLastRow() + 1, DATA_ROW);
    settingsSheet.getRange(startRow, 1, toAdd.length, 4).setValues(toAdd);
    log.push('系統設定寫入 ' + toAdd.length + ' 筆預設值');
  } else {
    log.push('系統設定預設值已存在，略過');
  }

  Logger.log(log.join('\n'));
  return { ok: true, log };
}

// ================================================================
// 付款流程自動驗收測試（在 GAS 編輯器執行，測完自動清理）
// ================================================================
function adminRunPaymentTest() {
  const log = [];
  const errors = [];
  let testOrderId1 = null, testOrderId2 = null;
  const TEST_PHONE = '0900000001';
  const TEST_NAME  = '【測試用戶】';

  function pass(msg) { log.push('✅ ' + msg); }
  function fail(msg) { errors.push('❌ ' + msg); log.push('❌ ' + msg); }
  function info(msg) { log.push('   ' + msg); }

  try {
    // ── 找第一個有庫存的商品 ──
    const invRows = getRows(SHEET.INVENTORY);
    const ci = COL.INVENTORY;
    const invItem = invRows.find(r => r[ci.ID] && Number(r[ci.QTY]) >= 2);
    if (!invItem) { fail('找不到庫存 ≥ 2 的商品，無法測試'); Logger.log(log.join('\n')); return; }
    const pid  = String(invItem[ci.ID]);
    const pname = String(invItem[ci.NAME]);
    const qtyBefore = Number(invItem[ci.QTY]);
    info('測試商品：' + pname + '（' + pid + '），目前庫存 ' + qtyBefore);

    // ── 確保測試會員存在 ──
    const memRows = getRows(SHEET.MEMBERS);
    const cm = COL.MEMBERS;
    const memIdx = memRows.findIndex(r => String(r[cm.PHONE]) === TEST_PHONE);
    let ptsBefore = 0;
    if (memIdx < 0) {
      registerMember({ name: TEST_NAME, phone: TEST_PHONE });
      info('已建立測試會員');
    } else {
      ptsBefore = Number(memRows[memIdx][cm.POINTS]) || 0;
    }
    info('測試會員點數（測試前）：' + ptsBefore);

    // ── 場景 A：正常下單 → 確認 → 付款 → 重複付款應被擋 ──
    info('');
    info('=== 場景 A：付款流程 ===');

    const orderItems = JSON.stringify([{ product_id: pid, name: pname, qty: 1, price: 100 }]);
    const r1 = addOrder({ token: ORDER_TOKEN, customer_name: TEST_NAME, phone: TEST_PHONE,
                          address: '測試地址', items: orderItems, payment: 'ATM轉帳', note: '自動測試A' });
    if (!r1.ok) { fail('建立訂單 A 失敗：' + r1.error); throw new Error('stop'); }
    testOrderId1 = r1.order_id;
    pass('建立訂單 A：' + testOrderId1 + '（小計 ' + r1.subtotal + '，運費 ' + r1.shipping_fee + '）');

    const r2 = updateOrder({ order_id: testOrderId1, status: '已確認', deduct: 'true', session_token: 'skip' });
    if (!r2.ok) { fail('確認訂單失敗：' + r2.error); throw new Error('stop'); }
    pass('確認訂單並扣庫存');

    // 驗證庫存只扣一次
    const qtyAfterConfirm = Number(findRow(SHEET.INVENTORY, COL.INVENTORY.ID, pid).row[COL.INVENTORY.QTY]);
    if (qtyAfterConfirm === qtyBefore - 1) pass('庫存正確扣 1（' + qtyBefore + ' → ' + qtyAfterConfirm + '）');
    else fail('庫存數量異常（預期 ' + (qtyBefore-1) + '，實際 ' + qtyAfterConfirm + '）');

    // 重複確認應被擋
    const r2b = updateOrder({ order_id: testOrderId1, status: '已確認', deduct: 'true', session_token: 'skip' });
    if (!r2b.ok) pass('重複扣庫存被擋：' + r2b.error);
    else fail('重複扣庫存未被擋！');

    // 確認付款
    const r3 = confirmOrderPayment({ order_id: testOrderId1, member_phone: TEST_PHONE });
    if (!r3.ok) { fail('確認付款失敗：' + r3.error); throw new Error('stop'); }
    pass('確認付款成功，加點 ' + r3.points_added);

    // 重複確認付款應被擋
    const r3b = confirmOrderPayment({ order_id: testOrderId1 });
    if (!r3b.ok) pass('重複確認付款被擋：' + r3b.error);
    else fail('重複確認付款未被擋！');

    // 驗證帳本：只有一筆已收款，待收款已結清
    const accRows = getRows(SHEET.ACCOUNTS);
    const ca = COL.ACCOUNTS;
    const relatedAcc = accRows.filter(r => String(r[ca.ITEMS]).includes(testOrderId1));
    const paid   = relatedAcc.filter(r => String(r[ca.STATUS]) === '已收款');
    const pending = relatedAcc.filter(r => String(r[ca.STATUS]) === '待收款');
    if (paid.length === 1)   pass('帳本只有 1 筆已收款');
    else fail('帳本已收款筆數異常：' + paid.length);
    if (pending.length === 0) pass('待收款已結清（0 筆）');
    else fail('仍有 ' + pending.length + ' 筆待收款未結清');

    // 驗證點數只加一次
    const memRowsAfter = getRows(SHEET.MEMBERS);
    const memAfter = memRowsAfter.find(r => String(r[cm.PHONE]) === TEST_PHONE);
    const ptsAfter = memAfter ? Number(memAfter[cm.POINTS]) : 0;
    if (ptsAfter >= ptsBefore) pass('會員點數正確：' + ptsBefore + ' → ' + ptsAfter);
    else fail('點數異常（前 ' + ptsBefore + '，後 ' + ptsAfter + '）');

    // ── 場景 B：下單 → 確認 → 取消 → 待收款應作廢 ──
    info('');
    info('=== 場景 B：取消訂單 ===');

    const r4 = addOrder({ token: ORDER_TOKEN, customer_name: TEST_NAME, phone: TEST_PHONE,
                          address: '測試地址', items: orderItems, payment: 'ATM轉帳', note: '自動測試B' });
    if (!r4.ok) { fail('建立訂單 B 失敗：' + r4.error); throw new Error('stop'); }
    testOrderId2 = r4.order_id;
    pass('建立訂單 B：' + testOrderId2);

    updateOrder({ order_id: testOrderId2, status: '已確認', deduct: 'true', session_token: 'skip' });
    pass('確認訂單 B 並扣庫存');

    const r5 = cancelOrder({ order_id: testOrderId2, cancel_reason: '自動測試取消', cancelled_by: '測試程式' });
    if (!r5.ok) { fail('取消訂單 B 失敗：' + r5.error); throw new Error('stop'); }
    pass('取消訂單 B');

    // 驗證待收款已作廢
    const accRows2 = getRows(SHEET.ACCOUNTS);
    const relatedB = accRows2.filter(r => String(r[ca.ITEMS]).includes(testOrderId2));
    const voided = relatedB.filter(r => String(r[ca.STATUS]) === '已作廢');
    if (voided.length >= 1) pass('待收款已作廢（' + voided.length + ' 筆）');
    else fail('待收款未被作廢，仍殘留 ' + relatedB.map(r=>r[ca.STATUS]).join('/'));

    // 驗證庫存已還回
    const qtyAfterCancel = Number(findRow(SHEET.INVENTORY, COL.INVENTORY.ID, pid).row[COL.INVENTORY.QTY]);
    if (qtyAfterCancel === qtyAfterConfirm) pass('庫存取消後還回（目前 ' + qtyAfterCancel + '）');
    else fail('庫存還回異常（預期 ' + qtyAfterConfirm + '，實際 ' + qtyAfterCancel + '）');

  } catch(e) {
    if (e.message !== 'stop') fail('例外：' + e.toString());
  } finally {
    // ── 清理測試資料 ──
    info('');
    info('=== 清理測試資料 ===');
    [testOrderId1, testOrderId2].filter(Boolean).forEach(oid => {
      try {
        const f = findRow(SHEET.ORDERS, COL.ORDERS.ID, oid);
        if (f) {
          getSheet(SHEET.ORDERS).deleteRow(f.rowNum);
          info('刪除測試訂單 ' + oid);
        }
      } catch(e) {}
    });
    // 清理帳本測試資料
    try {
      const accSheet = getSheet(SHEET.ACCOUNTS);
      const accRows3 = getRows(SHEET.ACCOUNTS);
      const ca2 = COL.ACCOUNTS;
      const toDelete = [];
      accRows3.forEach((r, i) => {
        if (String(r[ca2.ITEMS]).includes(testOrderId1) ||
            String(r[ca2.ITEMS]).includes(testOrderId2)) {
          toDelete.push(DATA_ROW + i);
        }
      });
      toDelete.reverse().forEach(rn => accSheet.deleteRow(rn));
      if (toDelete.length) info('刪除帳本測試資料 ' + toDelete.length + ' 筆');
    } catch(e) {}
    // 清理點數記錄
    try {
      const ptSheet = getSheet(SHEET.POINTS_LOG);
      const ptRows = getRows(SHEET.POINTS_LOG);
      const cp = COL.POINTS_LOG;
      const toDel = [];
      ptRows.forEach((r, i) => {
        if (String(r[cp.PHONE]) === TEST_PHONE &&
            (String(r[cp.NOTE]).includes(testOrderId1) || String(r[cp.NOTE]).includes(testOrderId2))) {
          toDel.push(DATA_ROW + i);
        }
      });
      toDel.reverse().forEach(rn => ptSheet.deleteRow(rn));
      if (toDel.length) info('刪除點數記錄 ' + toDel.length + ' 筆');
    } catch(e) {}
    info('清理完成');
  }

  const summary = errors.length === 0
    ? '✅ 全部通過（' + log.filter(l=>l.startsWith('✅')).length + ' 項）'
    : '⚠️ 有 ' + errors.length + ' 項失敗';
  log.unshift('=== 付款流程驗收測試 ' + summary + ' ===');
  Logger.log(log.join('\n'));
  return { ok: errors.length === 0, summary, log };
}

