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

// ── 團購模組工作表（v2.2 零欄位異動版）──────────────────────────
SHEET.GROUP_PRODUCT_SETTINGS = '團購商品設定表';
SHEET.GROUP_CAMPAIGNS        = '團購活動表';
SHEET.GROUP_PLEDGES          = '團購明細表';
SHEET.GROUP_LEADERS          = '團主來源表';
SHEET.GROUP_LEDGER           = '團購帳務表';

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

// ── 團購模組欄位索引（v2.2 零欄位異動版）─────────────────────────
COL.GROUP_PRODUCT_SETTINGS = {
  ID:0, PID:1, SUPPLIER:2, BASE_PRICE:3, MIN_GROUP_PRICE:4,
  COUNTS_THRESHOLD:5, SUPPORTS_GATHERING:6, STATUS:7, NOTE:8, UPDATED_AT:9
};
COL.GROUP_PRODUCT_SETTINGS.FIXED_RETAIL_PRICE     = 10;
COL.GROUP_PRODUCT_SETTINGS.REGULAR_PURCHASE_PRICE = 11;
COL.GROUP_PRODUCT_SETTINGS.LEADER_COMMISSION_RATE = 12;
COL.GROUP_PRODUCT_SETTINGS.PLATFORM_MIN_RATE      = 13;
COL.GROUP_PRODUCT_SETTINGS.TIERS_JSON             = 14;
COL.GROUP_PRODUCT_SETTINGS.SYSTEM_NOTE            = 15;
COL.GROUP_CAMPAIGNS = {
  ID:0, LEADER:1, PID:2, THRESHOLD_TYPE:3, MARKUP:4,
  DEADLINE:5, STATUS:6, GROUP_PRICE:7, BASE_SNAPSHOT:8,
  PICKUP_NOTE:9, CREATED:10
};
COL.GROUP_CAMPAIGNS.CAMPAIGN_NAME  = 11;
COL.GROUP_CAMPAIGNS.START_DATE     = 12;
COL.GROUP_CAMPAIGNS.THRESHOLD_QTY  = 13;
COL.GROUP_CAMPAIGNS.TIERS_SNAPSHOT = 14;
COL.GROUP_CAMPAIGNS.NOTE           = 15;
COL.GROUP_CAMPAIGNS.SYSTEM_NOTE    = 16;
COL.GROUP_PLEDGES = {
  ID:0, CID:1, CNAME:2, PHONE:3, LINE_UID:4,
  QTY:5, ORDER_ID:6, CREATED:7, STATUS:8, NOTE:9
};
COL.GROUP_PLEDGES.SYSTEM_NOTE   = 10;
COL.GROUP_PLEDGES.PICKUP_CODE   = 11;
COL.GROUP_PLEDGES.PICKUP_DATE   = 12;
COL.GROUP_PLEDGES.PICKUP_STATUS = 13;
COL.GROUP_PLEDGES.PICKED_UP_AT  = 14;
COL.GROUP_PLEDGES.PICKUP_NOTE   = 15;
COL.GROUP_LEADERS = {
  ID:0, PHONE:1, NAME:2, LEVEL:3,
  APPROVE_METHOD:4, APPROVE_DATE:5,
  NO_SHOW_COUNT:6, BUY_STATUS:7,
  SOURCE_LEADER:8, FIRST_LED_AT:9,
  LINE_UID:10, NOTE:11
};
COL.GROUP_LEADERS.SUSPENDED_AT     = 12;
COL.GROUP_LEADERS.SUSPENDED_REASON = 13;
COL.GROUP_LEADERS.OVERRIDE_UNTIL   = 14;
COL.GROUP_LEADERS.OVERRIDE_NOTE    = 15;
COL.GROUP_LEADERS.SYSTEM_NOTE      = 16;
COL.GROUP_LEDGER = {
  ID:0, ORDER_ID:1, CID:2, DATE:3, ROLE:4, TARGET:5,
  PID:6, PNAME:7, QTY:8, UNIT_PRICE:9, SUBTOTAL:10,
  STATUS:11, NOTE:12, CREATED:13
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
      'stockIn','stockOut','syncInventory','adjustInventory',
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
      'getGroupProductSettings','saveGroupProductSetting',
      'getGroupCampaigns',
      'createGroupCampaign','updateGroupCampaign','adminCloseGroupCampaign',
      'getGroupPickupList','markGroupPledgePickedUp','markGroupPledgeNoShow',
      'markGroupPledgeNotified','updateGroupPledgePickupInfo',
      'getGroupCustomerRiskList','updateGroupCustomerStatus',
      'manualOverrideGroupCustomer','resetGroupCustomerNoShow',
      'adminSetLeaderToken',
      'adminCreateLeaderSetupLink',
      'adminSuspendGroupLeader',
      'adminRestoreGroupLeader',
      'adminCreateGroupLeader'
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
      case 'adjustInventory':    return res(adjustInventory(p));

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
      case 'getGroupProductSettings':  return res(getGroupProductSettings());
      case 'saveGroupProductSetting':  return res(saveGroupProductSetting(p));
      case 'getGroupCampaigns':        return res(getGroupCampaigns());
      case 'createGroupCampaign':      return res(createGroupCampaign(p));
      case 'updateGroupCampaign':      return res(updateGroupCampaign(p));
      case 'adminCloseGroupCampaign':  return res(adminCloseGroupCampaign(p));
      case 'createGroupPledge':           return res(createGroupPledge(p));
      case 'getGroupPickupList':          return res(getGroupPickupList(p));
      case 'markGroupPledgePickedUp':     return res(markGroupPledgePickedUp(p));
      case 'markGroupPledgeNoShow':       return res(markGroupPledgeNoShow(p));
      case 'markGroupPledgeNotified':     return res(markGroupPledgeNotified(p));
      case 'updateGroupPledgePickupInfo': return res(updateGroupPledgePickupInfo(p));
      case 'getGroupCustomerRiskList':    return res(getGroupCustomerRiskList(p));
      case 'updateGroupCustomerStatus':   return res(updateGroupCustomerStatus(p));
      case 'manualOverrideGroupCustomer': return res(manualOverrideGroupCustomer(p));
      case 'resetGroupCustomerNoShow':    return res(resetGroupCustomerNoShow(p));
      case 'getGroupCampaignPublic':      return res(getGroupCampaignPublic(p));

      case 'leaderLogin':              return res(leaderLogin(p));
      case 'getLeaderCampaigns':       return res(getLeaderCampaigns(p));
      case 'getLeaderCampaignPledges': return res(getLeaderCampaignPledges(p));
      case 'adminSetLeaderToken':           return res(adminSetLeaderToken(p));

      case 'getSystemConfig':               return res(getSystemConfig(p));
      case 'validateLeaderSetupToken':      return res(validateLeaderSetupToken(p));
      case 'completeLeaderSetup':           return res(completeLeaderSetup(p));
      case 'adminCreateLeaderSetupLink':    return res(adminCreateLeaderSetupLink(p));
      case 'adminSuspendGroupLeader':       return res(adminSuspendGroupLeader(p));
      case 'adminRestoreGroupLeader':       return res(adminRestoreGroupLeader(p));
      case 'adminCreateGroupLeader':        return res(adminCreateGroupLeader(p));

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

function ym_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM');
  return String(v || '').slice(0, 7);
}

function ymd_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
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
  const rows = getRows(SHEET.PRODUCTS);
  const c = COL.PRODUCTS;
  const code = (p.code || '').trim();
  const name = (p.name || '').trim();
  const category = (p.category || '').trim();
  if (code) {
    const dup = rows.find(r =>
      String(r[c.CODE] || '').trim() === code &&
      String(r[c.STATUS] || '') !== '停用'
    );
    if (dup) return { ok: false, error: '商品代碼已存在，請勿重複新增' };
  } else {
    const dup = rows.find(r =>
      String(r[c.NAME] || '').trim() === name &&
      String(r[c.CATEGORY] || '').trim() === category &&
      String(r[c.STATUS] || '') !== '停用'
    );
    if (dup) return { ok: false, error: '同分類已有相同商品名稱，請勿重複新增' };
  }
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

function adjustInventory(p) {
  var VALID_REASONS = ['audit', 'test_fix', 'loss', 'self_use', 'gift', 'other'];
  var productId = String(p.product_id || '').trim();
  var newQty    = p.new_qty;
  var reason    = String(p.reason || '').trim();
  var note      = String(p.note || '').trim();

  if (!productId) return { ok: false, error: 'missing product_id' };
  if (newQty === undefined || newQty === null || newQty === '') return { ok: false, error: 'missing new_qty' };
  newQty = Number(newQty);
  if (!Number.isInteger(newQty) || newQty < 0) return { ok: false, error: 'new_qty must be non-negative integer' };
  if (VALID_REASONS.indexOf(reason) === -1) return { ok: false, error: 'invalid reason' };

  var opId     = genId('ADJ');
  var logId    = genId('SLOG');
  var invSheet = getSheet(SHEET.INVENTORY);
  var ci       = COL.INVENTORY;

  var lock = _acquireLock_();
  if (!lock) return { ok: false, error: 'system busy, please retry' };
  try {
    var invRows = invSheet.getDataRange().getValues();
    var rowIdx  = -1;
    for (var i = 1; i < invRows.length; i++) {
      if (String(invRows[i][ci.ID]) === productId) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return { ok: false, error: 'product not found' };

    var productName = invRows[rowIdx][ci.NAME];
    var oldQty      = Number(invRows[rowIdx][ci.QTY]) || 0;
    var diff        = newQty - oldQty;
    if (diff === 0) return { ok: false, error: 'no change in qty' };

    var dataRow = rowIdx + 1;
    invSheet.getRange(dataRow, ci.QTY      + 1).setValue(newQty);
    invSheet.getRange(dataRow, ci.UPDATED  + 1).setValue(now());
    invSheet.getRange(dataRow, ci.LAST_OP_ID + 1).setValue(opId);

    var noteText = '[ADJUST:' + reason + '] ' + oldQty + ' -> ' + newQty +
                   ' (diff ' + (diff >= 0 ? '+' : '') + diff + ')' +
                   (note ? ' ' + note : '');
    getSheet(SHEET.STOCK_LOG).appendRow([
      logId,
      productId,
      productName,
      'adjust',
      diff,
      '',
      'stock-adjust',
      noteText,
      now(),
      'ADJUST:' + opId
    ]);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, product_id: productId, old_qty: oldQty, new_qty: newQty, diff: diff, reason: reason };
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
// 不是安全驗證，只是防誤打，任何知道此 token 的前端都能呼叫
const PLEDGE_TOKEN = 'YC_GROUP_PLEDGE_SUBMIT_2026';

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

  // ── 銷售類型 ──
  var SALE_TYPE_MAP = {
    normal:   { accType: '現場銷售',     income: true  },
    other:    { accType: '其他現場收款', income: true  },
    self_use: { accType: '自用取貨',     income: false },
    gift:     { accType: '贈送',         income: false },
    sample:   { accType: '試用品',       income: false }
  };
  var saleType = SALE_TYPE_MAP[p.sale_type] ? p.sale_type : 'normal';
  var saleRule = SALE_TYPE_MAP[saleType];

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
  var bookedTotal = saleRule.income ? total : 0;  // 非營收類型（贈送/自用/試用）帳務金額為 0

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
      itemsForStorage, bookedTotal, pmt,
      '處理中', '[sale_type:'+saleType+'] '+(p.note||''), now(),
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
      date: today(), type: saleRule.accType,
      partner: p.customer_name||'現場客人',
      items: saleRule.accType + ' ' + orderId,
      income: saleRule.income ? total : 0, expense: '',
      payment: pmt,
      status: '已收款',
      note: '[POS:'+orderId+']['+saleType+']'+(discount>0?' 折扣NT$'+discount:'')
    });
    if (!accResult.ok) throw new Error('帳本寫入失敗：'+(accResult.error||''));
    completedSteps.push('account_written');

    // Step 4: 訂單改已完成
    os.getRange(orderRowNum, c.STATUS+1).setValue('已完成');
    completedSteps.push('order_completed');

    try { refreshBalance(); } catch(e) {}

    // Step 5: 加點（訂單確認後執行；失敗只記錄 points_skipped，不 rollback 主交易）
    var pointsAdded = 0;
    if (p.phone && total > 0 && saleType === 'normal') {
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
             total:bookedTotal, original_total:total, points_added:pointsAdded, completed_steps:completedSteps };

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
  if (p.month)  list = list.filter(x => {
    var d = x.date;
    var s = (d instanceof Date)
      ? Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd')
      : String(d || '');
    return s.startsWith(p.month);
  });
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
  try { refreshBalance(); } catch(e) {}
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
  try { refreshBalance(); } catch(e) {}
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
        if (ym_(r[c.DATE]) === thisMonth) {
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
  const lookupPhone = p.original_phone || p.phone;
  if (!lookupPhone) return { ok: false, error: '\u7f3a\u5c11\u624b\u6a5f\u865f\u78bc' };

  const rows = getRows(SHEET.MEMBERS);
  const c = COL.MEMBERS;
  let targetIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][c.PHONE]) === String(lookupPhone)) {
      targetIdx = i;
      break;
    }
  }

  if (targetIdx === -1) return { ok: false, error: '\u627e\u4e0d\u5230\u6703\u54e1' };

  if (p.phone && String(p.phone) !== String(lookupPhone)) {
    for (let i = 0; i < rows.length; i++) {
      if (i !== targetIdx && String(rows[i][c.PHONE]) === String(p.phone)) {
        return { ok: false, error: '\u624b\u6a5f\u865f\u78bc\u5df2\u88ab\u5176\u4ed6\u6703\u54e1\u4f7f\u7528' };
      }
    }
  }

  const sheet = getSheet(SHEET.MEMBERS);
  const rn = DATA_ROW + targetIdx;

  if (p.name     !== undefined) sheet.getRange(rn, c.NAME+1).setValue(p.name);
  if (p.phone    !== undefined) sheet.getRange(rn, c.PHONE+1).setValue(p.phone);
  if (p.birthday !== undefined) sheet.getRange(rn, c.BIRTHDAY+1).setValue(p.birthday);
  if (p.note     !== undefined) sheet.getRange(rn, c.NOTE+1).setValue(p.note);

  return { ok: true };
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
    if (!r[c.ID] || ym_(r[c.CREATED]) !== month) return;
    if (r[c.STATUS] === '已取消') { cancelCount++; return; }
    if (!['已付款','已完成'].includes(String(r[c.STATUS]))) { pendingCount++; return; }
    orderCount++;
    revenue += Number(r[c.TOTAL]) || 0;
    try {
      const note = String(r[c.NOTE] || '');
      const isNonRevenuePos =
        note.includes('[sale_type:self_use]') ||
        note.includes('[sale_type:gift]') ||
        note.includes('[sale_type:sample]');
      JSON.parse(r[c.ITEMS] || '[]').forEach(it => {
        if (!productSales[it.product_id]) productSales[it.product_id] = { name: it.name, qty: 0, revenue: 0 };
        productSales[it.product_id].qty += Number(it.qty) || 0;
        const itemRevenue = isNonRevenuePos ? 0 : (Number(it.price)||0) * (Number(it.qty)||0);
        productSales[it.product_id].revenue += itemRevenue;
      });
    } catch(e) {}
  });

  // 進貨成本 + 手動其他收入/支出
  const accounts = getRows(SHEET.ACCOUNTS);
  const ca = COL.ACCOUNTS;
  let cost = 0;
  const _OI = new Set(['其他收入', '其他現場收款']);
  const _OE = new Set(['其他支出', '雜項支出']);
  accounts.forEach(r => {
    if (ym_(r[ca.DATE]) !== month) return;
    const status = String(r[ca.STATUS] || '').trim();
    if (status === '已作廢') return;
    const type = String(r[ca.TYPE] || '').trim();
    if (type === '進貨付款' && status === '已付款') {
      cost += Number(r[ca.EXPENSE]) || 0;
    } else if (_OI.has(type) && status === '已收款') {
      revenue += Number(r[ca.INCOME]) || 0;
    } else if (_OE.has(type) && status === '已付款') {
      cost += Number(r[ca.EXPENSE]) || 0;
    }
    // '銷售收款' 不計入：ORDERS 已算，避免重複
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
    if (ymd_(r[c.CREATED]) < cutStr) return;
    try {
      const note = String(r[c.NOTE] || '');
      const isNonRevenue =
        note.includes('[sale_type:self_use]') ||
        note.includes('[sale_type:gift]') ||
        note.includes('[sale_type:sample]');
      JSON.parse(r[c.ITEMS] || '[]').forEach(it => {
        if (!rank[it.product_id]) rank[it.product_id] = { name: it.name||it.product_id, qty: 0, revenue: 0 };
        rank[it.product_id].qty     += Number(it.qty) || 0;
        rank[it.product_id].revenue += isNonRevenue ? 0 : (Number(it.price)||0) * (Number(it.qty)||0);
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
  const msg    = `📊 ${pMonth} 月結報表\n訂單數：${r.order_count}（取消 ${r.cancel_count}）\n收入：NT$ ${Number(r.revenue).toLocaleString()}\n進貨成本：NT$ ${Number(r.cost).toLocaleString()}\n淨收支：NT$ ${Number(r.profit).toLocaleString()}\n\n熱銷商品 Top 3：\n${(r.top_products||[]).slice(0,3).map((x,i)=>`${i+1}. ${x.name}（${x.qty}件）`).join('\n')||'—'}\n\n報表產生時間：${now()}`;
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
// 團購模組初始化：建立 5 張全新工作表（v2.2 零欄位異動版）
// 在 GAS 編輯器選此函式點「執行」，只需執行一次
// 不修改任何既有 9 張表，不 append 既有表欄位
// ================================================================
function adminSetupGroupBuy() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const log = [];

  function ensureGroupBuySheet_(sheetName, zhHeaders, enHeaders) {
    let s = ss.getSheetByName(sheetName);
    if (!s) {
      s = ss.insertSheet(sheetName);
      log.push('建立工作表：' + sheetName);
    } else {
      log.push('工作表已存在，略過建立：' + sheetName);
    }
    // row 1：英文欄名（供程式碼對照）
    s.getRange(1, 1, 1, enHeaders.length).setValues([enHeaders]);
    // row 2：中文欄名（供人工查閱）
    s.getRange(2, 1, 1, zhHeaders.length).setValues([zhHeaders]);
    log.push(sheetName + ' 表頭寫入完成');
  }

  ensureGroupBuySheet_(
    SHEET.GROUP_PRODUCT_SETTINGS,
    ['記錄ID','商品ID','供應方','底價','最低開團售價','計入團長門檻','適用集單模式','狀態','備註','更新時間'],
    ['id','product_id','supplier','base_price','min_group_price','counts_toward_threshold','supports_group_gathering','status','note','updated_at']
  );

  ensureGroupBuySheet_(
    SHEET.GROUP_CAMPAIGNS,
    ['活動ID','團長','商品ID','門檻類型','固定加價','截止時間','狀態','最終開團售價','底價快照','取貨備註','建立時間'],
    ['id','leader','product_id','threshold_type','markup','deadline','status','group_price','base_price_snapshot','pickup_note','created_at']
  );

  ensureGroupBuySheet_(
    SHEET.GROUP_PLEDGES,
    ['登記ID','活動ID','客人姓名','電話','LINE User ID','數量','訂單ID','登記時間','狀態','備註'],
    ['id','campaign_id','cname','phone','line_uid','qty','order_id','created_at','status','note']
  );

  ensureGroupBuySheet_(
    SHEET.GROUP_LEADERS,
    ['記錄ID','會員電話','姓名','會員等級','核准方式','核准日期','未取貨次數','團購資格狀態','來源團長','首次帶入時間','LINE User ID','備註'],
    ['id','phone','name','member_level','approve_method','approve_date','no_show_count','group_buy_status','source_leader','first_led_at','line_uid','note']
  );

  ensureGroupBuySheet_(
    SHEET.GROUP_LEDGER,
    ['記錄ID','訂單ID','活動ID','日期','角色','對象','商品ID','商品名稱','數量','單價','小計金額','狀態','備註','建立時間'],
    ['id','order_id','campaign_id','date','role','target','product_id','product_name','qty','unit_price','subtotal','status','note','created_at']
  );

  Logger.log(log.join('\n'));
  return { ok: true, log };
}

// ================================================================
// 團購模組 — 商品設定 CRUD（v2.2 零欄位異動版，3B 定價擴充）
// ================================================================

function parseTiersJson_(raw) {
  var def = [
    {qty:1,  purchase_price:'', retail_price:''},
    {qty:10, purchase_price:'', retail_price:''},
    {qty:20, purchase_price:'', retail_price:''}
  ];
  if (!raw) return def;
  try   { return JSON.parse(String(raw)); }
  catch (e) { return def; }
}

function validateTiers_(tiersInput, leaderRate, platformMinRate) {
  var tiers;
  try {
    tiers = typeof tiersInput === 'string'
            ? JSON.parse(tiersInput)
            : (tiersInput || []);
  } catch(e) {
    return { ok: false, error: '階梯格式錯誤，請重新填寫' };
  }
  if (!Array.isArray(tiers)) return { ok: false, error: '階梯格式錯誤' };

  var validatedTiers = [];

  for (var i = 0; i < tiers.length; i++) {
    var t      = tiers[i];
    var hasQty = (t.qty            !== '' && t.qty            !== null && t.qty            !== undefined);
    var hasPP  = (t.purchase_price !== '' && t.purchase_price !== null && t.purchase_price !== undefined);
    var hasRP  = (t.retail_price   !== '' && t.retail_price   !== null && t.retail_price   !== undefined);
    var hasAny = hasQty || hasPP || hasRP;
    var hasAll = hasQty && hasPP && hasRP;

    if (!hasAny) continue;

    if (!hasAll) {
      var missing = [];
      if (!hasQty) missing.push('起始數量');
      if (!hasPP)  missing.push('進貨價');
      if (!hasRP)  missing.push('售價');
      return { ok: false, error: '第' + (i + 1) + '階梯尚未填寫完整，缺少：' + missing.join('、') };
    }

    var qty = Number(t.qty);
    if (isNaN(qty) || qty < 1 || Math.floor(qty) !== qty)
      return { ok: false, error: '第' + (i + 1) + '階梯起始數量必須是 >= 1 的整數' };

    var pp = Number(t.purchase_price);
    var rp = Number(t.retail_price);
    if (isNaN(pp) || pp < 0)
      return { ok: false, error: '第' + (i + 1) + '階梯進貨價格式錯誤' };
    if (isNaN(rp) || rp <= 0)
      return { ok: false, error: '第' + (i + 1) + '階梯售價格式錯誤' };
    if (rp < pp)
      return { ok: false, error: '第' + (i + 1) + '階梯售價（' + rp + '）不得低於進貨價（' + pp + '）' };

    var margin     = rp - pp;
    var marginRate = margin / rp;
    var platRetain = margin * (1 - leaderRate);
    var platRate   = margin > 0 ? platRetain / margin : 0;

    if (marginRate < 0.10)
      return { ok: false, error: '第' + (i + 1) + '階梯毛利率 ' +
               (marginRate * 100).toFixed(1) + '%，低於 10% 禁止儲存' };
    if (platRate < platformMinRate)
      return { ok: false, error: '第' + (i + 1) + '階梯平台保留 ' +
               (platRate * 100).toFixed(1) + '%，低於最低要求 ' +
               (platformMinRate * 100).toFixed(0) + '%' };

    validatedTiers.push({ qty: qty, purchase_price: pp, retail_price: rp });
  }

  if (validatedTiers.length > 1) {
    var qtys   = validatedTiers.map(function(x) { return x.qty; });
    var qtySet = {};
    for (var j = 0; j < qtys.length; j++) {
      if (qtySet[qtys[j]])
        return { ok: false, error: '階梯起始數量不可重複（' + qtys[j] + ' 出現兩次）' };
      qtySet[qtys[j]] = true;
    }
    for (var k = 1; k < qtys.length; k++) {
      if (qtys[k] <= qtys[k - 1])
        return { ok: false, error: '階梯 ' + (k + 1) + ' 起始數量（' + qtys[k] +
                 '）必須大於階梯 ' + k + '（' + qtys[k - 1] + '）' };
    }
  }

  return { ok: true, tiers: validatedTiers };
}

function getGroupProductSettings() {
  const rows = getRows(SHEET.GROUP_PRODUCT_SETTINGS);
  const c    = COL.GROUP_PRODUCT_SETTINGS;
  const list = rows.map(r => ({
    id:                       String(r[c.ID]),
    product_id:               String(r[c.PID]),
    supplier:                 r[c.SUPPLIER],
    base_price:               r[c.BASE_PRICE],
    min_group_price:          r[c.MIN_GROUP_PRICE],
    counts_toward_threshold:  r[c.COUNTS_THRESHOLD],
    supports_group_gathering: r[c.SUPPORTS_GATHERING],
    status:                   r[c.STATUS],
    note:                     r[c.NOTE],
    updated_at:               r[c.UPDATED_AT],
    fixed_retail_price:       (r[c.FIXED_RETAIL_PRICE]     !== undefined) ? r[c.FIXED_RETAIL_PRICE]     : '',
    regular_purchase_price:   (r[c.REGULAR_PURCHASE_PRICE] !== undefined) ? r[c.REGULAR_PURCHASE_PRICE] : '',
    leader_commission_rate:   (r[c.LEADER_COMMISSION_RATE] !== '' && r[c.LEADER_COMMISSION_RATE] !== undefined)
                              ? Number(r[c.LEADER_COMMISSION_RATE]) : 0.25,
    platform_min_rate:        (r[c.PLATFORM_MIN_RATE] !== '' && r[c.PLATFORM_MIN_RATE] !== undefined)
                              ? Number(r[c.PLATFORM_MIN_RATE]) : 0.50,
    tiers:                    parseTiersJson_(r[c.TIERS_JSON]),
    system_note:              r[c.SYSTEM_NOTE] || ''
  })).filter(x => x.id);
  return { ok: true, data: list };
}

function saveGroupProductSetting(p) {
  if (!p.product_id) return { ok: false, error: '缺少 product_id' };

  const basePrice = Number(p.base_price);
  if (p.base_price === undefined || p.base_price === '' || isNaN(basePrice) || basePrice < 0)
    return { ok: false, error: 'base_price 必須是 >= 0 的數字' };

  if (p.min_group_price !== undefined && p.min_group_price !== '') {
    const mgp = Number(p.min_group_price);
    if (isNaN(mgp) || mgp < basePrice)
      return { ok: false, error: 'min_group_price 必須 >= base_price（' + basePrice + '）' };
  }

  const validYN     = ['是', '否'];
  const validStatus = ['啟用', '停用'];
  if (p.counts_toward_threshold  && !validYN.includes(p.counts_toward_threshold))
    return { ok: false, error: 'counts_toward_threshold 只允許：是 / 否' };
  if (p.supports_group_gathering && !validYN.includes(p.supports_group_gathering))
    return { ok: false, error: 'supports_group_gathering 只允許：是 / 否' };
  if (p.status && !validStatus.includes(p.status))
    return { ok: false, error: 'status 只允許：啟用 / 停用' };

  const leaderRate = (p.leader_commission_rate !== undefined && p.leader_commission_rate !== '')
                     ? Number(p.leader_commission_rate) : 0.25;
  const platformMinRate = (p.platform_min_rate !== undefined && p.platform_min_rate !== '')
                          ? Number(p.platform_min_rate) : 0.50;
  if (isNaN(leaderRate) || leaderRate < 0 || leaderRate >= 1)
    return { ok: false, error: 'leader_commission_rate 必須介於 0 和 1 之間（例：0.25）' };
  if (isNaN(platformMinRate) || platformMinRate < 0 || platformMinRate >= 1)
    return { ok: false, error: 'platform_min_rate 必須介於 0 和 1 之間（例：0.50）' };

  const tiersResult = validateTiers_(p.tiers_json, leaderRate, platformMinRate);
  if (!tiersResult.ok) return { ok: false, error: tiersResult.error };
  const tiersJson = JSON.stringify(tiersResult.tiers);

  const minGP = (p.min_group_price !== undefined && p.min_group_price !== '')
                ? Number(p.min_group_price)
                : basePrice;

  const lock = _acquireLock_();
  try {
    const c        = COL.GROUP_PRODUCT_SETTINGS;
    const existing = findRow(SHEET.GROUP_PRODUCT_SETTINGS, c.PID, p.product_id);
    const ts       = now();

    if (existing) {
      const sheet    = getSheet(SHEET.GROUP_PRODUCT_SETTINGS);
      const rn       = existing.rowNum;
      sheet.getRange(rn, c.SUPPLIER           + 1).setValue(p.supplier || '自營');
      sheet.getRange(rn, c.BASE_PRICE         + 1).setValue(basePrice);
      sheet.getRange(rn, c.MIN_GROUP_PRICE    + 1).setValue(minGP);
      sheet.getRange(rn, c.COUNTS_THRESHOLD   + 1).setValue(p.counts_toward_threshold  || '否');
      sheet.getRange(rn, c.SUPPORTS_GATHERING + 1).setValue(p.supports_group_gathering || '否');
      sheet.getRange(rn, c.STATUS             + 1).setValue(p.status || '啟用');
      sheet.getRange(rn, c.NOTE               + 1).setValue(p.note   || '');
      sheet.getRange(rn, c.UPDATED_AT         + 1).setValue(ts);
      sheet.getRange(rn, c.FIXED_RETAIL_PRICE     + 1).setValue(p.fixed_retail_price     || '');
      sheet.getRange(rn, c.REGULAR_PURCHASE_PRICE + 1).setValue(p.regular_purchase_price || '');
      sheet.getRange(rn, c.LEADER_COMMISSION_RATE + 1).setValue(leaderRate);
      sheet.getRange(rn, c.PLATFORM_MIN_RATE      + 1).setValue(platformMinRate);
      sheet.getRange(rn, c.TIERS_JSON             + 1).setValue(tiersJson);
      const oldNote  = String(sheet.getRange(rn, c.SYSTEM_NOTE + 1).getValue() || '');
      const newEntry = '管理員更新定價設定 ' + ts;
      sheet.getRange(rn, c.SYSTEM_NOTE + 1).setValue(oldNote ? (oldNote + '\n' + newEntry) : newEntry);
      return { ok: true, action: 'updated', id: String(existing.row[c.ID]) };
    } else {
      const id      = genId('GPS');
      const sysNote = '管理員新增定價設定 ' + ts;
      getSheet(SHEET.GROUP_PRODUCT_SETTINGS).appendRow([
        id, p.product_id,
        p.supplier || '自營',
        basePrice, minGP,
        p.counts_toward_threshold  || '否',
        p.supports_group_gathering || '否',
        p.status || '啟用',
        p.note   || '',
        ts,
        p.fixed_retail_price     || '',
        p.regular_purchase_price || '',
        leaderRate,
        platformMinRate,
        tiersJson,
        sysNote
      ]);
      return { ok: true, action: 'created', id };
    }
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// 團購模組 — GROUP_PRODUCT_SETTINGS v2 遷移（執行一次）
// 補充欄 11-16 表頭；資料列只補空值，不覆蓋既有非空值
// ================================================================
function adminMigrateGroupProductSettingsV2() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.GROUP_PRODUCT_SETTINGS);
  if (!sheet) return { ok: false, error: '找不到團購商品設定表' };
  var log = [];

  // ── Step 1a：GROUP_PRODUCT_SETTINGS 補充欄 11-16 表頭（row1=英文，row2=中文）──
  var enNew = ['fixed_retail_price','regular_purchase_price',
               'leader_commission_rate','platform_min_rate','tiers_json','system_note'];
  var zhNew = ['固定終端售價','一般進貨價','團長分潤比例','平台最低保留比例','階梯價格','系統備註'];
  sheet.getRange(1, 11, 1, 6).setValues([enNew]);
  sheet.getRange(2, 11, 1, 6).setValues([zhNew]);
  log.push('GROUP_PRODUCT_SETTINGS 欄 11-16 表頭補充完成');

  // ── Step 1b：修正 5 張表的 row1/row2 全部表頭（現有資料不動）──
  var headerFixes = [
    {
      name: SHEET.GROUP_PRODUCT_SETTINGS,
      en: ['id','product_id','supplier','base_price','min_group_price',
           'counts_toward_threshold','supports_group_gathering','status','note','updated_at',
           'fixed_retail_price','regular_purchase_price',
           'leader_commission_rate','platform_min_rate','tiers_json','system_note'],
      zh: ['記錄ID','商品ID','供應方','底價','最低開團售價',
           '計入團長門檻','適用集單模式','狀態','備註','更新時間',
           '固定終端售價','一般進貨價','團長分潤比例','平台最低保留比例','階梯價格','系統備註']
    },
    {
      name: SHEET.GROUP_CAMPAIGNS,
      en: ['id','leader','product_id','threshold_type','markup',
           'deadline','status','group_price','base_price_snapshot','pickup_note','created_at'],
      zh: ['活動ID','團長','商品ID','門檻類型','固定加價',
           '截止時間','狀態','最終開團售價','底價快照','取貨備註','建立時間']
    },
    {
      name: SHEET.GROUP_PLEDGES,
      en: ['id','campaign_id','cname','phone','line_uid',
           'qty','order_id','created_at','status','note'],
      zh: ['登記ID','活動ID','客人姓名','電話','LINE User ID',
           '數量','訂單ID','登記時間','狀態','備註']
    },
    {
      name: SHEET.GROUP_LEADERS,
      en: ['id','phone','name','member_level','approve_method',
           'approve_date','no_show_count','group_buy_status',
           'source_leader','first_led_at','line_uid','note'],
      zh: ['記錄ID','會員電話','姓名','會員等級','核准方式',
           '核准日期','未取貨次數','團購資格狀態',
           '來源團長','首次帶入時間','LINE User ID','備註']
    },
    {
      name: SHEET.GROUP_LEDGER,
      en: ['id','order_id','campaign_id','date','role',
           'target','product_id','product_name','qty','unit_price',
           'subtotal','status','note','created_at'],
      zh: ['記錄ID','訂單ID','活動ID','日期','角色',
           '對象','商品ID','商品名稱','數量','單價',
           '小計金額','狀態','備註','建立時間']
    }
  ];
  headerFixes.forEach(function(spec) {
    var s = ss.getSheetByName(spec.name);
    if (!s) { log.push('找不到工作表，略過：' + spec.name); return; }
    s.getRange(1, 1, 1, spec.en.length).setValues([spec.en]);
    s.getRange(2, 1, 1, spec.zh.length).setValues([spec.zh]);
    log.push(spec.name + ' row1/row2 表頭已修正（英文/中文）');
  });

  var defaultTiers = JSON.stringify([
    {qty:1,  purchase_price:'', retail_price:''},
    {qty:10, purchase_price:'', retail_price:''},
    {qty:20, purchase_price:'', retail_price:''}
  ]);
  var ts      = now();
  var lastRow = sheet.getLastRow();
  var filled  = 0;
  for (var row = DATA_ROW; row <= lastRow; row++) {
    var vals        = sheet.getRange(row, 11, 1, 6).getValues()[0];
    var leaderVal   = (vals[2] !== '' && vals[2] !== null) ? vals[2] : 0.25;
    var platformVal = (vals[3] !== '' && vals[3] !== null) ? vals[3] : 0.50;
    var tiersVal    = (vals[4] !== '' && vals[4] !== null) ? vals[4] : defaultTiers;
    var sysNoteVal  = (vals[5] !== '' && vals[5] !== null)
                      ? vals[5] : ('系統遷移回填預設值 ' + ts);
    sheet.getRange(row, 13).setValue(leaderVal);
    sheet.getRange(row, 14).setValue(platformVal);
    sheet.getRange(row, 15).setValue(tiersVal);
    sheet.getRange(row, 16).setValue(sysNoteVal);
    filled++;
  }
  log.push('資料列回填完成：' + filled + ' 列（只補空值）');

  Logger.log(log.join('\n'));
  return { ok: true, log: log };
}

// ================================================================
// 團購模組 — GROUP_CAMPAIGNS v4 遷移（執行一次）
// 只補充 GROUP_CAMPAIGNS row1/row2 的 col 12-17 表頭
// 不碰 row3+，不改既有 14 張表，不清空，不刪列
// ================================================================
function adminMigrateGroupCampaignsV4() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.GROUP_CAMPAIGNS);
  if (!sheet) return { ok: false, error: '找不到團購活動表' };
  var log = [];

  var enNew = ['campaign_name','start_date','threshold_qty','tiers_snapshot_json','note','system_note'];
  var zhNew = ['活動名稱','開始日期','目標數量','階梯快照','備註','系統記錄'];

  sheet.getRange(1, 12, 1, 6).setValues([enNew]);
  sheet.getRange(2, 12, 1, 6).setValues([zhNew]);
  log.push('GROUP_CAMPAIGNS col 12-17 表頭補充完成（row1=英文, row2=中文）');
  log.push('row3+ 資料列未異動；既有 14 張表未異動');

  Logger.log(log.join('\n'));
  return { ok: true, log: log };
}

// ================================================================
// 團購模組 — 活動列表（含各活動有效登記數量）
// ================================================================
function getGroupCampaigns() {
  var rows    = getRows(SHEET.GROUP_CAMPAIGNS);
  var c       = COL.GROUP_CAMPAIGNS;
  var pledges = getRows(SHEET.GROUP_PLEDGES);
  var pc      = COL.GROUP_PLEDGES;

  var qtyMap = {};
  pledges.forEach(function(r) {
    var cid    = String(r[pc.CID]    || '');
    var status = String(r[pc.STATUS] || '');
    var qty    = Number(r[pc.QTY])   || 0;
    if (cid && status === '有效') qtyMap[cid] = (qtyMap[cid] || 0) + qty;
  });

  var list = rows.map(function(r) {
    var id = String(r[c.ID] || '');
    if (!id) return null;
    return {
      id:                  id,
      leader:              String(r[c.LEADER]         || ''),
      product_id:          String(r[c.PID]            || ''),
      threshold_type:      String(r[c.THRESHOLD_TYPE] || ''),
      markup:              Number(r[c.MARKUP])         || 0,
      deadline:            r[c.DEADLINE]               || '',
      status:              String(r[c.STATUS]          || ''),
      group_price:         r[c.GROUP_PRICE]            || '',
      base_price_snapshot: r[c.BASE_SNAPSHOT]          || '',
      pickup_note:         String(r[c.PICKUP_NOTE]     || ''),
      created_at:          r[c.CREATED]                || '',
      campaign_name:       String(r[c.CAMPAIGN_NAME]  !== undefined ? r[c.CAMPAIGN_NAME]  : ''),
      start_date:          r[c.START_DATE]             !== undefined ? r[c.START_DATE]     : '',
      threshold_qty:       Number(r[c.THRESHOLD_QTY]) || 0,
      tiers_snapshot_json: String(r[c.TIERS_SNAPSHOT] !== undefined ? r[c.TIERS_SNAPSHOT] : ''),
      note:                String(r[c.NOTE]            !== undefined ? r[c.NOTE]            : ''),
      system_note:         String(r[c.SYSTEM_NOTE]     !== undefined ? r[c.SYSTEM_NOTE]     : ''),
      current_qty:         qtyMap[id] || 0
    };
  }).filter(Boolean);

  return { ok: true, data: list };
}

// ================================================================
// 團購模組 — 建立活動
// tiers_snapshot_json 立即快照，永不更新
// ================================================================
function createGroupCampaign(p) {
  if (!p.product_id)
    return { ok: false, error: '缺少 product_id' };
  if (!p.campaign_name || !String(p.campaign_name).trim())
    return { ok: false, error: '活動名稱不可空白' };
  if (!p.deadline)
    return { ok: false, error: '缺少截止時間' };

  var thresholdQty = Number(p.threshold_qty);
  if (isNaN(thresholdQty) || thresholdQty < 1 || Math.floor(thresholdQty) !== thresholdQty)
    return { ok: false, error: 'threshold_qty 必須是 >= 1 的整數' };

  var deadlineDate = new Date(p.deadline);
  if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date())
    return { ok: false, error: '截止時間必須晚於現在' };

  if (p.start_date) {
    var startD = new Date(p.start_date);
    if (isNaN(startD.getTime()))
      return { ok: false, error: 'start_date 格式錯誤' };
    if (startD > deadlineDate)
      return { ok: false, error: '開始日期不可晚於截止時間' };
  }

  var markup = (p.markup !== undefined && p.markup !== '') ? Number(p.markup) : 0;
  if (isNaN(markup) || markup < 0)
    return { ok: false, error: 'markup 不可為負數' };

  var validTypes = ['數量', '金額'];
  var thresholdType = p.threshold_type || '數量';
  if (!validTypes.includes(thresholdType))
    return { ok: false, error: 'threshold_type 只允許：數量 / 金額' };

  var setting = findRow(SHEET.GROUP_PRODUCT_SETTINGS, COL.GROUP_PRODUCT_SETTINGS.PID, p.product_id);
  if (!setting)
    return { ok: false, error: '找不到此商品的團購設定，請先完成定價設定' };

  var sr = setting.row;
  var sc = COL.GROUP_PRODUCT_SETTINGS;

  if (String(sr[sc.STATUS]) !== '啟用')
    return { ok: false, error: '此商品的團購設定為停用狀態，無法開團' };

  var supportsGathering = String(sr[sc.SUPPORTS_GATHERING]) === '是';
  if (supportsGathering && thresholdType !== '數量')
    return { ok: false, error: '集單模式只支援「數量」門檻類型' };

  var tiersRaw = sr[sc.TIERS_JSON];
  var parsedTiers;
  try   { parsedTiers = JSON.parse(String(tiersRaw || '[]')); }
  catch (e) { parsedTiers = []; }
  var validTiers = parsedTiers.filter(function(t) {
    return t.qty !== '' && t.qty !== null && t.qty !== undefined &&
           t.purchase_price !== '' && t.purchase_price !== null &&
           t.retail_price   !== '' && t.retail_price   !== null;
  });
  if (supportsGathering && validTiers.length === 0)
    return { ok: false, error: '適用集單模式的商品必須先設定有效的階梯定價' };

  var ts = now();
  var tiersSnapshot = JSON.stringify({
    snapshot_at:            ts,
    product_id:             p.product_id,
    supplier:               String(sr[sc.SUPPLIER]                || ''),
    base_price:             Number(sr[sc.BASE_PRICE])             || 0,
    min_group_price:        Number(sr[sc.MIN_GROUP_PRICE])        || 0,
    fixed_retail_price:     (sr[sc.FIXED_RETAIL_PRICE]     !== undefined && sr[sc.FIXED_RETAIL_PRICE]     !== '') ? Number(sr[sc.FIXED_RETAIL_PRICE])     : '',
    regular_purchase_price: (sr[sc.REGULAR_PURCHASE_PRICE] !== undefined && sr[sc.REGULAR_PURCHASE_PRICE] !== '') ? Number(sr[sc.REGULAR_PURCHASE_PRICE]) : '',
    leader_commission_rate: Number(sr[sc.LEADER_COMMISSION_RATE]) || 0.25,
    platform_min_rate:      Number(sr[sc.PLATFORM_MIN_RATE])      || 0.50,
    tiers:                  parsedTiers
  });

  var lock = _acquireLock_();
  try {
    var c       = COL.GROUP_CAMPAIGNS;
    var id      = genId('GC');
    var sdVal   = p.start_date || ts;
    var sysNote = '管理員建立活動 ' + ts;

    getSheet(SHEET.GROUP_CAMPAIGNS).appendRow([
      id,                              // 0  id
      p.leader || '幸福緣',             // 1  leader
      p.product_id,                    // 2  product_id
      thresholdType,                   // 3  threshold_type
      markup,                          // 4  markup
      p.deadline,                      // 5  deadline
      '集單中',                         // 6  status
      '',                              // 7  group_price（成團確認時才寫）
      '',                              // 8  base_price_snapshot（成團確認時才寫，舊欄位相容）
      p.pickup_note || '',             // 9  pickup_note
      ts,                              // 10 created_at
      String(p.campaign_name).trim(),  // 11 campaign_name
      sdVal,                           // 12 start_date（未填預設 created_at）
      thresholdQty,                    // 13 threshold_qty
      tiersSnapshot,                   // 14 tiers_snapshot_json（永不更新）
      p.note || '',                    // 15 note
      sysNote                          // 16 system_note
    ]);

    return { ok: true, action: 'created', id: id };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// 團購模組 — 更新活動（不得修改 tiers_snapshot_json）
// ================================================================
function updateGroupCampaign(p) {
  if (!p.id) return { ok: false, error: '缺少活動 ID' };

  var lock = _acquireLock_();
  try {
    var existing = findRow(SHEET.GROUP_CAMPAIGNS, COL.GROUP_CAMPAIGNS.ID, p.id);
    if (!existing) return { ok: false, error: '找不到活動 ID：' + p.id };

    var sheet = getSheet(SHEET.GROUP_CAMPAIGNS);
    var rn    = existing.rowNum;
    var c     = COL.GROUP_CAMPAIGNS;
    var ts    = now();

    if (String(existing.row[c.STATUS]) === '已下單')
      return { ok: false, error: '已下單狀態的活動不可編輯' };

    var newStart    = (p.start_date !== undefined) ? new Date(p.start_date)   : new Date(existing.row[c.START_DATE]);
    var newDeadline = (p.deadline   !== undefined) ? new Date(p.deadline)     : new Date(existing.row[c.DEADLINE]);
    if (!isNaN(newStart.getTime()) && !isNaN(newDeadline.getTime()) && newStart > newDeadline)
      return { ok: false, error: '開始日期不可晚於截止時間' };

    if (p.campaign_name !== undefined) {
      if (!String(p.campaign_name).trim()) return { ok: false, error: '活動名稱不可空白' };
      sheet.getRange(rn, c.CAMPAIGN_NAME + 1).setValue(String(p.campaign_name).trim());
    }
    if (p.start_date !== undefined) {
      if (p.start_date && isNaN(new Date(p.start_date).getTime()))
        return { ok: false, error: 'start_date 格式錯誤' };
      sheet.getRange(rn, c.START_DATE + 1).setValue(p.start_date || '');
    }
    if (p.deadline !== undefined) {
      if (!p.deadline || isNaN(new Date(p.deadline).getTime()))
        return { ok: false, error: '截止時間格式錯誤' };
      sheet.getRange(rn, c.DEADLINE + 1).setValue(p.deadline);
    }
    if (p.markup !== undefined) {
      var markup = Number(p.markup);
      if (isNaN(markup) || markup < 0) return { ok: false, error: 'markup 不可為負數' };
      sheet.getRange(rn, c.MARKUP + 1).setValue(markup);
    }
    if (p.pickup_note !== undefined)
      sheet.getRange(rn, c.PICKUP_NOTE + 1).setValue(p.pickup_note || '');
    if (p.note !== undefined)
      sheet.getRange(rn, c.NOTE + 1).setValue(p.note || '');
    // tiers_snapshot_json 明確排除，永不更新

    var oldSys  = String(sheet.getRange(rn, c.SYSTEM_NOTE + 1).getValue() || '');
    var newLine = '管理員編輯活動 ' + ts;
    sheet.getRange(rn, c.SYSTEM_NOTE + 1).setValue(oldSys ? (oldSys + '\n' + newLine) : newLine);

    return { ok: true, action: 'updated', id: p.id };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// 團購模組 — 結團 / 流團（只改 status + note + system_note）
// 本輪不寫 GROUP_LEDGER / 訂單 / 庫存 / 帳務
// ================================================================
function adminCloseGroupCampaign(p) {
  if (!p.id)     return { ok: false, error: '缺少活動 ID' };
  if (!p.action) return { ok: false, error: '缺少 action（close 或 cancel）' };
  if (!p.note || !String(p.note).trim())
    return { ok: false, error: '結團/流團備註必填' };
  if (!['close', 'cancel'].includes(p.action))
    return { ok: false, error: 'action 只允許：close（已成團）/ cancel（流團）' };

  var lock = _acquireLock_();
  try {
    var existing = findRow(SHEET.GROUP_CAMPAIGNS, COL.GROUP_CAMPAIGNS.ID, p.id);
    if (!existing) return { ok: false, error: '找不到活動 ID：' + p.id };

    var sheet = getSheet(SHEET.GROUP_CAMPAIGNS);
    var rn    = existing.rowNum;
    var c     = COL.GROUP_CAMPAIGNS;
    var ts    = now();

    var currentStatus = String(existing.row[c.STATUS]);
    if (['已下單', '已成團', '流團'].includes(currentStatus))
      return { ok: false, error: '此活動狀態（' + currentStatus + '）無法再次操作' };

    var newStatus  = p.action === 'close' ? '已成團' : '流團';
    var actionText = p.action === 'close' ? '管理員結團' : '管理員標記流團';

    sheet.getRange(rn, c.STATUS + 1).setValue(newStatus);
    sheet.getRange(rn, c.NOTE   + 1).setValue(String(p.note).trim());

    var oldSys  = String(sheet.getRange(rn, c.SYSTEM_NOTE + 1).getValue() || '');
    var newLine = actionText + ' ' + ts + '（備註：' + String(p.note).trim() + '）';
    sheet.getRange(rn, c.SYSTEM_NOTE + 1).setValue(oldSys ? (oldSys + '\n' + newLine) : newLine);

    return { ok: true, action: p.action, id: p.id, status: newStatus };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// 團購模組 — GROUP_PLEDGES v5A 遷移（GAS 編輯器手動執行一次）
// 補充 col 11 表頭（system_note），不碰 row3+，不改既有 14 張表
// ================================================================
function adminMigrateGroupPledgesV5A() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.GROUP_PLEDGES);
  if (!sheet) return { ok: false, error: '找不到團購明細表' };

  sheet.getRange(1, 11, 1, 1).setValues([['system_note']]);
  sheet.getRange(2, 11, 1, 1).setValues([['系統記錄']]);

  var log = [
    'GROUP_PLEDGES col 11 表頭補充完成（row1=英文, row2=中文）',
    'row3+ 資料列未異動',
    '既有 14 張表未異動'
  ];
  Logger.log(log.join('\n'));
  return { ok: true, log: log };
}

// ================================================================
// 電話正規化（Google Sheets appendRow 會把 '0900000001' 轉成數字 900000001）
// 統一處理：去空白、去前導單引號、9 位數補 0 → 回傳 09xxxxxxxx 格式
// ================================================================
function normalizePhone_(v) {
  var s = String(v || '').trim();
  if (s.charAt(0) === "'") s = s.slice(1);  // Sheets 可能附加前導單引號
  if (/^\d{9}$/.test(s)) s = '0' + s;       // Sheets 吃掉前導 0 → 補回
  return s;
}

// ================================================================
// 取貨日期驗證（格式 YYYY-MM-DD + 真實日期，防 2026-02-30）
// ================================================================
function isValidDateString_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var parts = s.split('-');
  var y  = parseInt(parts[0], 10);
  var m  = parseInt(parts[1], 10);
  var d  = parseInt(parts[2], 10);
  var dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// ================================================================
// 5-C：防 UTC 解析 — 將 YYYY-MM-DD 字串轉為本地午夜 Date
// ================================================================
function parseYmdDateLocal_(s) {
  if (!isValidDateString_(s)) return null;
  var parts = s.split('-');
  var y  = parseInt(parts[0], 10);
  var m  = parseInt(parts[1], 10);
  var d  = parseInt(parts[2], 10);
  var dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

// ================================================================
// 5-C：覆蓋期是否有效（override_until >= 今日）
// ================================================================
function isOverrideActive_(override_until) {
  if (!override_until) return false;
  var s = String(override_until).trim();
  var exp = parseYmdDateLocal_(s);
  if (!exp) return false;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return today <= exp;
}

// ================================================================
// 5-C：查詢或新建 GROUP_LEADERS 記錄（必須在 LockService 保護下呼叫）
// ================================================================
function findOrCreateLeader_(phone, cname) {
  var lc    = COL.GROUP_LEADERS;
  var sheet = getSheet(SHEET.GROUP_LEADERS);
  var rows  = getRows(SHEET.GROUP_LEADERS);
  var ts    = now();

  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(rows[i][lc.PHONE]) === phone) {
      return { rowIdx: i, row: rows[i], created: false };
    }
  }

  sheet.appendRow([
    genId('GL'),     //  0  id
    "'" + phone,     //  1  phone（前導 ' 強制 Sheets 存文字）
    cname,           //  2  name
    '',              //  3  member_level
    '',              //  4  approve_method
    '',              //  5  approve_date
    0,               //  6  no_show_count
    '正常',          //  7  group_buy_status
    '',              //  8  source_leader
    '',              //  9  first_led_at
    '',              // 10  line_uid
    '',              // 11  note
    '',              // 12  suspended_at
    '',              // 13  suspended_reason
    '',              // 14  override_until
    '',              // 15  override_note
    '自動建立 ' + ts // 16  system_note
  ]);
  SpreadsheetApp.flush();

  var freshRows = getRows(SHEET.GROUP_LEADERS);
  var newIdx = -1;
  for (var j = 0; j < freshRows.length; j++) {
    if (normalizePhone_(freshRows[j][lc.PHONE]) === phone) { newIdx = j; break; }
  }
  if (newIdx < 0) throw new Error('GROUP_LEADERS 建立後找不到資料列');
  return { rowIdx: newIdx, row: freshRows[newIdx], created: true };
}

// ================================================================
// 取貨號碼產生（格式 PUyyyymmdd-NNNNN；同 phone+date 共用同一碼）
// 由呼叫端在 LockService 保護下呼叫，本函式不再加鎖
// ================================================================
function genPickupCode_(date, phone) {
  if (!isValidDateString_(date)) return null;

  var normPhone = normalizePhone_(phone);
  var pc        = COL.GROUP_PLEDGES;
  var rows      = getRows(SHEET.GROUP_PLEDGES);
  var dateKey   = date.replace(/-/g, '');
  var prefix    = 'PU' + dateKey + '-';

  // 1. 同 phone + 同 pickup_date 已有 pickup_code → 共用
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (normalizePhone_(r[pc.PHONE]) === normPhone &&
        String(r[pc.PICKUP_DATE])    === date      &&
        String(r[pc.PICKUP_CODE])    !== '') {
      return String(r[pc.PICKUP_CODE]);
    }
  }

  // 2. 掃 sheet 找同日已存在的最大流水號（防 ScriptProperties 遺失後重複）
  var sheetMax = 0;
  for (var j = 0; j < rows.length; j++) {
    var code = String(rows[j][pc.PICKUP_CODE] || '');
    if (code.indexOf(prefix) === 0) {
      var seq = parseInt(code.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > sheetMax) sheetMax = seq;
    }
  }

  // 3. ScriptProperties 只當快取；實際取 max(sheetMax, propSeq) + 1
  var propKey = 'PICKUP_SEQ_' + dateKey;
  var props   = PropertiesService.getScriptProperties();
  var propSeq = parseInt(props.getProperty(propKey) || '0', 10);
  var newSeq  = Math.max(sheetMax, propSeq) + 1;
  props.setProperty(propKey, String(newSeq));

  return prefix + String(newSeq).padStart(5, '0');
}

// ================================================================
// 取貨管理 — 查詢清單（admin）
// ================================================================
function getGroupPickupList(p) {
  var limit = Math.min(parseInt(p.limit || '200', 10), 500);
  if (isNaN(limit) || limit < 1) limit = 200;

  var pc   = COL.GROUP_PLEDGES;
  var rows = getRows(SHEET.GROUP_PLEDGES);

  var fCampaign = p.campaign_id   ? String(p.campaign_id).trim()   : null;
  var fDate     = p.pickup_date   ? String(p.pickup_date).trim()   : null;
  var fCode     = p.pickup_code   ? String(p.pickup_code).trim()   : null;
  var fPhone    = p.phone         ? normalizePhone_(p.phone)        : null;
  var fPStatus  = p.pickup_status ? String(p.pickup_status).trim() : null;
  var noFilter  = !fCampaign && !fDate && !fCode && !fPhone && !fPStatus;

  // 無條件查詢時只回傳進行中的清單（已取貨/未取貨/取消 必須明確指定才查）
  var ACTIVE_PS = ['', '待安排', '待取貨', '已通知'];

  var results = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!String(r[pc.ID] || '').trim()) continue;

    if (fCampaign && String(r[pc.CID])               !== fCampaign) continue;
    if (fDate     && String(r[pc.PICKUP_DATE]  || '') !== fDate)    continue;
    if (fCode     && String(r[pc.PICKUP_CODE]  || '') !== fCode)    continue;
    if (fPhone    && normalizePhone_(r[pc.PHONE])     !== fPhone)   continue;
    if (fPStatus  && String(r[pc.PICKUP_STATUS]|| '') !== fPStatus) continue;

    if (noFilter) {
      if (String(r[pc.STATUS]) !== '有效') continue;
      if (ACTIVE_PS.indexOf(String(r[pc.PICKUP_STATUS] || '')) < 0) continue;
    }

    results.push({
      pledge_id:     String(r[pc.ID]),
      campaign_id:   String(r[pc.CID]),
      cname:         String(r[pc.CNAME]),
      phone:         normalizePhone_(r[pc.PHONE]),
      qty:           Number(r[pc.QTY]) || 0,
      status:        String(r[pc.STATUS]),
      pickup_code:   String(r[pc.PICKUP_CODE]    || ''),
      pickup_date:   String(r[pc.PICKUP_DATE]    || ''),
      pickup_status: String(r[pc.PICKUP_STATUS]  || ''),
      picked_up_at:  String(r[pc.PICKED_UP_AT]   || ''),
      pickup_note:   String(r[pc.PICKUP_NOTE]    || ''),
      created_at:    String(r[pc.CREATED])
    });
    if (results.length >= limit) break;
  }
  return { ok: true, count: results.length, items: results };
}

// ================================================================
// 取貨管理 — 標記已取貨（admin）
// ================================================================
function markGroupPledgePickedUp(p) {
  var pledgeId = String(p.pledge_id || '').trim();
  if (!pledgeId) return { ok: false, error: '缺少 pledge_id' };

  var lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    var pc    = COL.GROUP_PLEDGES;
    var sheet = getSheet(SHEET.GROUP_PLEDGES);
    var rows  = getRows(SHEET.GROUP_PLEDGES);
    var idx   = -1;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][pc.ID]) === pledgeId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, error: '找不到登記記錄 ' + pledgeId };

    var row   = rows[idx];
    var rn    = DATA_ROW + idx;
    var oldPS = String(row[pc.PICKUP_STATUS] || '');

    if (String(row[pc.STATUS]) !== '有效')
      return { ok: false, error: '登記狀態不是有效，無法操作取貨' };
    if (oldPS === '已取貨')
      return { ok: false, error: '此筆已標記取貨，請勿重複操作' };
    if (oldPS === '未取貨')
      return { ok: false, error: '取貨狀態為「未取貨」（終態），無法直接改為已取貨，請另開 reversal 作業' };
    if (oldPS === '取消')
      return { ok: false, error: '取貨狀態為「取消」（終態），無法直接改為已取貨，請另開 reversal 作業' };

    var ts      = now();
    var sysLine = '後台標記已取貨 ' + ts + '；pickup_status「' + (oldPS || '空白') + '」→「已取貨」'
                  + (p.note ? '；備註：' + p.note : '');
    var oldSys  = String(sheet.getRange(rn, pc.SYSTEM_NOTE + 1).getValue() || '');

    sheet.getRange(rn, pc.PICKUP_STATUS + 1).setValue('已取貨');
    sheet.getRange(rn, pc.PICKED_UP_AT  + 1).setValue(ts);
    if (p.note) sheet.getRange(rn, pc.PICKUP_NOTE + 1).setValue(p.note);
    sheet.getRange(rn, pc.SYSTEM_NOTE   + 1).setValue(oldSys ? oldSys + '\n' + sysLine : sysLine);

    return { ok: true, pledge_id: pledgeId, picked_up_at: ts };
  } finally { lock.releaseLock(); }
}

// ================================================================
// 取貨管理 — 標記未取貨（admin）
// ================================================================
function markGroupPledgeNoShow(p) {
  var pledgeId = String(p.pledge_id || '').trim();
  var note     = String(p.note      || '').trim();
  if (!pledgeId) return { ok: false, error: '缺少 pledge_id' };
  if (!note)     return { ok: false, error: '請填寫未取貨原因（note 必填）' };

  var lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    var pc    = COL.GROUP_PLEDGES;
    var sheet = getSheet(SHEET.GROUP_PLEDGES);
    var rows  = getRows(SHEET.GROUP_PLEDGES);
    var idx   = -1;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][pc.ID]) === pledgeId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, error: '找不到登記記錄 ' + pledgeId };

    var row   = rows[idx];
    var rn    = DATA_ROW + idx;
    var oldPS = String(row[pc.PICKUP_STATUS] || '');

    if (String(row[pc.STATUS]) !== '有效')
      return { ok: false, error: '登記狀態不是有效，無法操作取貨' };
    if (oldPS === '已取貨')
      return { ok: false, error: '此筆已完成取貨，無法標記未取貨' };
    if (oldPS === '未取貨')
      return { ok: false, error: '此筆已標記未取貨，請勿重複操作' };

    var ts     = now();
    var phone  = normalizePhone_(row[pc.PHONE]);
    var cname  = String(row[pc.CNAME] || '');

    // ── 第一步：GROUP_PLEDGES 取貨狀態寫入 ─────────────────────────
    var sysLine1 = '後台標記未取貨 ' + ts + '；pickup_status「' + (oldPS || '空白') + '」→「未取貨」；備註：' + note;
    var oldSys   = String(sheet.getRange(rn, pc.SYSTEM_NOTE + 1).getValue() || '');

    sheet.getRange(rn, pc.PICKUP_STATUS + 1).setValue('未取貨');
    sheet.getRange(rn, pc.PICKUP_NOTE   + 1).setValue(note);
    sheet.getRange(rn, pc.SYSTEM_NOTE   + 1).setValue(oldSys ? oldSys + '\n' + sysLine1 : sysLine1);

    // ── 第二步：GROUP_LEADERS no_show_count 更新（5-C）──────────────
    var leaderResult = findOrCreateLeader_(phone, cname);
    var leaderIdx    = leaderResult.rowIdx;
    var lc           = COL.GROUP_LEADERS;
    var lSheet       = getSheet(SHEET.GROUP_LEADERS);
    var lrn          = DATA_ROW + leaderIdx;
    var oldCount     = Number(leaderResult.row[lc.NO_SHOW_COUNT]) || 0;
    var newCount     = oldCount + 1;
    var autoSuspend  = newCount >= 3;

    lSheet.getRange(lrn, lc.NO_SHOW_COUNT + 1).setValue(newCount);
    if (autoSuspend) {
      lSheet.getRange(lrn, lc.BUY_STATUS       + 1).setValue('暫停');
      lSheet.getRange(lrn, lc.SUSPENDED_AT     + 1).setValue(ts);
      lSheet.getRange(lrn, lc.SUSPENDED_REASON + 1).setValue('三次未取貨自動暫停');
    }

    var lSysLine = '未取貨登記 ' + ts + '；pledge_id=' + pledgeId +
                   '；no_show_count ' + oldCount + ' → ' + newCount +
                   (autoSuspend ? '；自動暫停' : '');
    var oldLSys  = String(lSheet.getRange(lrn, lc.SYSTEM_NOTE + 1).getValue() || '');
    lSheet.getRange(lrn, lc.SYSTEM_NOTE + 1).setValue(oldLSys ? oldLSys + '\n' + lSysLine : lSysLine);

    // ── 第三步：GROUP_PLEDGES system_note 補寫 no_show_count 結果（修正五）
    var sysLine2 = 'no_show_count ' + oldCount + ' → ' + newCount +
                   (autoSuspend ? '；已自動暫停集單資格' : '');
    var curSys   = String(sheet.getRange(rn, pc.SYSTEM_NOTE + 1).getValue() || '');
    sheet.getRange(rn, pc.SYSTEM_NOTE + 1).setValue(curSys + '\n' + sysLine2);

    return { ok: true, pledge_id: pledgeId, no_show_count: newCount, auto_suspended: autoSuspend };
  } finally { lock.releaseLock(); }
}

// ================================================================
// 取貨管理 — 標記已通知（admin）
// ================================================================
function markGroupPledgeNotified(p) {
  var pledgeId = String(p.pledge_id || '').trim();
  if (!pledgeId) return { ok: false, error: '缺少 pledge_id' };

  var lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    var pc    = COL.GROUP_PLEDGES;
    var sheet = getSheet(SHEET.GROUP_PLEDGES);
    var rows  = getRows(SHEET.GROUP_PLEDGES);
    var idx   = -1;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][pc.ID]) === pledgeId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, error: '找不到登記記錄 ' + pledgeId };

    var row   = rows[idx];
    var rn    = DATA_ROW + idx;
    var oldPS = String(row[pc.PICKUP_STATUS] || '');

    if (String(row[pc.STATUS]) !== '有效')
      return { ok: false, error: '登記狀態不是有效，無法操作取貨' };
    // 白名單：只允許空白 / 待安排 / 待取貨
    var allowed = ['', '待安排', '待取貨'];
    if (allowed.indexOf(oldPS) < 0)
      return { ok: false, error: '取貨狀態「' + oldPS + '」無法標記已通知（須為空白/待安排/待取貨）' };

    var ts      = now();
    var sysLine = '後台標記已通知 ' + ts + '；pickup_status「' + (oldPS || '空白') + '」→「已通知」'
                  + (p.note ? '；備註：' + p.note : '');
    var oldSys  = String(sheet.getRange(rn, pc.SYSTEM_NOTE + 1).getValue() || '');

    sheet.getRange(rn, pc.PICKUP_STATUS + 1).setValue('已通知');
    if (p.note) sheet.getRange(rn, pc.PICKUP_NOTE + 1).setValue(p.note);
    sheet.getRange(rn, pc.SYSTEM_NOTE   + 1).setValue(oldSys ? oldSys + '\n' + sysLine : sysLine);

    return { ok: true, pledge_id: pledgeId };
  } finally { lock.releaseLock(); }
}

// ================================================================
// 取貨管理 — 更新取貨資訊（admin；終態封鎖）
// ================================================================
function updateGroupPledgePickupInfo(p) {
  var pledgeId = String(p.pledge_id || '').trim();
  if (!pledgeId) return { ok: false, error: '缺少 pledge_id' };

  var hasDate = Object.prototype.hasOwnProperty.call(p, 'pickup_date');
  var hasNote = Object.prototype.hasOwnProperty.call(p, 'pickup_note');
  if (!hasDate && !hasNote)
    return { ok: false, error: '請至少提供 pickup_date 或 pickup_note 其中一個' };

  var newDate = hasDate ? String(p.pickup_date || '').trim() : null;
  if (newDate && !isValidDateString_(newDate))
    return { ok: false, error: 'pickup_date 格式或日期錯誤，請用 YYYY-MM-DD（例：2026-07-10）' };

  var lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    var pc    = COL.GROUP_PLEDGES;
    var sheet = getSheet(SHEET.GROUP_PLEDGES);
    var rows  = getRows(SHEET.GROUP_PLEDGES);
    var idx   = -1;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][pc.ID]) === pledgeId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, error: '找不到登記記錄 ' + pledgeId };

    var row   = rows[idx];
    var rn    = DATA_ROW + idx;
    var oldPS = String(row[pc.PICKUP_STATUS] || '');

    if (String(row[pc.STATUS]) !== '有效')
      return { ok: false, error: '登記狀態不是有效，無法操作取貨' };
    var blocked = ['已取貨', '未取貨', '取消'];
    if (blocked.indexOf(oldPS) >= 0)
      return { ok: false, error: '取貨狀態「' + oldPS + '」為終態，無法修改取貨資訊' };

    var ts      = now();
    var changes = [];
    var newCode = null;

    if (hasDate) {
      var oldDate = String(row[pc.PICKUP_DATE]  || '');
      var oldCode = String(row[pc.PICKUP_CODE]  || '');

      if (newDate === '') {
        sheet.getRange(rn, pc.PICKUP_DATE + 1).setValue('');
        sheet.getRange(rn, pc.PICKUP_CODE + 1).setValue('');
        changes.push('pickup_date「' + (oldDate || '空白') + '」→ 空白；pickup_code「' + (oldCode || '空白') + '」→ 空白');
        if (oldPS !== '待安排') {
          sheet.getRange(rn, pc.PICKUP_STATUS + 1).setValue('待安排');
          changes.push('pickup_status「' + oldPS + '」→「待安排」（清空取貨日自動退回）');
        }
      } else {
        var phone = normalizePhone_(row[pc.PHONE]);
        newCode   = genPickupCode_(newDate, phone);
        if (!newCode) return { ok: false, error: '取貨號碼產生失敗，請確認 pickup_date 格式正確' };
        var pdCell = sheet.getRange(rn, pc.PICKUP_DATE + 1);
        pdCell.setNumberFormat('@');
        pdCell.setValue(newDate);
        sheet.getRange(rn, pc.PICKUP_CODE + 1).setValue(newCode);
        changes.push('pickup_date「' + (oldDate || '空白') + '」→「' + newDate + '」；pickup_code「' + (oldCode || '空白') + '」→「' + newCode + '」');
        if (oldPS === '待安排' || oldPS === '') {
          sheet.getRange(rn, pc.PICKUP_STATUS + 1).setValue('待取貨');
          changes.push('pickup_status「' + (oldPS || '空白') + '」→「待取貨」（補填取貨日自動進階）');
        }
      }
    }

    if (hasNote) {
      var oldNote = String(row[pc.PICKUP_NOTE] || '');
      var newNote = String(p.pickup_note || '');
      sheet.getRange(rn, pc.PICKUP_NOTE + 1).setValue(newNote);
      changes.push('pickup_note「' + (oldNote || '空白') + '」→「' + (newNote || '空白') + '」');
    }

    var sysLine = '後台更新取貨資訊 ' + ts + '；' + changes.join('；');
    var oldSys  = String(sheet.getRange(rn, pc.SYSTEM_NOTE + 1).getValue() || '');
    sheet.getRange(rn, pc.SYSTEM_NOTE + 1).setValue(oldSys ? oldSys + '\n' + sysLine : sysLine);

    return { ok: true, pledge_id: pledgeId, pickup_code: newCode };
  } finally { lock.releaseLock(); }
}

// ================================================================
// Migration — GROUP_PLEDGES 補 col 12–16 表頭與預設 pickup_status
// GAS 編輯器手動執行，不進 router，不進 adminActions
// ================================================================
function adminMigrateGroupPledgesV5B() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.GROUP_PLEDGES);
  if (!sheet) return { ok: false, error: '找不到 GROUP_PLEDGES 表' };

  // row1 英文表頭 col 12–16
  sheet.getRange(1, 12, 1, 5).setValues([[
    'pickup_code','pickup_date','pickup_status','picked_up_at','pickup_note'
  ]]);
  // row2 中文表頭 col 12–16
  sheet.getRange(2, 12, 1, 5).setValues([[
    '取貨號碼','預計取貨日','取貨狀態','實際取貨時間','取貨備註'
  ]]);

  // row3+ 回填 pickup_status（不覆蓋已有值）
  var pc      = COL.GROUP_PLEDGES;
  var lastRow = sheet.getLastRow();
  var filled  = 0;
  var skipped = 0;

  if (lastRow >= DATA_ROW) {
    var data = sheet.getRange(DATA_ROW, 1, lastRow - DATA_ROW + 1, 16).getValues();
    for (var i = 0; i < data.length; i++) {
      var r  = data[i];
      var id = String(r[pc.ID] || '').trim();
      if (!id) continue;

      var existingPS = String(r[pc.PICKUP_STATUS] || '').trim();
      if (existingPS !== '') { skipped++; continue; }

      var defaultPS = (String(r[pc.STATUS]) === '有效') ? '待安排' : '取消';
      sheet.getRange(DATA_ROW + i, pc.PICKUP_STATUS + 1).setValue(defaultPS);
      filled++;
    }
  }

  var log = [
    'GROUP_PLEDGES col 12–16 表頭補充完成（row1=英文, row2=中文）',
    'pickup_status 回填：' + filled + ' 列；已有值略過：' + skipped + ' 列',
    '既有 14 張表未異動'
  ];
  Logger.log(log.join('\n'));
  return { ok: true, filled: filled, skipped: skipped, log: log };
}

// ================================================================
// 團購模組 — 客人登記（public API，token 防誤打，非安全驗證）
// ================================================================
function createGroupPledge(p) {
  // ── token ─────────────────────────────────────────────
  if (p.token !== PLEDGE_TOKEN)
    return { ok: false, error: '驗證失敗' };

  // ── 必填欄位 ──────────────────────────────────────────
  var campaignId = String(p.campaign_id || '').trim();
  var cname      = String(p.cname       || '').trim();
  var phone      = normalizePhone_(p.phone);
  if (!campaignId) return { ok: false, error: '缺少 campaign_id' };
  if (!cname)      return { ok: false, error: '請填寫姓名' };
  if (!phone)      return { ok: false, error: '請填寫電話' };

  // ── phone 格式（台灣手機 09xxxxxxxx）─────────────────
  if (!/^09\d{8}$/.test(phone))
    return { ok: false, error: '電話格式錯誤，請填寫 09 開頭的 10 位手機號碼' };

  // ── qty 驗證 ──────────────────────────────────────────
  var qty = Number(p.qty);
  if (!p.qty || isNaN(qty) || qty < 1 || Math.floor(qty) !== qty)
    return { ok: false, error: '數量必須是 >= 1 的整數' };
  if (qty > 99)
    return { ok: false, error: '單次登記數量上限為 99，若有大量需求請聯繫幸福緣' };

  // ── 查活動 ────────────────────────────────────────────
  var campaignFound = findRow(SHEET.GROUP_CAMPAIGNS, COL.GROUP_CAMPAIGNS.ID, campaignId);
  if (!campaignFound) return { ok: false, error: '找不到此活動' };

  var camp = campaignFound.row;
  var c    = COL.GROUP_CAMPAIGNS;

  if (String(camp[c.STATUS]) !== '集單中')
    return { ok: false, error: '此活動已結束，無法登記' };

  var nowDate  = new Date();
  var deadline = new Date(camp[c.DEADLINE]);
  if (isNaN(deadline.getTime()) || deadline <= nowDate)
    return { ok: false, error: '活動已截止，無法登記' };

  var startDateRaw = camp[c.START_DATE];
  if (startDateRaw) {
    var sd = new Date(startDateRaw);
    if (!isNaN(sd.getTime()) && sd > nowDate)
      return { ok: false, error: '活動尚未開始' };
  }

  var thresholdQty = Number(camp[c.THRESHOLD_QTY]) || 0;
  if (thresholdQty < 1)
    return { ok: false, error: '此活動尚未設定目標數量，請聯繫幸福緣' };

  // ── LockService ───────────────────────────────────────
  var lock = _acquireLock_();
  try {
    var sheet      = getSheet(SHEET.GROUP_PLEDGES);
    var pledgeRows = getRows(SHEET.GROUP_PLEDGES);
    var pc         = COL.GROUP_PLEDGES;
    var ts         = now();
    var pledgeId, action;

    // ── 5-C：GROUP_LEADERS 暫停檢查（鎖內執行，防競態）──────────
    var overrideNoteLine = '';
    var lc2        = COL.GROUP_LEADERS;
    var leaderRows = getRows(SHEET.GROUP_LEADERS);
    var leaderRow  = null;
    for (var li = 0; li < leaderRows.length; li++) {
      if (normalizePhone_(leaderRows[li][lc2.PHONE]) === phone) {
        leaderRow = leaderRows[li];
        break;
      }
    }
    if (leaderRow && String(leaderRow[lc2.BUY_STATUS]) === '暫停') {
      if (!isOverrideActive_(leaderRow[lc2.OVERRIDE_UNTIL])) {
        return { ok: false, error: '您的集單資格已暫停，請聯繫幸福緣客服', suspended: true };
      }
      overrideNoteLine = '；覆蓋期允許登記至 ' + String(leaderRow[lc2.OVERRIDE_UNTIL]).trim();
    }

    // ── 防重複：同 campaign_id + phone + status=有效 只保留一筆 ──
    var existingIdx = -1;
    for (var i = 0; i < pledgeRows.length; i++) {
      if (String(pledgeRows[i][pc.CID])          === campaignId &&
          normalizePhone_(pledgeRows[i][pc.PHONE]) === phone      &&
          String(pledgeRows[i][pc.STATUS])          === '有效') {
        existingIdx = i;
        break;
      }
    }

    if (existingIdx >= 0) {
      // 更新現有筆（qty 覆蓋，非累加）
      var rn     = DATA_ROW + existingIdx;
      pledgeId   = String(pledgeRows[existingIdx][pc.ID]);
      var oldSys = String(sheet.getRange(rn, pc.SYSTEM_NOTE + 1).getValue() || '');
      var newLine = '客人更新登記 ' + ts + '（新 qty=' + qty + ')' + overrideNoteLine;
      sheet.getRange(rn, pc.QTY         + 1).setValue(qty);
      sheet.getRange(rn, pc.NOTE        + 1).setValue(p.note || '');
      sheet.getRange(rn, pc.SYSTEM_NOTE + 1).setValue(oldSys ? (oldSys + '\n' + newLine) : newLine);
      action = 'updated';
    } else {
      // 新增一筆
      pledgeId = genId('GP');
      sheet.appendRow([
        pledgeId,          // 0  id
        campaignId,        // 1  campaign_id
        cname,             // 2  cname
        "'" + phone,       // 3  phone（前導 ' 強制 Sheets 存為文字，避免吃掉前導 0）
        p.line_uid || '',                    // 4  line_uid
        qty,                                // 5  qty
        '',                                 // 6  order_id（本輪空白，5-B 後填）
        ts,                                 // 7  created_at
        '有效',                              // 8  status
        p.note || '',                       // 9  note
        '客人登記 ' + ts + overrideNoteLine, // 10 system_note
        '',               // 11 pickup_code（取貨日確認後由後台填入）
        '',               // 12 pickup_date
        '待安排',          // 13 pickup_status
        '',               // 14 picked_up_at
        ''                // 15 pickup_note
      ]);
      SpreadsheetApp.flush(); // 確保 appendRow 立即寫入，下次請求讀到最新資料
      action = 'created';
    }

    // ── 重新計算 current_qty（寫入後重讀確保最新值）────────
    var freshPledges = getRows(SHEET.GROUP_PLEDGES);
    var currentQty = 0;
    freshPledges.forEach(function(r) {
      if (String(r[pc.CID]) === campaignId && String(r[pc.STATUS]) === '有效')
        currentQty += Number(r[pc.QTY]) || 0;
    });

    var remaining = thresholdQty - currentQty;   // 負數 = 超標
    var pct       = Math.min(100, Math.round(currentQty / thresholdQty * 100));
    var reached   = currentQty >= thresholdQty;

    return {
      ok:            true,
      action:        action,
      pledge_id:     pledgeId,
      campaign_id:   campaignId,
      current_qty:   currentQty,
      threshold_qty: thresholdQty,
      remaining_qty: remaining,
      progress_pct:  pct,
      reached:       reached
    };

  } finally {
    lock.releaseLock();
  }
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

// ================================================================
// 5-C：查詢高風險顧客清單（admin，無鎖）
// ================================================================
function getGroupCustomerRiskList(p) {
  var limit    = Math.min(parseInt(p.limit    || '100', 10), 500);
  if (isNaN(limit)    || limit    < 1) limit    = 100;
  var minCount = parseInt(p.min_no_show || '1', 10);
  if (isNaN(minCount) || minCount < 1) minCount = 1;
  var fStatus  = p.group_buy_status ? String(p.group_buy_status).trim() : null;
  var fPhone   = p.phone            ? normalizePhone_(p.phone)          : null;

  var lc      = COL.GROUP_LEADERS;
  var rows    = getRows(SHEET.GROUP_LEADERS);
  var results = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!String(r[lc.ID] || '').trim()) continue;
    var count = Number(r[lc.NO_SHOW_COUNT]) || 0;
    if (count < minCount) continue;
    if (fStatus && String(r[lc.BUY_STATUS] || '') !== fStatus) continue;
    if (fPhone  && normalizePhone_(r[lc.PHONE])    !== fPhone)  continue;

    results.push({
      id:               String(r[lc.ID]),
      phone:            normalizePhone_(r[lc.PHONE]),
      name:             String(r[lc.NAME]             || ''),
      no_show_count:    count,
      group_buy_status: String(r[lc.BUY_STATUS]       || ''),
      suspended_at:     String(r[lc.SUSPENDED_AT]     || ''),
      suspended_reason: String(r[lc.SUSPENDED_REASON] || ''),
      override_until:   String(r[lc.OVERRIDE_UNTIL]   || ''),
      override_note:    String(r[lc.OVERRIDE_NOTE]    || ''),
      is_override_active: isOverrideActive_(r[lc.OVERRIDE_UNTIL])
    });
    if (results.length >= limit) break;
  }

  results.sort(function(a, b) { return b.no_show_count - a.no_show_count; });
  return { ok: true, count: results.length, items: results };
}

// ================================================================
// 5-C：手動更新顧客集單資格（admin，LockService）
// ================================================================
function updateGroupCustomerStatus(p) {
  var phone     = p.phone             ? normalizePhone_(p.phone)              : '';
  var newStatus = String(p.group_buy_status || '').trim();
  var note      = String(p.note             || '').trim();

  if (!phone)    return { ok: false, error: '缺少 phone' };
  if (!note)     return { ok: false, error: '請填寫原因（note 必填）' };
  if (['正常','暫停'].indexOf(newStatus) < 0)
    return { ok: false, error: 'group_buy_status 必須為「正常」或「暫停」' };

  var lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    var lc    = COL.GROUP_LEADERS;
    var sheet = getSheet(SHEET.GROUP_LEADERS);
    var rows  = getRows(SHEET.GROUP_LEADERS);
    var idx   = -1;
    for (var i = 0; i < rows.length; i++) {
      if (normalizePhone_(rows[i][lc.PHONE]) === phone) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, error: '找不到顧客資料：' + phone };

    var row   = rows[idx];
    var rn    = DATA_ROW + idx;
    var oldSt = String(row[lc.BUY_STATUS] || '');
    var ts    = now();

    sheet.getRange(rn, lc.BUY_STATUS + 1).setValue(newStatus);
    sheet.getRange(rn, lc.NOTE       + 1).setValue(note);
    if (newStatus === '暫停') {
      sheet.getRange(rn, lc.SUSPENDED_AT     + 1).setValue(ts);
      sheet.getRange(rn, lc.SUSPENDED_REASON + 1).setValue(note);
    } else {
      sheet.getRange(rn, lc.SUSPENDED_AT     + 1).setValue('');
      sheet.getRange(rn, lc.SUSPENDED_REASON + 1).setValue('');
    }

    var sysLine = '後台手動更新資格 ' + ts + '；group_buy_status「' + (oldSt || '空白') + '」→「' + newStatus + '」；備註：' + note;
    var oldSys  = String(sheet.getRange(rn, lc.SYSTEM_NOTE + 1).getValue() || '');
    sheet.getRange(rn, lc.SYSTEM_NOTE + 1).setValue(oldSys ? oldSys + '\n' + sysLine : sysLine);

    return { ok: true, phone: phone, group_buy_status: newStatus };
  } finally { lock.releaseLock(); }
}

// ================================================================
// 5-C：手動設覆蓋期（admin，LockService）
// ================================================================
function manualOverrideGroupCustomer(p) {
  var phone    = p.phone          ? normalizePhone_(p.phone)      : '';
  var untilRaw = String(p.override_until || '').trim();
  var note     = String(p.note           || '').trim();

  if (!phone)    return { ok: false, error: '缺少 phone' };
  if (!note)     return { ok: false, error: '請填寫覆蓋原因（note 必填）' };
  if (!isValidDateString_(untilRaw))
    return { ok: false, error: 'override_until 格式或日期錯誤，請用 YYYY-MM-DD' };

  var untilDate = parseYmdDateLocal_(untilRaw);
  var today     = new Date(); today.setHours(0, 0, 0, 0);
  if (untilDate < today)
    return { ok: false, error: 'override_until 不可設為過去日期' };

  var lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    var lc    = COL.GROUP_LEADERS;
    var sheet = getSheet(SHEET.GROUP_LEADERS);
    var rows  = getRows(SHEET.GROUP_LEADERS);
    var idx   = -1;
    for (var i = 0; i < rows.length; i++) {
      if (normalizePhone_(rows[i][lc.PHONE]) === phone) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, error: '找不到顧客資料：' + phone };

    var row      = rows[idx];
    var rn       = DATA_ROW + idx;
    var oldUntil = String(row[lc.OVERRIDE_UNTIL] || '');
    var ts       = now();

    var ouCell = sheet.getRange(rn, lc.OVERRIDE_UNTIL + 1);
    ouCell.setNumberFormat('@');
    ouCell.setValue(untilRaw);
    sheet.getRange(rn, lc.OVERRIDE_NOTE + 1).setValue(note);

    var sysLine = '後台設覆蓋期 ' + ts + '；override_until「' + (oldUntil || '空白') + '」→「' + untilRaw + '」；備註：' + note;
    var oldSys  = String(sheet.getRange(rn, lc.SYSTEM_NOTE + 1).getValue() || '');
    sheet.getRange(rn, lc.SYSTEM_NOTE + 1).setValue(oldSys ? oldSys + '\n' + sysLine : sysLine);

    return { ok: true, phone: phone, override_until: untilRaw };
  } finally { lock.releaseLock(); }
}

// ================================================================
// 5-C：重置未取貨計數（admin，LockService）
// ================================================================
function resetGroupCustomerNoShow(p) {
  var phone = p.phone ? normalizePhone_(p.phone) : '';
  var note  = String(p.note || '').trim();
  if (!phone) return { ok: false, error: '缺少 phone' };
  if (!note)  return { ok: false, error: '請填寫重置原因（note 必填）' };

  var lock = _acquireLock_();
  if (!lock) return { ok: false, error: '系統忙碌，請稍後再試' };
  try {
    var lc    = COL.GROUP_LEADERS;
    var sheet = getSheet(SHEET.GROUP_LEADERS);
    var rows  = getRows(SHEET.GROUP_LEADERS);
    var idx   = -1;
    for (var i = 0; i < rows.length; i++) {
      if (normalizePhone_(rows[i][lc.PHONE]) === phone) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, error: '找不到顧客資料：' + phone };

    var row      = rows[idx];
    var rn       = DATA_ROW + idx;
    var oldCount = Number(row[lc.NO_SHOW_COUNT]) || 0;
    var oldSt    = String(row[lc.BUY_STATUS]    || '');
    var ts       = now();

    sheet.getRange(rn, lc.NO_SHOW_COUNT    + 1).setValue(0);
    sheet.getRange(rn, lc.BUY_STATUS       + 1).setValue('正常');
    sheet.getRange(rn, lc.SUSPENDED_AT     + 1).setValue('');
    sheet.getRange(rn, lc.SUSPENDED_REASON + 1).setValue('');
    sheet.getRange(rn, lc.OVERRIDE_UNTIL   + 1).setValue('');
    sheet.getRange(rn, lc.OVERRIDE_NOTE    + 1).setValue('');
    sheet.getRange(rn, lc.NOTE             + 1).setValue(note);

    var sysLine = '後台重置未取紀錄 ' + ts +
                  '；no_show_count ' + oldCount + ' → 0' +
                  '；group_buy_status「' + (oldSt || '空白') + '」→「正常」' +
                  '；備註：' + note;
    var oldSys  = String(sheet.getRange(rn, lc.SYSTEM_NOTE + 1).getValue() || '');
    sheet.getRange(rn, lc.SYSTEM_NOTE + 1).setValue(oldSys ? oldSys + '\n' + sysLine : sysLine);

    return { ok: true, phone: phone };
  } finally { lock.releaseLock(); }
}

// ================================================================
// 5-C：Migration — 補 GROUP_LEADERS col 12–16 表頭與預設值
// 不進 router，不進 adminActions，GAS 編輯器手動執行
// ================================================================
function adminMigrateGroupLeadersV5C() {
  var lc    = COL.GROUP_LEADERS;
  var sheet = getSheet(SHEET.GROUP_LEADERS);

  // ── row1：英文表頭 ──────────────────────────────────────────────
  sheet.getRange(1, lc.SUSPENDED_AT     + 1).setValue('suspended_at');
  sheet.getRange(1, lc.SUSPENDED_REASON + 1).setValue('suspended_reason');
  sheet.getRange(1, lc.OVERRIDE_UNTIL   + 1).setValue('override_until');
  sheet.getRange(1, lc.OVERRIDE_NOTE    + 1).setValue('override_note');
  sheet.getRange(1, lc.SYSTEM_NOTE      + 1).setValue('system_note');

  // ── row2：中文表頭 ──────────────────────────────────────────────
  sheet.getRange(2, lc.SUSPENDED_AT     + 1).setValue('暫停時間');
  sheet.getRange(2, lc.SUSPENDED_REASON + 1).setValue('暫停原因');
  sheet.getRange(2, lc.OVERRIDE_UNTIL   + 1).setValue('覆蓋到期日');
  sheet.getRange(2, lc.OVERRIDE_NOTE    + 1).setValue('覆蓋備註');
  sheet.getRange(2, lc.SYSTEM_NOTE      + 1).setValue('系統記錄');

  // ── override_until 欄設為文字格式（整欄，防 Sheets 自動轉日期）──
  var lastRow = sheet.getLastRow();
  if (lastRow >= 1) {
    sheet.getRange(1, lc.OVERRIDE_UNTIL + 1, lastRow, 1).setNumberFormat('@');
  }

  // ── row3+：回填 group_buy_status / no_show_count（不覆蓋已有值）──
  var rows    = getRows(SHEET.GROUP_LEADERS);
  var filled  = 0;
  var skipped = 0;

  for (var i = 0; i < rows.length; i++) {
    var r  = rows[i];
    var rn = DATA_ROW + i;
    if (!String(r[lc.ID] || '').trim()) continue;

    var bsVal    = String(r[lc.BUY_STATUS]    || '').trim();
    var nsVal    = String(r[lc.NO_SHOW_COUNT] || '').trim();

    var changed = false;
    if (!bsVal) {
      sheet.getRange(rn, lc.BUY_STATUS    + 1).setValue('正常');
      changed = true;
    }
    if (!nsVal) {
      sheet.getRange(rn, lc.NO_SHOW_COUNT + 1).setValue(0);
      changed = true;
    }
    if (changed) filled++;
    else         skipped++;
  }

  SpreadsheetApp.flush();

  // ── 讀回 row1/row2 確認 ──────────────────────────────────────────
  var h1 = [
    sheet.getRange(1, lc.SUSPENDED_AT     + 1).getValue(),
    sheet.getRange(1, lc.SUSPENDED_REASON + 1).getValue(),
    sheet.getRange(1, lc.OVERRIDE_UNTIL   + 1).getValue(),
    sheet.getRange(1, lc.OVERRIDE_NOTE    + 1).getValue(),
    sheet.getRange(1, lc.SYSTEM_NOTE      + 1).getValue()
  ];
  var h2 = [
    sheet.getRange(2, lc.SUSPENDED_AT     + 1).getValue(),
    sheet.getRange(2, lc.SUSPENDED_REASON + 1).getValue(),
    sheet.getRange(2, lc.OVERRIDE_UNTIL   + 1).getValue(),
    sheet.getRange(2, lc.OVERRIDE_NOTE    + 1).getValue(),
    sheet.getRange(2, lc.SYSTEM_NOTE      + 1).getValue()
  ];

  Logger.log('adminMigrateGroupLeadersV5C 完成');
  Logger.log('row1（英文）：' + h1.join(' | '));
  Logger.log('row2（中文）：' + h2.join(' | '));
  Logger.log('回填 ' + filled + ' 筆，已有資料略過 ' + skipped + ' 筆');
  Logger.log('既有 14 張表未異動，GROUP_LEDGER 未寫入');

  return {
    ok: true,
    row1_headers: h1,
    row2_headers: h2,
    filled:  filled,
    skipped: skipped
  };
}

// ================================================================
// 團購模組 — 公開集單頁 API（顧客前台用，不需 session_token）
// 白名單回傳：公開欄位，不含底價/成本/tiers_snapshot/分潤
// ================================================================
function getGroupCampaignPublic(p) {
  var campaignId = String(p.campaign_id || '').trim();
  if (!campaignId) return { ok: false, error: '缺少 campaign_id' };

  var rows = getRows(SHEET.GROUP_CAMPAIGNS);
  var c    = COL.GROUP_CAMPAIGNS;

  var campaignRow = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][c.ID] || '') === campaignId) { campaignRow = rows[i]; break; }
  }
  if (!campaignRow) return { ok: false, error: '找不到此集單活動' };

  var status = String(campaignRow[c.STATUS] || '');
  if (['集單中', '已成團'].indexOf(status) < 0) {
    return { ok: false, error: '此集單活動目前不開放查詢' };
  }

  // ── current_qty（有效登記加總）
  var pledgeRows = getRows(SHEET.GROUP_PLEDGES);
  var pc         = COL.GROUP_PLEDGES;
  var currentQty = 0;
  pledgeRows.forEach(function(r) {
    if (String(r[pc.CID] || '') === campaignId &&
        String(r[pc.STATUS] || '') === '有效') {
      currentQty += (Number(r[pc.QTY]) || 0);
    }
  });

  // ── 計算進度三欄位
  var thresholdQty = Number(campaignRow[c.THRESHOLD_QTY]) || 0;
  var progressPct  = thresholdQty > 0
    ? Math.min(100, Math.round(currentQty / thresholdQty * 100))
    : 0;
  var remainingQty = Math.max(0, thresholdQty - currentQty);
  var reached      = thresholdQty > 0 && currentQty >= thresholdQty;

  // ── deadline 正規化（Sheets 可能回傳 Date 物件）
  var deadlineRaw = campaignRow[c.DEADLINE] || '';
  var deadlineStr = '';
  if (deadlineRaw) {
    deadlineStr = (deadlineRaw instanceof Date)
      ? Utilities.formatDate(deadlineRaw, 'Asia/Taipei', 'yyyy-MM-dd')
      : String(deadlineRaw).trim();
  }

  // ── can_pledge / is_closed / close_reason 判斷
  var isClosed    = false;
  var closeReason = '';
  var canPledge   = false;

  if (status === '已成團') {
    isClosed    = true;
    closeReason = '此團已成團';
    canPledge   = false;
  } else {
    // status === '集單中'
    if (!deadlineStr || !isValidDateString_(deadlineStr)) {
      isClosed    = true;
      closeReason = '截止日期設定異常，請聯繫客服';
      canPledge   = false;
    } else {
      var deadlineDt = parseYmdDateLocal_(deadlineStr);
      deadlineDt.setHours(23, 59, 59, 0);
      if (new Date() > deadlineDt) {
        isClosed    = true;
        closeReason = '此團已截止';
        canPledge   = false;
      } else {
        isClosed    = false;
        closeReason = '';
        canPledge   = true;
      }
    }
  }

  // ── 商品資料 join（只取公開欄位，不含成本/底價/供應商）
  var productId   = String(campaignRow[c.PID] || '');
  var productName = '';
  var imageUrl    = '';
  var description = '';
  var category    = '';
  if (productId) {
    var productRows = getRows(SHEET.PRODUCTS);
    var cp          = COL.PRODUCTS;
    for (var j = 0; j < productRows.length; j++) {
      if (String(productRows[j][cp.ID] || '') === productId) {
        productName = String(productRows[j][cp.NAME]     || '');
        imageUrl    = String(productRows[j][cp.IMAGE]    || '');
        description = String(productRows[j][cp.DESC]     || '');
        category    = String(productRows[j][cp.CATEGORY] || '');
        break;
      }
    }
  }

  // ── 公開欄位白名單回傳
  // ❌ 不回傳：tiers_snapshot_json, base_price_snapshot, note,
  //            system_note, created_at, markup, leader, threshold_type,
  //            start_date, 成本(COST), 底價(PRICE), SUPPLIER,
  //            PLATFORM_MIN_RATE, LEADER_COMMISSION_RATE
  return {
    ok: true,
    data: {
      id:            campaignId,
      campaign_name: String(campaignRow[c.CAMPAIGN_NAME] || ''),
      product_id:    productId,
      product_name:  productName,
      image_url:     imageUrl,
      description:   description,
      category:      category,
      unit:          '',
      spec:          '',
      deadline:      deadlineStr,
      threshold_qty: thresholdQty,
      current_qty:   currentQty,
      group_price:   String(campaignRow[c.GROUP_PRICE]  || ''),
      pickup_note:   String(campaignRow[c.PICKUP_NOTE]  || ''),
      status:        status,
      progress_pct:  progressPct,
      remaining_qty: remainingQty,
      reached:       reached,
      is_closed:     isClosed,
      close_reason:  closeReason,
      can_pledge:    canPledge
    }
  };
}

// ================================================================
// Module 7 — 團長中心（Leader Portal）
// ================================================================

var LEADER_LOGIN_MAX_FAILS    = 5;
var LEADER_LOGIN_THROTTLE_TTL = 600;

// ── private helpers ───────────────────────────────────────────────

function hashLeaderToken_(normalizedPhone, token) {
  var secret = PropertiesService.getScriptProperties()
                 .getProperty('LEADER_HMAC_SECRET');
  if (!secret) return null;
  var rawBytes = Utilities.computeHmacSha256Signature(
    normalizedPhone + ':' + token,
    secret
  );
  return Utilities.base64Encode(rawBytes);
}

function maskPhone_(phone) {
  var s = String(phone || '').replace(/\D/g, '');
  if (s.length < 6) return '****';
  return s.slice(0, 4) + '****' + s.slice(-2);
}

function checkLoginThrottle_(phone) {
  var val = CacheService.getScriptCache().get('LEADER_LOGIN_FAIL_' + phone);
  return (val ? parseInt(val, 10) : 0) >= LEADER_LOGIN_MAX_FAILS;
}

function recordLoginFail_(phone) {
  var cache = CacheService.getScriptCache();
  var key   = 'LEADER_LOGIN_FAIL_' + phone;
  var cur   = parseInt(cache.get(key) || '0', 10);
  cache.put(key, String(cur + 1), LEADER_LOGIN_THROTTLE_TTL);
}

function clearLoginFail_(phone) {
  CacheService.getScriptCache().remove('LEADER_LOGIN_FAIL_' + phone);
}

function validateLeaderToken_(phone, token) {
  // ① normalize
  var normalizedPhone = normalizePhone_(String(phone || '').trim());
  if (!normalizedPhone || !token) return { ok: false, reason: 'invalid' };

  // ② throttle
  if (checkLoginThrottle_(normalizedPhone)) return { ok: false, reason: 'throttled' };

  // ③ 查 GROUP_LEADERS
  var lc   = COL.GROUP_LEADERS;
  var rows = getRows(SHEET.GROUP_LEADERS);
  var leaderRow = null;
  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(String(rows[i][lc.PHONE] || '')) === normalizedPhone) {
      leaderRow = rows[i]; break;
    }
  }

  // ④ 找不到或等級不是「團長」→ 記失敗，回 invalid（不洩露是否存在）
  if (!leaderRow || String(leaderRow[lc.LEVEL] || '') !== '團長') {
    recordLoginFail_(normalizedPhone);
    return { ok: false, reason: 'invalid' };
  }

  // ⑤⑥⑦ hash 比對（BUY_STATUS 檢查在 hash 正確之後）
  var expectedHash = hashLeaderToken_(normalizedPhone, token);
  if (!expectedHash) return { ok: false, reason: 'config_error' };

  var storedHash = PropertiesService.getScriptProperties()
                     .getProperty('LEADER_TOKEN_HASH_' + normalizedPhone);
  if (!storedHash || storedHash !== expectedHash) {
    recordLoginFail_(normalizedPhone);
    return { ok: false, reason: 'invalid' };
  }

  // ⑧ hash 正確後才檢查暫停狀態（避免狀態枚舉攻擊）
  var buyStatus = String(leaderRow[lc.BUY_STATUS] || '');
  if (buyStatus === '暫停' || buyStatus === '取消') {
    return { ok: false, reason: 'suspended' };
  }

  // ⑩ 成功
  clearLoginFail_(normalizedPhone);
  return { ok: true, row: leaderRow, normalizedPhone: normalizedPhone };
}

// ── public APIs ───────────────────────────────────────────────────

function leaderLogin(p) {
  var phone = String(p.phone || '').trim();
  var token = String(p.leader_token || '').trim();
  if (!phone || !token) return { ok: false, error: '請輸入手機和通行碼' };

  var result = validateLeaderToken_(phone, token);
  if (!result.ok) {
    switch (result.reason) {
      case 'throttled':    return { ok: false, error: '嘗試次數過多，請稍後再試' };
      case 'suspended':    return { ok: false, error: '您的開團資格已暫停，請聯繫幸福緣' };
      case 'config_error': return { ok: false, error: '系統設定異常，請聯繫管理員' };
      default:             return { ok: false, error: '手機或通行碼錯誤' };
    }
  }

  var row = result.row;
  var lc  = COL.GROUP_LEADERS;
  return {
    ok:   true,
    name: String(row[lc.NAME] || '')
  };
}

function getLeaderCampaigns(p) {
  var result = validateLeaderToken_(p.phone, p.leader_token);
  if (!result.ok) {
    switch (result.reason) {
      case 'throttled':    return { ok: false, error: '嘗試次數過多，請稍後再試' };
      case 'suspended':    return { ok: false, error: '您的開團資格已暫停，請聯繫幸福緣' };
      case 'config_error': return { ok: false, error: '系統設定異常，請聯繫管理員' };
      default:             return { ok: false, error: '手機或通行碼錯誤' };
    }
  }

  var phone = result.normalizedPhone;
  var c     = COL.GROUP_CAMPAIGNS;
  var rows  = getRows(SHEET.GROUP_CAMPAIGNS);

  var pledges = getRows(SHEET.GROUP_PLEDGES);
  var pc      = COL.GROUP_PLEDGES;
  var qtyMap  = {};
  pledges.forEach(function(r) {
    var cid = String(r[pc.CID] || '');
    if (cid && String(r[pc.STATUS] || '') === '有效') {
      qtyMap[cid] = (qtyMap[cid] || 0) + (Number(r[pc.QTY]) || 0);
    }
  });

  var products   = getRows(SHEET.PRODUCTS);
  var cp         = COL.PRODUCTS;
  var productMap = {};
  products.forEach(function(r) {
    var pid = String(r[cp.ID] || '');
    if (pid) productMap[pid] = String(r[cp.NAME] || '');
  });

  var list = [];
  rows.forEach(function(r) {
    var id = String(r[c.ID] || '');
    if (!id) return;
    if (normalizePhone_(String(r[c.LEADER] || '')) !== phone) return;

    var thresholdQty = Number(r[c.THRESHOLD_QTY]) || 0;
    var currentQty   = qtyMap[id] || 0;
    var pct = thresholdQty > 0
              ? Math.min(100, Math.round(currentQty / thresholdQty * 100))
              : 0;

    var dlRaw = r[c.DEADLINE] || '';
    var dlStr = dlRaw instanceof Date
      ? Utilities.formatDate(dlRaw, 'Asia/Taipei', 'yyyy-MM-dd')
      : String(dlRaw).trim().slice(0, 10);

    var pid = String(r[c.PID] || '');
    // ❌ 不回傳：leader, base_snapshot, tiers_snapshot, markup,
    //            note, system_note, threshold_type, start_date
    list.push({
      id:            id,
      campaign_name: String(r[c.CAMPAIGN_NAME] || ''),
      product_id:    pid,
      product_name:  productMap[pid] || '',
      deadline:      dlStr,
      status:        String(r[c.STATUS]        || ''),
      group_price:   String(r[c.GROUP_PRICE]   || ''),
      threshold_qty: thresholdQty,
      current_qty:   currentQty,
      progress_pct:  pct,
      pickup_note:   String(r[c.PICKUP_NOTE]   || '')
    });
  });

  return { ok: true, data: list };
}

function getLeaderCampaignPledges(p) {
  var result = validateLeaderToken_(p.phone, p.leader_token);
  if (!result.ok) {
    switch (result.reason) {
      case 'throttled':    return { ok: false, error: '嘗試次數過多，請稍後再試' };
      case 'suspended':    return { ok: false, error: '您的開團資格已暫停，請聯繫幸福緣' };
      case 'config_error': return { ok: false, error: '系統設定異常，請聯繫管理員' };
      default:             return { ok: false, error: '手機或通行碼錯誤' };
    }
  }

  var phone      = result.normalizedPhone;
  var campaignId = String(p.campaign_id || '').trim();
  if (!campaignId) return { ok: false, error: '缺少 campaign_id' };

  var c        = COL.GROUP_CAMPAIGNS;
  var campRows = getRows(SHEET.GROUP_CAMPAIGNS);
  var campRow  = null;
  for (var i = 0; i < campRows.length; i++) {
    if (String(campRows[i][c.ID] || '') === campaignId) {
      campRow = campRows[i]; break;
    }
  }
  if (!campRow) return { ok: false, error: '找不到此活動' };
  if (normalizePhone_(String(campRow[c.LEADER] || '')) !== phone) {
    return { ok: false, error: '無權限查詢此活動' };
  }

  var pc      = COL.GROUP_PLEDGES;
  var pledges = getRows(SHEET.GROUP_PLEDGES);
  var list    = [];
  pledges.forEach(function(r) {
    if (String(r[pc.CID] || '') !== campaignId) return;

    var pdRaw = r[pc.PICKUP_DATE] || '';
    var pdStr = pdRaw instanceof Date
      ? Utilities.formatDate(pdRaw, 'Asia/Taipei', 'yyyy-MM-dd')
      : String(pdRaw).trim().slice(0, 10);

    var crRaw = r[pc.CREATED] || '';
    var crStr = crRaw instanceof Date
      ? Utilities.formatDate(crRaw, 'Asia/Taipei', 'yyyy-MM-dd HH:mm')
      : String(crRaw).trim().slice(0, 16);

    // ❌ 不回傳：phone(原值), line_uid, order_id, system_note
    list.push({
      id:            String(r[pc.ID]            || ''),
      cname:         String(r[pc.CNAME]         || ''),
      masked_phone:  maskPhone_(r[pc.PHONE]),
      qty:           Number(r[pc.QTY])          || 0,
      status:        String(r[pc.STATUS]        || ''),
      note:          String(r[pc.NOTE]          || ''),
      pickup_code:   String(r[pc.PICKUP_CODE]   || ''),
      pickup_date:   pdStr,
      pickup_status: String(r[pc.PICKUP_STATUS] || ''),
      picked_up_at:  String(r[pc.PICKED_UP_AT]  || ''),
      pickup_note:   String(r[pc.PICKUP_NOTE]   || ''),
      created:       crStr
    });
  });

  return {
    ok:            true,
    campaign_name: String(campRow[c.CAMPAIGN_NAME] || ''),
    data:          list
  };
}

// ── Admin API ─────────────────────────────────────────────────────

function adminSetLeaderToken(p) {
  if (!validateSession_(p.session_token)) return { ok: false, error: '未授權' };

  var phone = normalizePhone_(String(p.phone || '').trim());
  if (!phone) return { ok: false, error: '電話格式錯誤' };

  var lc   = COL.GROUP_LEADERS;
  var rows = getRows(SHEET.GROUP_LEADERS);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(String(rows[i][lc.PHONE] || '')) === phone) {
      found = rows[i]; break;
    }
  }
  if (!found) return { ok: false, error: '此電話不在團主來源表' };
  if (String(found[lc.LEVEL] || '') !== '團長') {
    return { ok: false, error: '此會員等級不是團長，請先在後台更新等級' };
  }

  var token = String(p.leader_token || '').trim();
  if (!/^[A-Za-z0-9!@#$%^&*]{8,32}$/.test(token)) {
    return { ok: false, error: 'token 格式錯誤（8–32 位英數或符號）' };
  }

  var hash = hashLeaderToken_(phone, token);
  if (!hash) {
    return { ok: false, error: 'LEADER_HMAC_SECRET 未設定，請在 GAS Script Properties 新增' };
  }

  PropertiesService.getScriptProperties().setProperty(
    'LEADER_TOKEN_HASH_' + phone,
    hash
  );

  // ❌ 嚴禁：Logger.log(token), return hash, 寫 sheet, 寫 system_note
  return { ok: true };
}

// ================================================================
// Module 7-D — 團長自設密碼啟用連結 + 停權管理
// ================================================================

var SETUP_TOKEN_TTL_MS    = 7 * 24 * 60 * 60 * 1000;
var SETUP_TOKEN_MAX_FAILS = 5;
var SETUP_TOKEN_FAIL_TTL  = 600;

function toSafeKey_(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function hashSetupToken_(rawToken) {
  var secret = PropertiesService.getScriptProperties()
                 .getProperty('LEADER_HMAC_SECRET');
  if (!secret) return null;
  return toSafeKey_(Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(rawToken, secret)
  ));
}

function generateSetupToken_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function storeSetupToken_(normalizedPhone, rawToken) {
  var hash = hashSetupToken_(rawToken);
  if (!hash) return false;
  var props  = PropertiesService.getScriptProperties();
  var expiry = String(Date.now() + SETUP_TOKEN_TTL_MS);
  var old = props.getProperty('LEADER_SETUP_' + normalizedPhone);
  if (old) {
    props.deleteProperty('LEADER_SETUP_REV_' + old.split('|')[0]);
  }
  props.setProperty('LEADER_SETUP_' + normalizedPhone, hash + '|' + expiry);
  props.setProperty('LEADER_SETUP_REV_' + hash, normalizedPhone);
  return true;
}

function invalidateSetupToken_(normalizedPhone) {
  var props  = PropertiesService.getScriptProperties();
  var stored = props.getProperty('LEADER_SETUP_' + normalizedPhone);
  if (stored) {
    props.deleteProperty('LEADER_SETUP_REV_' + stored.split('|')[0]);
    props.deleteProperty('LEADER_SETUP_' + normalizedPhone);
  }
}

function lookupSetupByToken_(rawToken) {
  var hash = hashSetupToken_(rawToken);
  if (!hash) return { ok: false, reason: 'config_error' };

  var failKey = 'LEADER_SETUP_FAIL_' + hash.slice(0, 12);
  var cache   = CacheService.getScriptCache();
  var fails   = parseInt(cache.get(failKey) || '0', 10);
  if (fails >= SETUP_TOKEN_MAX_FAILS) return { ok: false, reason: 'throttled' };

  var props = PropertiesService.getScriptProperties();
  var phone = props.getProperty('LEADER_SETUP_REV_' + hash);
  if (!phone) {
    cache.put(failKey, String(fails + 1), SETUP_TOKEN_FAIL_TTL);
    return { ok: false, reason: 'invalid' };
  }

  var stored = props.getProperty('LEADER_SETUP_' + phone);
  if (!stored) {
    cache.put(failKey, String(fails + 1), SETUP_TOKEN_FAIL_TTL);
    return { ok: false, reason: 'invalid' };
  }

  var parts      = stored.split('|');
  var storedHash = parts[0];
  var expiryMs   = parseInt(parts[1], 10);

  if (storedHash !== hash) {
    cache.put(failKey, String(fails + 1), SETUP_TOKEN_FAIL_TTL);
    return { ok: false, reason: 'invalid' };
  }
  if (Date.now() > expiryMs) return { ok: false, reason: 'expired' };

  cache.remove(failKey);
  return { ok: true, normalizedPhone: phone };
}

// ── 7-D Public APIs ───────────────────────────────────────────────

function validateLeaderSetupToken(p) {
  var rawToken = String(p.setup_token || '').trim();
  if (!rawToken) return { ok: false, error: '連結無效或已過期' };

  var result = lookupSetupByToken_(rawToken);
  if (!result.ok) return { ok: false, error: '連結無效或已過期' };

  var phone = result.normalizedPhone;
  var lc    = COL.GROUP_LEADERS;
  var rows  = getRows(SHEET.GROUP_LEADERS);
  var leaderRow = null;
  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(String(rows[i][lc.PHONE] || '')) === phone) {
      leaderRow = rows[i]; break;
    }
  }
  if (!leaderRow)
    return { ok: false, error: '連結無效或已過期' };
  if (String(leaderRow[lc.LEVEL] || '') !== '團長')
    return { ok: false, error: '連結無效或已過期' };
  var buyStatus = String(leaderRow[lc.BUY_STATUS] || '');
  if (buyStatus === '暫停' || buyStatus === '取消')
    return { ok: false, error: '連結無效或已過期' };

  return {
    ok:           true,
    masked_phone: maskPhone_(phone),
    name:         String(leaderRow[lc.NAME] || '')
  };
}

function completeLeaderSetup(p) {
  var rawToken        = String(p.setup_token          || '').trim();
  var password        = String(p.leader_token         || '').trim();
  var passwordConfirm = String(p.leader_token_confirm || '').trim();

  if (!rawToken || !password || !passwordConfirm)
    return { ok: false, error: '參數缺失' };
  if (password.length < 6)
    return { ok: false, error: '密碼至少 6 碼' };
  if (password.length > 64)
    return { ok: false, error: '密碼最多 64 碼' };
  if (password !== passwordConfirm)
    return { ok: false, error: '兩次密碼不一致' };

  var preCheck = lookupSetupByToken_(rawToken);
  if (!preCheck.ok) return { ok: false, error: '連結無效或已過期' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); }
  catch(e) { return { ok: false, error: '系統忙碌，請稍後再試' }; }

  try {
    var recheck = lookupSetupByToken_(rawToken);
    if (!recheck.ok) return { ok: false, error: '連結無效或已過期' };
    var phone = recheck.normalizedPhone;

    var lc    = COL.GROUP_LEADERS;
    var rows  = getRows(SHEET.GROUP_LEADERS);
    var leaderRow = null, leaderRowIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (normalizePhone_(String(rows[i][lc.PHONE] || '')) === phone) {
        leaderRow = rows[i]; leaderRowIdx = i; break;
      }
    }
    if (!leaderRow)
      return { ok: false, error: '帳號狀態異常，請聯繫幸福緣' };
    if (String(leaderRow[lc.LEVEL] || '') !== '團長')
      return { ok: false, error: '帳號狀態異常，請聯繫幸福緣' };
    var buyStatus = String(leaderRow[lc.BUY_STATUS] || '');
    if (buyStatus === '暫停' || buyStatus === '取消')
      return { ok: false, error: '帳號已暫停，請聯繫幸福緣' };

    var hash = hashLeaderToken_(phone, password);
    if (!hash) return { ok: false, error: 'LEADER_HMAC_SECRET 未設定' };
    PropertiesService.getScriptProperties()
      .setProperty('LEADER_TOKEN_HASH_' + phone, hash);

    invalidateSetupToken_(phone);

    var nowStr  = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
    var oldNote = String(leaderRow[lc.SYSTEM_NOTE] || '');
    var evtNote = '[' + nowStr + '] leader_password_setup_completed';
    var newNote = oldNote ? oldNote + '\n' + evtNote : evtNote;
    var sheet   = SpreadsheetApp.openById(SPREADSHEET_ID)
                    .getSheetByName(SHEET.GROUP_LEADERS);
    sheet.getRange(leaderRowIdx + DATA_ROW, lc.SYSTEM_NOTE + 1).setValue(newNote);
    SpreadsheetApp.flush();

    // ❌ 不 Logger.log(password), 不 Logger.log(hash)
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ── 7-D Admin APIs ────────────────────────────────────────────────

function adminCreateLeaderSetupLink(p) {
  if (!validateSession_(p.session_token)) return { ok: false, error: '未授權' };

  var phone = normalizePhone_(String(p.phone || '').trim());
  if (!phone) return { ok: false, error: '電話格式錯誤' };

  var lc   = COL.GROUP_LEADERS;
  var rows = getRows(SHEET.GROUP_LEADERS);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(String(rows[i][lc.PHONE] || '')) === phone) {
      found = rows[i]; break;
    }
  }
  if (!found)
    return { ok: false, error: '此電話不在團主來源表' };
  if (String(found[lc.LEVEL] || '') !== '團長')
    return { ok: false, error: '等級不是團長' };
  var status = String(found[lc.BUY_STATUS] || '');
  if (status === '暫停' || status === '取消')
    return { ok: false, error: '此團長已暫停/取消，不可產生連結' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); }
  catch(e) { return { ok: false, error: '系統忙碌，請稍後再試' }; }

  try {
    var rows2 = getRows(SHEET.GROUP_LEADERS);
    var found2 = null, rowIdx2 = -1;
    for (var j = 0; j < rows2.length; j++) {
      if (normalizePhone_(String(rows2[j][lc.PHONE] || '')) === phone) {
        found2 = rows2[j]; rowIdx2 = j; break;
      }
    }
    if (!found2)
      return { ok: false, error: '帳號不存在' };
    if (String(found2[lc.LEVEL] || '') !== '團長')
      return { ok: false, error: '等級已變更，不是團長' };
    var status2 = String(found2[lc.BUY_STATUS] || '');
    if (status2 === '暫停' || status2 === '取消')
      return { ok: false, error: '此團長已暫停/取消' };

    var rawToken = generateSetupToken_();
    if (!storeSetupToken_(phone, rawToken))
      return { ok: false, error: 'LEADER_HMAC_SECRET 未設定' };

    var expiryDate = Utilities.formatDate(
      new Date(Date.now() + SETUP_TOKEN_TTL_MS), 'Asia/Taipei', 'yyyy-MM-dd'
    );
    var baseUrl  = 'https://angel0973180707.github.io/Angel-Heart-health-kitchen/leader.html';
    var setupUrl = baseUrl + '#setup=' + rawToken;
    var copyText = '這是你的幸福緣團長中心啟用連結：\n' + setupUrl +
                   '\n\n請點開後自行設定登入密碼。\n連結有效期限：7 天，只能使用一次。';

    var nowStr  = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
    var oldNote = String(found2[lc.SYSTEM_NOTE] || '');
    var evtNote = '[' + nowStr + '] create_setup_link expires=' + expiryDate;
    var newNote = oldNote ? oldNote + '\n' + evtNote : evtNote;
    var sheet   = SpreadsheetApp.openById(SPREADSHEET_ID)
                    .getSheetByName(SHEET.GROUP_LEADERS);
    sheet.getRange(rowIdx2 + DATA_ROW, lc.SYSTEM_NOTE + 1).setValue(newNote);
    SpreadsheetApp.flush();

    // ❌ 不 Logger.log(rawToken), 不 Logger.log(setupUrl)
    return {
      ok:           true,
      setup_url:    setupUrl,
      copy_text:    copyText,
      masked_phone: maskPhone_(phone),
      expires_at:   expiryDate
    };
  } finally {
    lock.releaseLock();
  }
}

function adminSuspendGroupLeader(p) {
  if (!validateSession_(p.session_token)) return { ok: false, error: '未授權' };

  var phone  = normalizePhone_(String(p.phone  || '').trim());
  var reason = String(p.reason || '').trim();
  if (!phone)  return { ok: false, error: '電話格式錯誤' };
  if (!reason) return { ok: false, error: '停權原因必填' };

  var lc   = COL.GROUP_LEADERS;
  var rows = getRows(SHEET.GROUP_LEADERS);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(String(rows[i][lc.PHONE] || '')) === phone) {
      found = rows[i]; break;
    }
  }
  if (!found)
    return { ok: false, error: '此電話不在團主來源表' };
  if (String(found[lc.LEVEL] || '') !== '團長')
    return { ok: false, error: '等級不是團長' };
  var currentStatus = String(found[lc.BUY_STATUS] || '');
  if (currentStatus === '暫停')
    return { ok: false, error: '此團長已在暫停狀態' };
  if (currentStatus === '取消')
    return { ok: false, error: '此團長已取消資格，不可變更為暫停' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); }
  catch(e) { return { ok: false, error: '系統忙碌，請稍後再試' }; }

  try {
    var rows2 = getRows(SHEET.GROUP_LEADERS);
    var found2 = null, rowIdx2 = -1;
    for (var j = 0; j < rows2.length; j++) {
      if (normalizePhone_(String(rows2[j][lc.PHONE] || '')) === phone) {
        found2 = rows2[j]; rowIdx2 = j; break;
      }
    }
    if (!found2)
      return { ok: false, error: '帳號不存在' };
    if (String(found2[lc.LEVEL] || '') !== '團長')
      return { ok: false, error: '等級已變更' };
    var currentStatus2 = String(found2[lc.BUY_STATUS] || '');
    if (currentStatus2 === '暫停')
      return { ok: false, error: '已在暫停狀態' };
    if (currentStatus2 === '取消')
      return { ok: false, error: '已取消資格，不可變更為暫停' };

    var nowStr  = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
    var oldNote = String(found2[lc.SYSTEM_NOTE] || '');
    var append  = '[' + nowStr + '] suspend reason=' + reason;
    var newNote = oldNote ? oldNote + '\n' + append : append;

    var sheet   = SpreadsheetApp.openById(SPREADSHEET_ID)
                    .getSheetByName(SHEET.GROUP_LEADERS);
    var dataRow = rowIdx2 + DATA_ROW;
    sheet.getRange(dataRow, lc.BUY_STATUS       + 1).setValue('暫停');
    sheet.getRange(dataRow, lc.SUSPENDED_AT     + 1)
         .setNumberFormat('@').setValue(nowStr);
    sheet.getRange(dataRow, lc.SUSPENDED_REASON + 1).setValue(reason);
    sheet.getRange(dataRow, lc.SYSTEM_NOTE      + 1).setValue(newNote);
    SpreadsheetApp.flush();

    invalidateSetupToken_(phone);
    // ✅ LEADER_TOKEN_HASH_{phone} 保留不刪
    // ❌ 不碰 GROUP_CAMPAIGNS / GROUP_PLEDGES / GROUP_LEDGER

    return { ok: true, name: String(found2[lc.NAME] || '') };
  } finally {
    lock.releaseLock();
  }
}

function adminRestoreGroupLeader(p) {
  if (!validateSession_(p.session_token)) return { ok: false, error: '未授權' };

  var phone = normalizePhone_(String(p.phone || '').trim());
  var note  = String(p.note  || '').trim();
  if (!phone) return { ok: false, error: '電話格式錯誤' };
  if (!note)  return { ok: false, error: '備註必填' };

  var lc   = COL.GROUP_LEADERS;
  var rows = getRows(SHEET.GROUP_LEADERS);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(String(rows[i][lc.PHONE] || '')) === phone) {
      found = rows[i]; break;
    }
  }
  if (!found)
    return { ok: false, error: '此電話不在團主來源表' };
  if (String(found[lc.LEVEL] || '') !== '團長')
    return { ok: false, error: '等級不是團長' };
  if (String(found[lc.BUY_STATUS] || '') !== '暫停')
    return { ok: false, error: '此團長目前不在暫停狀態' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); }
  catch(e) { return { ok: false, error: '系統忙碌，請稍後再試' }; }

  try {
    var rows2 = getRows(SHEET.GROUP_LEADERS);
    var found2 = null, rowIdx2 = -1;
    for (var j = 0; j < rows2.length; j++) {
      if (normalizePhone_(String(rows2[j][lc.PHONE] || '')) === phone) {
        found2 = rows2[j]; rowIdx2 = j; break;
      }
    }
    if (!found2)
      return { ok: false, error: '帳號不存在' };
    if (String(found2[lc.LEVEL] || '') !== '團長')
      return { ok: false, error: '等級已變更' };
    if (String(found2[lc.BUY_STATUS] || '') !== '暫停')
      return { ok: false, error: '狀態已變更，不在暫停中' };

    var nowStr  = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
    var oldNote = String(found2[lc.SYSTEM_NOTE] || '');
    var append  = '[' + nowStr + '] restore note=' + note;
    var newNote = oldNote ? oldNote + '\n' + append : append;

    var sheet   = SpreadsheetApp.openById(SPREADSHEET_ID)
                    .getSheetByName(SHEET.GROUP_LEADERS);
    var dataRow = rowIdx2 + DATA_ROW;
    sheet.getRange(dataRow, lc.BUY_STATUS    + 1).setValue('正常');
    sheet.getRange(dataRow, lc.OVERRIDE_NOTE + 1).setValue(note);
    sheet.getRange(dataRow, lc.SYSTEM_NOTE   + 1).setValue(newNote);
    SpreadsheetApp.flush();

    // ✅ 不自動產生 setup link
    // ✅ LEADER_TOKEN_HASH_{phone} 保留不動
    // ❌ 不碰 GROUP_CAMPAIGNS / GROUP_PLEDGES / GROUP_LEDGER

    return { ok: true, name: String(found2[lc.NAME] || '') };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// Module 7-E — 後台新增團長
// ================================================================

function adminCreateGroupLeader(p) {
  if (!validateSession_(p.session_token)) return { ok: false, error: '未授權' };

  var name       = String(p.name       || '').trim();
  var group_name = String(p.group_name || '').trim();
  var phone      = normalizePhone_(String(p.phone || '').trim());
  var note       = String(p.note       || '').trim();

  if (!name)       return { ok: false, error: '姓名必填' };
  if (!group_name) return { ok: false, error: '團名必填' };
  if (!phone)      return { ok: false, error: '電話格式錯誤' };

  // 鎖外預檢（加速常見衝突拒絕）
  var lc   = COL.GROUP_LEADERS;
  var rows = getRows(SHEET.GROUP_LEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(String(rows[i][lc.PHONE] || '')) === phone)
      return { ok: false, error: '此手機已存在' };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); }
  catch(e) { return { ok: false, error: '系統忙碌，請稍後再試' }; }

  try {
    // 鎖內再查一次，防並發重複
    var rows2 = getRows(SHEET.GROUP_LEADERS);
    for (var j = 0; j < rows2.length; j++) {
      if (normalizePhone_(String(rows2[j][lc.PHONE] || '')) === phone)
        return { ok: false, error: '此手機已存在' };
    }

    var nowStr = now();
    var id     = genId('GL');
    var sheet  = getSheet(SHEET.GROUP_LEADERS);

    sheet.appendRow([
      id,           //  0  ID
      "'" + phone,  //  1  PHONE（前導 ' 強制 Sheets 存文字，保留前導 0）
      name,         //  2  NAME
      '團長',       //  3  LEVEL
      '後台新增',   //  4  APPROVE_METHOD
      nowStr,       //  5  APPROVE_DATE
      0,            //  6  NO_SHOW_COUNT
      '正常',       //  7  BUY_STATUS
      group_name,   //  8  SOURCE_LEADER
      '',           //  9  FIRST_LED_AT
      '',           // 10  LINE_UID
      note,         // 11  NOTE
      '',           // 12  SUSPENDED_AT
      '',           // 13  SUSPENDED_REASON
      '',           // 14  OVERRIDE_UNTIL
      '',           // 15  OVERRIDE_NOTE
      '[' + nowStr + '] admin_create_leader'  // 16  SYSTEM_NOTE
    ]);
    SpreadsheetApp.flush();

    // ❌ 不碰 GROUP_LEDGER / GROUP_CAMPAIGNS / GROUP_PLEDGES
    return { ok: true, id: id, masked_phone: maskPhone_(phone), name: name, group_name: group_name };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// Phase 1-B — 母模化 System_Config 通路測試（唯讀）
// ================================================================

function getSystemConfig(p) {
  // 唯讀，不查表、不寫入、不需要 LockService、不需要 session_token
  // ❌ 嚴禁在此函式引用 SPREADSHEET_ID / LINE_TOKEN / 任何 Script Property
  return {
    ok:      true,
    version: 'Phase 1-B',
    data: {
      BRAND_NAME:       '幸福緣好物市集',
      SITE_BASE_URL:    'https://angel0973180707.github.io/Angel-Heart-health-kitchen',
      LINE_OA_URL:      'https://lin.ee/tMag2XG',
      ENABLE_GROUP_BUY: true,
      ENABLE_POS:       true,
      ENABLE_EVENTS:    true
    }
  };
}
