/**
 * 養清倉管 GAS 修改清單
 * 適用主程式版本：v2.0（2026-06-10）
 *
 * ════════════════════════════════════════════════
 * ✅ Tasks 2 & 3（LINE 通知）已內建在 v2.0 主程式，不需再貼
 *
 * 還需要貼的修改（共 3 個）：
 *   Task 5：updateQty → 取代主程式同名函式
 *   Task 6：addEvent  → 取代主程式同名函式（需先加欄位，見說明）
 *   Task 7：addPoints → 取代主程式同名函式
 *           getPointsLog → 貼到主程式最下面（新增）
 *
 * 改完後重新部署：管理部署 → 編輯 → 新版本 → 部署
 * ════════════════════════════════════════════════
 */


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
        Logger.log('商品自動下架：' + productId);
      }
    } catch(e) {}
  }
  return { ok: true, new_qty: newQty, name: found.row[COL.INVENTORY.NAME] };
}


// ════════════════════════════════════════════════
// Task 6：活動封面圖
//
// 步驟（貼函式之前先做）：
// 1. 打開試算表「活動主檔」
//    在最右邊（O欄，第15欄）新增欄位標題：
//    第1列填「封面圖片」，第2列填「image_url」
//
// 2. 找到主程式 COL 設定裡的 EVENTS 那段，
//    在 CREATED:13 後面加上一個逗號，再補上：IMAGE: 14
//    改完像這樣：
//    EVENTS: { ..., STATUS:12, CREATED:13, IMAGE:14 }
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


// ════════════════════════════════════════════════
// Task 7：點數記錄
//
// 步驟（貼函式之前先做）：
// 1. 在試算表新增工作表，名稱：點數記錄
//    第1列填中文標題（隨意），第2列填英文：
//    A2=log_id  B2=member_phone  C2=member_name  D2=action
//    E2=points  F2=balance       G2=note         H2=created_at
//    第3列起是資料（不要預先填）
//
// 2. 把下面 addPoints 取代主程式中的同名函式
//
// 3. 把下面 getPointsLog 貼到主程式最下面（新增函式）
//
// 4. 在主程式 switch 裡找到 case 'addPoints': 那行附近，
//    在它後面新增一行：
//    case 'getPointsLog': return res(getPointsLog(p));
// ════════════════════════════════════════════════

var SHEET_POINTS_LOG = '點數記錄';

// ── 取代主程式的 addPoints（加寫 點數記錄）──
function addPoints(p) {
  if (!p.phone || !p.points) return { ok: false, error: '缺少必要欄位' };
  const rows = getRows(SHEET.MEMBERS);
  const c = COL.MEMBERS;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][c.PHONE]) === String(p.phone)) {
      const sheet = getSheet(SHEET.MEMBERS);
      const rn = DATA_ROW + i;
      const cur      = Number(rows[i][c.POINTS]) || 0;
      const spent    = Number(rows[i][c.TOTAL_SPENT]) || 0;
      const addPts   = Number(p.points);
      const newBal   = cur + addPts;
      sheet.getRange(rn, c.POINTS+1).setValue(newBal);
      sheet.getRange(rn, c.TOTAL_SPENT+1).setValue(spent + Number(p.amount || 0));
      // 寫點數記錄
      const logSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_POINTS_LOG);
      if (logSheet) {
        logSheet.appendRow([
          'PT' + Date.now(), p.phone, rows[i][c.NAME],
          addPts > 0 ? '加點' : '扣點',
          addPts, newBal, p.note || '', now()
        ]);
      }
      return { ok: true, new_points: newBal };
    }
  }
  return { ok: false, error: '找不到會員' };
}

// ── 新增函式（貼到主程式最下面）──
function getPointsLog(p) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_POINTS_LOG);
  if (!sheet) return { ok: true, data: [] };
  const last = sheet.getLastRow();
  if (last < DATA_ROW) return { ok: true, data: [] };
  let list = sheet.getRange(DATA_ROW, 1, last - DATA_ROW + 1, 8).getValues()
    .map(r => ({
      log_id:       r[0],
      member_phone: r[1],
      member_name:  r[2],
      action:       r[3],
      points:       r[4],
      balance:      r[5],
      note:         r[6],
      created_at:   r[7]
    })).filter(x => x.log_id);
  if (p.phone) list = list.filter(x => String(x.member_phone) === String(p.phone));
  list.reverse();
  return { ok: true, data: list.slice(0, Number(p.limit) || 100) };
}
