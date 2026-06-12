// ================================================================
// 養清倉管系統 GAS 後台 v2.1
// Spreadsheet ID: 1geF1x3u9T_S6gmJlnLiV6-x77t66WtI4bON_Nr3FH6w
// 更新日期：2026-06-12
// v2.1 新增：自動下架、封面圖、點數記錄
// ================================================================

const SPREADSHEET_ID = '1geF1x3u9T_S6gmJlnLiV6-x77t66WtI4bON_Nr3FH6w';
const ADMIN_KEY = 'YANGCHING2025';

// LINE 通知設定
const LINE_TOKEN   = 'SGl/bUCnFz3NpOQJJKJTU+zTKgkqtIfdAKE1FM4v6Eu6KKm8i+MmbXsegjW3ef8WLBxNzoIx6oZfh67alrl5OUTdyPezUDiVTz7nbLTwbLESCzzTAQnxcRuwBaKihcgUT1z+ZtQ7Z8QFVOJQhJ4VRAdB04t89/1O/w1cDnyilFU=';
const LINE_USER_ID = 'U045fa7302eac96a6d54261d38a67f1b7';

function sendLineMsg(message) {
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LINE_TOKEN
      },
      payload: JSON.stringify({
        to: LINE_USER_ID,
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
  MEMBERS:       '會員',
  POINTS_LOG:    '點數記錄',
  RETURNS:       '退貨記錄'
};

// 欄位索引（0起算）
const COL = {
  PRODUCTS: {
    ID:0, NAME:1, CODE:2, COST:3, PRICE:4, IMAGE:5,
    DESC:6, CATEGORY:7, STATUS:8, THRESHOLD:9, CREATED:10
  },
  INVENTORY: { ID:0, NAME:1, QTY:2, UPDATED:3 },
  STOCK_LOG: { ID:0, PID:1, NAME:2, TYPE:3, QTY:4, PRICE:5, PARTNER:6, NOTE:7, CREATED:8 },
  ORDERS:    { ID:0, CNAME:1, PHONE:2, ADDRESS:3, ITEMS:4, TOTAL:5, PAYMENT:6, STATUS:7, NOTE:8, CREATED:9 },
  ACCOUNTS:  { ID:0, DATE:1, TYPE:2, PARTNER:3, ITEMS:4, INCOME:5, EXPENSE:6, PAYMENT:7, STATUS:8, NOTE:9, CREATED:10 },
  BALANCE:   { ITEM:0, AMOUNT:1, UPDATED:2 },
  EVENTS: {
    ID:0, NAME:1, DATE:2, LOCATION:3, DESC:4, CAPACITY:5, REGISTERED:6,
    ACCOM_QUOTA:7, NO_ACCOM_QUOTA:8, FEE_SINGLE:9, FEE_YEARLY:10, FEE_HALF:11,
    STATUS:12, CREATED:13, IMAGE:14
  },
  REGISTRATIONS: {
    ID:0, EID:1, ENAME:2, NAME:3, PHONE:4, ADDRESS:5, FEE_TYPE:6,
    FEE_AMOUNT:7, FEE_STATUS:8, HEALTH:9, RELIGION:10, SKILLS:11,
    EMERGENCY_NAME:12, EMERGENCY_PHONE:13, ACCOMMODATION:14, NOTE:15, CREATED:16
  },
  MEMBERS:    { ID:0, NAME:1, PHONE:2, BIRTHDAY:3, POINTS:4, TOTAL_SPENT:5, JOINED:6, NOTE:7 },
  POINTS_LOG: { ID:0, PHONE:1, NAME:2, ACTION:3, POINTS:4, BALANCE:5, NOTE:6, CREATED:7 },
  RETURNS: {
    ID:0, ORDER_ID:1, PHONE:2, NAME:3, PRODUCT_ID:4, PRODUCT_NAME:5,
    QTY:6, REFUND_AMOUNT:7, PAYMENT:8, REASON:9, POINTS_DEDUCTED:10,
    STATUS:11, NOTE:12, CREATED:13
  }
};

const DATA_ROW = 3;

// ================================================================
// 入口
// ================================================================
function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const post   = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    const p      = Object.assign({}, params, post);
    const action = p.action || '';

    const adminActions = [
      'addProduct','updateProduct','deleteProduct',
      'stockIn','stockOut','syncInventory',
      'updateOrder',
      'addAccount','updateAccount','refreshBalance',
      'addEvent','updateEvent','deleteEvent',
      'updateRegistration',
      'getPointsLog','addPoints',
      'addReturn','getReturns','updateReturn'
    ];

    if (adminActions.includes(action) && p.key !== ADMIN_KEY) {
      return res({ ok: false, error: '未授權' });
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

      case 'getOrders':          return res(getOrders(p));
      case 'addOrder':           return res(addOrder(p));
      case 'updateOrder':        return res(updateOrder(p));

      case 'getAccounts':        return res(getAccounts(p));
      case 'addAccount':         return res(addAccount(p));
      case 'updateAccount':      return res(updateAccount(p));
      case 'getBalance':         return res(getBalance());
      case 'refreshBalance':     return res(refreshBalance());

      case 'getEvents':          return res(getEvents(p));
      case 'addEvent':           return res(addEvent(p));
      case 'updateEvent':        return res(updateEvent(p));
      case 'deleteEvent':        return res(deleteEvent(p));

      case 'getRegistrations':   return res(getRegistrations(p));
      case 'addRegistration':    return res(addRegistration(p));
      case 'updateRegistration': return res(updateRegistration(p));

      case 'getMember':          return res(getMember(p));
      case 'registerMember':     return res(registerMember(p));
      case 'updateMember':       return res(updateMember(p));
      case 'addPoints':          return res(addPoints(p));
      case 'getPointsLog':       return res(getPointsLog(p));

      case 'addReturn':          return res(addReturn(p));
      case 'getReturns':         return res(getReturns(p));
      case 'updateReturn':       return res(updateReturn(p));

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
  const found = findRow(SHEET.PRODUCTS, COL.PRODUCTS.ID, p.product_id);
  if (!found) return { ok: false, error: '找不到商品' };
  getSheet(SHEET.PRODUCTS).deleteRow(found.rowNum);
  return { ok: true };
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
  const result = updateQty(p.product_id, qty, 'in');
  if (!result.ok) return result;
  getSheet(SHEET.STOCK_LOG).appendRow([
    genId('L'), p.product_id, result.name, '入庫',
    qty, p.price||'', p.partner||'總部', p.note||'', now()
  ]);
  if (p.price && p.auto_account !== 'false') {
    addAccount({
      key: ADMIN_KEY,
      date: today(), type: '進貨付款',
      partner: p.partner||'總部',
      items: result.name + ' x' + qty,
      income: '', expense: Number(p.price) * qty,
      payment: p.payment||'匯款', status: '待付款', note: p.note||''
    });
  }
  return { ok: true, new_qty: result.new_qty };
}

function stockOut(p) {
  const qty = parseInt(p.qty);
  if (!p.product_id || !qty || qty < 1) return { ok: false, error: '缺少必要欄位' };
  const result = updateQty(p.product_id, qty, 'out');
  if (!result.ok) return result;
  getSheet(SHEET.STOCK_LOG).appendRow([
    genId('L'), p.product_id, result.name, '出庫',
    qty, p.price||'', p.partner||'', p.note||'', now()
  ]);
  return { ok: true, new_qty: result.new_qty };
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
    created_at:    r[c.CREATED]
  })).filter(x => x.order_id);

  if (p.status) list = list.filter(x => x.status === p.status);
  list.reverse();
  return { ok: true, data: list };
}

const ORDER_TOKEN = 'YC_SHOP_2026';

function addOrder(p) {
  if (p.token !== ORDER_TOKEN) return { ok: false, error: '驗證失敗' };
  if (!p.customer_name || !p.phone || !p.items) return { ok: false, error: '缺少必要欄位' };
  const id = 'ORD' + Date.now();
  getSheet(SHEET.ORDERS).appendRow([
    id, p.customer_name, p.phone, p.address||'',
    p.items, p.total||0, p.payment||'ATM轉帳',
    '待確認', p.note||'', now()
  ]);
  sendLineMsg(`🛒 新訂單！\n客人：${p.customer_name}\n電話：${p.phone}\n金額：NT$ ${Number(p.total||0).toLocaleString()}\n付款：${p.payment||'ATM轉帳'}\n備註：${p.note||'無'}\n時間：${now()}`);
  if (p.auto_deduct === 'true') {
    try {
      JSON.parse(p.items).forEach(item => {
        stockOut({ product_id: item.product_id, qty: item.qty,
                   price: item.price, partner: p.customer_name, note: '訂單:'+id });
      });
    } catch(e) {}
  }
  return { ok: true, order_id: id };
}

function updateOrder(p) {
  if (!p.order_id) return { ok: false, error: '缺少 order_id' };
  const found = findRow(SHEET.ORDERS, COL.ORDERS.ID, p.order_id);
  if (!found) return { ok: false, error: '找不到訂單' };
  const sheet = getSheet(SHEET.ORDERS);
  const c = COL.ORDERS;
  const rn = found.rowNum;
  if (p.status !== undefined) sheet.getRange(rn, c.STATUS+1).setValue(p.status);
  if (p.note   !== undefined) sheet.getRange(rn, c.NOTE+1).setValue(p.note);
  if (p.status === '已確認' && p.deduct === 'true') {
    try {
      const items = JSON.parse(found.row[c.ITEMS]);
      items.forEach(item => {
        stockOut({ product_id: item.product_id, qty: item.qty,
                   price: item.price, partner: found.row[c.CNAME], note: '訂單:'+p.order_id });
      });
      addAccount({
        key: ADMIN_KEY,
        date: today(), type: '銷售收款',
        partner: found.row[c.CNAME],
        items: '訂單 ' + p.order_id,
        income: found.row[c.TOTAL], expense: '',
        payment: found.row[c.PAYMENT], status: '待收款', note: ''
      });
    } catch(e) {}
  }
  return { ok: true };
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
  const id = genId('A');
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
  const rows = getRows(SHEET.ACCOUNTS);
  const c = COL.ACCOUNTS;
  let totalIncome = 0, totalExpense = 0, receivable = 0, payable = 0;
  const thisMonth = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  let monthIncome = 0, monthExpense = 0;

  rows.forEach(r => {
    const income  = Number(r[c.INCOME])  || 0;
    const expense = Number(r[c.EXPENSE]) || 0;
    totalIncome  += income;
    totalExpense += expense;
    if (r[c.STATUS] === '待收款') receivable += income;
    if (r[c.STATUS] === '待付款') payable    += expense;
    if (String(r[c.DATE]).startsWith(thisMonth)) {
      monthIncome  += income;
      monthExpense += expense;
    }
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
    status:         r[c.STATUS],
    created_at:     r[c.CREATED],
    image_url:      r[c.IMAGE] || ''
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
    p.image_url||''
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
  if (p.image_url   !== undefined) sheet.getRange(rn, c.IMAGE+1).setValue(p.image_url);
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
    created_at:      r[c.CREATED]
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
  const found = findRow(SHEET.EVENTS, COL.EVENTS.ID, p.event_id);
  if (!found) return { ok: false, error: '找不到活動' };
  const event = found.row;
  const c = COL.EVENTS;
  const capacity   = parseInt(event[c.CAPACITY])   || 0;
  const registered = parseInt(event[c.REGISTERED]) || 0;
  if (capacity > 0 && registered >= capacity) return { ok: false, error: '報名人數已額滿' };
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
  sendLineMsg(`📅 新報名！\n活動：${event[c.NAME]}\n姓名：${p.name}\n電話：${p.phone}\n住宿：${p.accommodation||'不住宿'}\n繳費：${feeType} NT$ ${Number(feeAmount).toLocaleString()}\n時間：${now()}`);
  return { ok: true, reg_id: id, fee_amount: feeAmount };
}

function updateRegistration(p) {
  if (!p.reg_id) return { ok: false, error: '缺少 reg_id' };
  const found = findRow(SHEET.REGISTRATIONS, COL.REGISTRATIONS.ID, p.reg_id);
  if (!found) return { ok: false, error: '找不到報名記錄' };
  const sheet = getSheet(SHEET.REGISTRATIONS);
  const c = COL.REGISTRATIONS;
  const rn = found.rowNum;
  if (p.fee_status    !== undefined) sheet.getRange(rn, c.FEE_STATUS+1).setValue(p.fee_status);
  if (p.note          !== undefined) sheet.getRange(rn, c.NOTE+1).setValue(p.note);
  if (p.accommodation !== undefined) sheet.getRange(rn, c.ACCOMMODATION+1).setValue(p.accommodation);
  if (p.fee_status === '已繳費') {
    addAccount({
      key: ADMIN_KEY,
      date: today(), type: '銷售收款',
      partner: found.row[c.NAME],
      items: '活動報名費 ' + found.row[c.ENAME],
      income: found.row[c.FEE_AMOUNT], expense: '',
      payment: p.payment||'匯款', status: '已收款', note: p.reg_id||''
    });
    refreshBalance();
  }
  return { ok: true };
}

// ================================================================
// 會員管理
// ================================================================
function getMember(p) {
  if (p.all === 'true') {
    const rows = getRows(SHEET.MEMBERS);
    const c = COL.MEMBERS;
    return {
      ok: true,
      data: rows.map(r => ({
        member_id:   r[c.ID],
        name:        r[c.NAME],
        phone:       r[c.PHONE],
        birthday:    r[c.BIRTHDAY],
        points:      Number(r[c.POINTS]) || 0,
        total_spent: Number(r[c.TOTAL_SPENT]) || 0,
        joined_at:   r[c.JOINED],
        note:        r[c.NOTE]
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
      member_id:      member[c.ID],
      name:           member[c.NAME],
      phone:          member[c.PHONE],
      birthday:       member[c.BIRTHDAY],
      points:         Number(member[c.POINTS]) || 0,
      total_spent:    Number(member[c.TOTAL_SPENT]) || 0,
      joined_at:      member[c.JOINED],
      note:           member[c.NOTE],
      is_birth_month: birthday && birthday.getMonth() === new Date().getMonth(),
      recent_orders:  myOrders
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
  getSheet(SHEET.MEMBERS).appendRow([id, p.name, p.phone, p.birthday||'', 0, 0, now(), p.note||'']);
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
      // 寫點數記錄
      const logSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET.POINTS_LOG);
      if (logSheet) {
        logSheet.appendRow(['PT'+Date.now(), p.phone, rows[i][c.NAME],
          addPts > 0 ? '加點' : '扣點', addPts, newBal, p.note||'', now()]);
      }
      return { ok: true, new_points: newBal };
    }
  }
  return { ok: false, error: '找不到會員' };
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
  let list = sheet.getRange(DATA_ROW, 1, last - DATA_ROW + 1, 8).getValues()
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
// 退貨退款
// ================================================================
function addReturn(p) {
  if (!p.name || !p.product_name || !p.qty) return { ok: false, error: '缺少必要欄位' };
  const id = genId('RT');
  const qty = parseInt(p.qty);
  const refundAmount = Number(p.refund_amount) || 0;
  const pointsDeducted = parseInt(p.points_deducted) || 0;

  // 寫退貨記錄
  getSheet(SHEET.RETURNS).appendRow([
    id, p.order_id||'', p.phone||'', p.name,
    p.product_id||'', p.product_name,
    qty, refundAmount, p.payment||'現金',
    p.reason||'', pointsDeducted,
    '待處理', p.note||'', now()
  ]);

  // 庫存加回
  if (p.product_id) {
    try { updateQty(p.product_id, qty, 'in'); } catch(e) {}
  }

  // 帳本寫退款支出
  addAccount({
    key: ADMIN_KEY,
    date: today(), type: '退款支出',
    partner: p.name,
    items: p.product_name + ' x' + qty + ' 退貨',
    income: '', expense: refundAmount,
    payment: p.payment||'現金', status: '待退款', note: p.reason||''
  });

  // 扣回點數
  if (pointsDeducted > 0 && p.phone) {
    try {
      addPoints({ phone: p.phone, points: -pointsDeducted, note: '退貨扣點：' + p.product_name });
    } catch(e) {}
  }

  // LINE 通知
  sendLineMsg(`↩️ 退貨申請\n客人：${p.name}${p.phone?' · '+p.phone:''}\n商品：${p.product_name} × ${qty}\n退款：NT$ ${refundAmount.toLocaleString()}\n原因：${p.reason||'—'}\n時間：${now()}`);

  return { ok: true, return_id: id };
}

function getReturns(p) {
  const rows = getRows(SHEET.RETURNS);
  const c = COL.RETURNS;
  let list = rows.map(r => ({
    return_id:       r[c.ID],
    order_id:        r[c.ORDER_ID],
    phone:           r[c.PHONE],
    name:            r[c.NAME],
    product_id:      r[c.PRODUCT_ID],
    product_name:    r[c.PRODUCT_NAME],
    qty:             r[c.QTY],
    refund_amount:   r[c.REFUND_AMOUNT],
    payment:         r[c.PAYMENT],
    reason:          r[c.REASON],
    points_deducted: r[c.POINTS_DEDUCTED],
    status:          r[c.STATUS],
    note:            r[c.NOTE],
    created_at:      r[c.CREATED]
  })).filter(x => x.return_id);
  if (p.status) list = list.filter(x => x.status === p.status);
  list.reverse();
  return { ok: true, data: list };
}

function updateReturn(p) {
  if (!p.return_id) return { ok: false, error: '缺少 return_id' };
  const found = findRow(SHEET.RETURNS, COL.RETURNS.ID, p.return_id);
  if (!found) return { ok: false, error: '找不到退貨記錄' };
  const sheet = getSheet(SHEET.RETURNS);
  const c = COL.RETURNS;
  const rn = found.rowNum;
  if (p.status !== undefined) sheet.getRange(rn, c.STATUS+1).setValue(p.status);
  if (p.note   !== undefined) sheet.getRange(rn, c.NOTE+1).setValue(p.note);
  // 確認已退款 → 更新帳本狀態
  if (p.status === '已退款') refreshBalance();
  return { ok: true };
}
