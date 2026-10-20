const STOCK_SHEET_ID = '1tHDqaApj978tVT8SnSlQ0S-EytkmNM0MlnD8i5cIapc';
const STOCK_TAB_ID = 0;
const UNIT_KEY = 'LC_CARIBBEAN_UNIT_V1';
const ALLOCATION_KEY = 'LC_CARIBBEAN_ALLOCATION_V1';
const STOCK_DAY_MS = 86400000;

function stockActor_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!/^[^@\s]+@livingculture\.co\.nz$/.test(email)) throw new Error('Sign in with your Living Culture Google account.');
  return email;
}
function stockSheet_() {
  const sheet = SpreadsheetApp.openById(STOCK_SHEET_ID).getSheets().find(item => item.getSheetId() === STOCK_TAB_ID);
  if (!sheet) throw new Error('The Caribbean stock tab could not be found.');
  return sheet;
}
function stockText_(value) { return String(value == null ? '' : value).replace(/\s+/g,' ').trim(); }
function stockKey_(value) { return stockText_(value).toLowerCase().replace(/[^a-z0-9]/g,''); }
function stockHash_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)));
}
function stockColumns_(headings) {
  const keys = headings.map(stockKey_);
  const pick = aliases => keys.findIndex(key => aliases.indexOf(key) !== -1);
  const columns = {
    code:pick(['cscode','sku','code']),name:pick(['name','product','productname']),type:pick(['type']),size:pick(['size']),colour:pick(['color','colour']),
    akl:pick(['availableakl','availableauckland','akl']),water:pick(['availableonwater','onwater']),foshan:pick(['availablefoshan','foshan']),
    notes:pick(['notes','note']),quote:pick(['quotenumber','quoteno','quote','ordernumber']),date:pick(['date']),
  };
  ['code','name','akl','water','foshan','quote','date'].forEach(field => { if (columns[field] < 0) throw new Error('Missing spreadsheet heading: '+field+'. No update attempted.'); });
  return columns;
}
function stockMetadata_(sheet, key) {
  const result = {};
  sheet.createDeveloperMetadataFinder().withKey(key).find().forEach(item => {
    const location = item.getLocation().getRow();
    if (!location) return;
    const number = location.getRow();
    if (result[number]) throw new Error('Duplicate stock row metadata. Ask Admin to review the sheet.');
    result[number] = {id:item.getId(),value:item.getValue()};
  });
  return result;
}
function stockColourState_(backgrounds) {
  let yellow = 0, red = 0, other = 0;
  backgrounds.forEach(value => {
    const hex = String(value).toLowerCase();
    if (['#ffffff','#fff',''].indexOf(hex) !== -1) return;
    if (!/^#[a-f0-9]{6}$/.test(hex)) { other++;return; }
    const r = parseInt(hex.slice(1,3),16),g = parseInt(hex.slice(3,5),16),b = parseInt(hex.slice(5,7),16);
    if (r > 180 && g > 170 && r > b+15 && g > b+12) yellow++;
    else if (r > 160 && r > g+20 && r > b+20 && Math.abs(g-b) < 50) red++;
    else other++;
  });
  if (red && yellow) return 'Review status';
  if (red) return 'Paid';
  if (yellow) return 'Held';
  return other ? 'Review status' : 'Available';
}
function stockRows_(sheet, assignIds) {
  const range = sheet.getDataRange(), values = range.getValues(), display = range.getDisplayValues(), backgrounds = range.getBackgrounds();
  if (!values.length) throw new Error('The stock sheet is empty.');
  const columns = stockColumns_(display[0]), ids = stockMetadata_(sheet,UNIT_KEY), allocations = stockMetadata_(sheet,ALLOCATION_KEY);
  const rows = [], requests = [], unique = {};
  for (let i = 1; i < values.length; i++) {
    const code = stockText_(display[i][columns.code]),name = stockText_(display[i][columns.name]);
    if (!code || !name) continue;
    const rowNumber = i+1;
    let id = ids[rowNumber] && ids[rowNumber].value;
    if (!id && assignIds) {
      id = Utilities.getUuid();
      requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:UNIT_KEY,metadataValue:id,visibility:'DOCUMENT',location:{dimensionRange:{sheetId:STOCK_TAB_ID,dimension:'ROWS',startIndex:i,endIndex:i+1}}}}});
    }
    if (!id) throw new Error('Stock row IDs need initialising. Refresh the list.');
    if (unique[id]) throw new Error('Duplicate stock unit ID. Ask Admin to review copied rows.');
    unique[id] = true;
    const stock = [['Auckland',columns.akl],['On water',columns.water],['Foshan',columns.foshan]].map(pair => {
      const raw = values[i][pair[1]];
      return {name:pair[0],quantity:raw === '' ? 0 : typeof raw === 'number' && isFinite(raw) ? raw : /^\d+(?:\.0+)?$/.test(stockText_(raw)) ? Number(raw) : NaN};
    });
    const validUnit = stock.every(item => Number.isInteger(item.quantity) && item.quantity >= 0) && stock.reduce((sum,item) => sum+item.quantity,0) === 1;
    const quote = stockText_(display[i][columns.quote]);
    let status = stockColourState_(backgrounds[i]), allocation = null;
    if (allocations[rowNumber]) {
      try { allocation = JSON.parse(allocations[rowNumber].value); } catch (error) { throw new Error('Invalid stock allocation metadata. Ask Admin to review the sheet.'); }
    }
    const currentAllocation = allocation && quote === allocation.quote && status === allocation.status ? allocation : null;
    if (status === 'Available' && quote) status = 'Allocated';
    if (status === 'Held' && currentAllocation && currentAllocation.expiresAt <= Date.now()) status = 'Expired hold';
    if (!validUnit) status = 'Check quantities';
    const serialValues = values[i].map(value => value instanceof Date ? value.toISOString() : value);
    rows.push({id,rowNumber,code,name,type:columns.type < 0 ? '' : stockText_(display[i][columns.type]),size:columns.size < 0 ? '' : stockText_(display[i][columns.size]),colour:columns.colour < 0 ? '' : stockText_(display[i][columns.colour]),
      location:stock.filter(item => item.quantity > 0).map(item => item.name).join(' / ') || 'Not recorded',notes:columns.notes < 0 ? '' : stockText_(display[i][columns.notes]),
      quote,date:stockText_(display[i][columns.date]),status,validUnit,revision:stockHash_([id,serialValues,backgrounds[i],allocations[rowNumber] && allocations[rowNumber].value || '']),
      allocation:currentAllocation ? {actor:currentAllocation.actor,customer:currentAllocation.customer,rep:currentAllocation.rep,at:currentAllocation.at,expiresAt:currentAllocation.expiresAt} : null,
      _record:allocation,_metadataId:allocations[rowNumber] && allocations[rowNumber].id});
  }
  if (requests.length) Sheets.Spreadsheets.batchUpdate({requests},STOCK_SHEET_ID);
  return {rows,columns,width:values[0].length};
}
function stockPublic_(row) {
  const result = {};
  Object.keys(row).filter(key => key.charAt(0) !== '_').forEach(key => result[key] = row[key]);
  return result;
}
function stockPayload_(sheet, data, actor) {
  return {actor,readAt:new Date().toISOString(),spreadsheetUrl:'https://docs.google.com/spreadsheets/d/'+STOCK_SHEET_ID+'/edit?gid='+STOCK_TAB_ID+'#gid='+STOCK_TAB_ID,rows:data.rows.map(stockPublic_)};
}
function doGet() {
  stockActor_();
  return HtmlService.createHtmlOutputFromFile('Stock').setTitle('Living Culture - Caribbean Stock').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function getStock() {
  const actor = stockActor_(), lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { const sheet = stockSheet_();return stockPayload_(sheet,stockRows_(sheet,true),actor); }
  finally { lock.releaseLock(); }
}
function updateStock(input) {
  const actor = stockActor_();
  if (!input || ['hold','paid'].indexOf(input.action) === -1) throw new Error('Choose Hold or Mark paid.');
  const quote = stockText_(input.quote).toUpperCase(),customer = stockText_(input.customer),rep = stockText_(input.rep);
  if (!/^(?:NZSO-?\d+|SFOR\d+(?:-[A-Z0-9]+)?)$/.test(quote) || quote.length > 40) throw new Error('Enter a valid NZSO or SFOR quote number.');
  if (!customer || customer.length > 150 || !rep || rep.length > 100) throw new Error('Enter the customer and rep.');
  if (input.confirmed !== true) throw new Error(input.action === 'hold' ? 'Confirm the quote is valid and the customer has verbally agreed to pay.' : 'Confirm payment has been received.');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(String(input.requestId || ''))) throw new Error('A request ID is required. Refresh and try again.');
  const requestHash = stockHash_([input.unitId,input.action,quote,customer,rep,actor]);
  const lock = LockService.getScriptLock();lock.waitLock(15000);
  try {
    const sheet = stockSheet_(),data = stockRows_(sheet,false),unit = data.rows.find(row => row.id === input.unitId);
    if (!unit) throw new Error('This unit was removed. Refresh the stock list.');
    if (unit._record && unit._record.requestId === input.requestId) {
      if (unit._record.requestHash !== requestHash) throw new Error('Request details changed. Refresh before trying again.');
      if (unit.quote !== quote || ['Held','Expired hold','Paid'].indexOf(unit.status) === -1) throw new Error('The sheet changed after this request. Refresh the list.');
      return stockPayload_(sheet,data,actor);
    }
    if (unit.revision !== input.revision) throw new Error('This unit changed or another staff member updated it. Refresh before trying again.');
    const holdingThisQuote = ['Held','Expired hold'].indexOf(unit.status) !== -1 && unit.quote === quote;
    if (unit.status !== 'Available' && !(input.action === 'paid' && holdingThisQuote)) throw new Error('This unit is already held, paid or needs review. It cannot be allocated again.');
    if (!unit.validUnit) throw new Error('This row does not contain exactly one unit. Ask Customer Service to check it.');
    const at = Date.now(),status = input.action === 'hold' ? 'Held' : 'Paid';
    const record = {requestId:input.requestId,requestHash,status,quote,customer,rep,actor,at,expiresAt:input.action === 'hold' ? at+STOCK_DAY_MS : null};
    const day = Utilities.formatDate(new Date(at),'Pacific/Auckland','yyyy-MM-dd').split('-').map(Number);
    const serialDate = Date.UTC(day[0],day[1]-1,day[2])/STOCK_DAY_MS+25569;
    const colour = status === 'Held' ? {red:1,green:242/255,blue:204/255} : {red:234/255,green:153/255,blue:153/255};
    const cell = (column,value,fields) => ({updateCells:{start:{sheetId:STOCK_TAB_ID,rowIndex:unit.rowNumber-1,columnIndex:column},rows:[{values:[value]}],fields}});
    const requests = [
      cell(data.columns.quote,{userEnteredValue:{stringValue:quote}},'userEnteredValue'),
      cell(data.columns.date,{userEnteredValue:{numberValue:serialDate},userEnteredFormat:{numberFormat:{type:'DATE',pattern:'dd/MM/yyyy'}}},'userEnteredValue,userEnteredFormat.numberFormat'),
      {repeatCell:{range:{sheetId:STOCK_TAB_ID,startRowIndex:unit.rowNumber-1,endRowIndex:unit.rowNumber,startColumnIndex:0,endColumnIndex:data.width},cell:{userEnteredFormat:{backgroundColor:colour}},fields:'userEnteredFormat.backgroundColor'}},
    ];
    if (unit._metadataId) requests.push({updateDeveloperMetadata:{dataFilters:[{developerMetadataLookup:{metadataId:unit._metadataId}}],developerMetadata:{metadataValue:JSON.stringify(record)},fields:'metadataValue'}});
    else requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:ALLOCATION_KEY,metadataValue:JSON.stringify(record),visibility:'DOCUMENT',location:{dimensionRange:{sheetId:STOCK_TAB_ID,dimension:'ROWS',startIndex:unit.rowNumber-1,endIndex:unit.rowNumber}}}}});
    // One Google transaction commits the quote, date, colour and allocation together.
    Sheets.Spreadsheets.batchUpdate({requests},STOCK_SHEET_ID);
    SpreadsheetApp.flush();
    return stockPayload_(sheet,stockRows_(sheet,false),actor);
  } finally { lock.releaseLock(); }
}
