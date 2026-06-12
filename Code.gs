const SPREADSHEET_ID = "15cQ6KD_UE18xFUtX9_lab_MbnwT4iePsELuMS3xj6I0";
const SHEET_NAME = "";
const HEADER_ROW = 1;
const MAX_RESULTS = 300;
const RECENT_LIMIT = 30;

const COLUMNS = {
  item: 0,
  title: 1,
  barcode: 2,
  author: 3,
  stock: 4,
};

function doGet(event) {
  const query = String((event.parameter && event.parameter.q) || "").trim();
  const callback = String((event.parameter && event.parameter.callback) || "").trim();
  const debug = String((event.parameter && event.parameter.debug) || "") === "1";
  const result = query ? searchBooks_(query, debug) : getRecentBooks_(debug);
  const payload = {
    mode: query ? "search" : "recent",
    books: result.books,
    updatedAt: new Date().toISOString(),
  };

  if (debug) payload.debug = result.debug;

  const output = callback
    ? `${callback}(${JSON.stringify(payload)})`
    : JSON.stringify(payload);

  return ContentService
    .createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function searchBooks_(query, debug) {
  const context = getSheetContext_();
  const debugInfo = createDebugInfo_(context, query, "search");
  const needle = normalizeText_(query);
  const books = [];

  for (let rowIndex = HEADER_ROW; rowIndex < context.displayValues.length; rowIndex += 1) {
    const entry = getBookEntry_(context, rowIndex);
    if (!entry.title) {
      addSkippedRow_(debugInfo, debug, entry, "no title");
      continue;
    }

    if (entry.stockNumber <= 0) {
      addSkippedRow_(debugInfo, debug, entry, "stock <= 0");
      continue;
    }

    const haystack = normalizeText_([entry.title, entry.barcode, entry.author].join(" "));
    if (!haystack.includes(needle)) continue;

    books.push(toPublicBook_(entry));
    if (debug) debugInfo.returnedRows.push(toDebugBook_(entry));
    if (books.length >= MAX_RESULTS) break;
  }

  return { books, debug: debugInfo };
}

function getRecentBooks_(debug) {
  const context = getSheetContext_();
  const debugInfo = createDebugInfo_(context, "", "recent");
  const books = [];

  for (let rowIndex = context.displayValues.length - 1; rowIndex >= HEADER_ROW; rowIndex -= 1) {
    const entry = getBookEntry_(context, rowIndex);
    if (!entry.title) continue;
    if (entry.stockNumber <= 0) continue;

    books.push(toPublicBook_(entry));
    if (debug) debugInfo.returnedRows.push(toDebugBook_(entry));
    if (books.length >= RECENT_LIMIT) break;
  }

  return { books, debug: debugInfo };
}

function getSheetContext_() {
  const sheet = getSheet_();
  const displayValues = sheet.getDataRange().getDisplayValues();

  return {
    sheet,
    displayValues,
  };
}

function getBookEntry_(context, rowIndex) {
  const displayRow = context.displayValues[rowIndex];
  const stockText = getCell_(displayRow, COLUMNS.stock);

  return {
    rowNumber: rowIndex + 1,
    item: getCell_(displayRow, COLUMNS.item),
    title: getCell_(displayRow, COLUMNS.title),
    barcode: getCell_(displayRow, COLUMNS.barcode),
    author: getCell_(displayRow, COLUMNS.author),
    stock: stockText,
    stockNumber: getStock_(stockText),
  };
}

function toPublicBook_(entry) {
  return {
    title: entry.title,
    barcode: entry.barcode,
    author: entry.author,
    stock: entry.stock,
  };
}

function toDebugBook_(entry) {
  return {
    row: entry.rowNumber,
    item: entry.item,
    title: entry.title,
    barcode: entry.barcode,
    author: entry.author,
    stock: entry.stock,
  };
}

function createDebugInfo_(context, query, mode) {
  return {
    mode,
    query,
    sheetName: context.sheet.getName(),
    totalRows: context.displayValues.length,
    dataRows: Math.max(0, context.displayValues.length - HEADER_ROW),
    sort: mode === "recent" ? "rowNumberDesc" : "sheetOrder",
    columns: {
      item: "A",
      title: "B",
      barcode: "C",
      author: "D",
      stock: "E",
    },
    returnedRows: [],
    skippedRows: [],
  };
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (SHEET_NAME) return spreadsheet.getSheetByName(SHEET_NAME);
  return spreadsheet.getSheets()[0];
}

function getCell_(row, index) {
  return String(row[index] || "").trim();
}

function getStock_(value) {
  const normalized = toHalfWidth_(String(value || "").trim());
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const stock = Number(match[0]);
  return Number.isFinite(stock) ? stock : 0;
}

function normalizeText_(value) {
  return toHalfWidth_(String(value || ""))
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function toHalfWidth_(value) {
  return String(value || "").replace(/[！-～]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
}

function addSkippedRow_(debugInfo, debug, entry, reason) {
  if (!debug || debugInfo.skippedRows.length >= 20) return;
  const target = normalizeText_([entry.title, entry.barcode, entry.author].join(" "));
  if (debugInfo.query && !target.includes(normalizeText_(debugInfo.query))) return;
  debugInfo.skippedRows.push({
    ...toDebugBook_(entry),
    reason,
  });
}
