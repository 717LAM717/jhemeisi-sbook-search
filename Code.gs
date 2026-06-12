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

const DATE_COLUMN_NAMES = ["建檔日期", "上架日期"];

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
  const entries = [];

  for (let rowIndex = HEADER_ROW; rowIndex < context.displayValues.length; rowIndex += 1) {
    const entry = getBookEntry_(context, rowIndex);
    if (!entry.title) continue;
    if (entry.stockNumber <= 0) continue;
    entries.push(entry);
  }

  const hasDateColumn = context.dateIndexes.length > 0;
  const hasAnyDate = entries.some((entry) => entry.dateValue);

  entries.sort((a, b) => {
    if (hasDateColumn && hasAnyDate) {
      const dateA = a.dateValue ? a.dateValue.getTime() : 0;
      const dateB = b.dateValue ? b.dateValue.getTime() : 0;
      if (dateA !== dateB) return dateB - dateA;
    }
    return b.rowNumber - a.rowNumber;
  });

  const books = entries.slice(0, RECENT_LIMIT).map(toPublicBook_);
  if (debug) debugInfo.returnedRows = entries.slice(0, RECENT_LIMIT).map(toDebugBook_);

  return { books, debug: debugInfo };
}

function getSheetContext_() {
  const sheet = getSheet_();
  const range = sheet.getDataRange();
  const displayValues = range.getDisplayValues();
  const rawValues = range.getValues();
  const headers = displayValues.length ? displayValues[HEADER_ROW - 1].map(normalizeText_) : [];
  const dateIndexes = DATE_COLUMN_NAMES
    .map((name) => headers.indexOf(normalizeText_(name)))
    .filter((index) => index >= 0);

  return {
    sheet,
    displayValues,
    rawValues,
    dateIndexes,
  };
}

function getBookEntry_(context, rowIndex) {
  const displayRow = context.displayValues[rowIndex];
  const rawRow = context.rawValues[rowIndex];
  const stockText = getCell_(displayRow, COLUMNS.stock);
  const dateValue = getFirstDate_(displayRow, rawRow, context.dateIndexes);

  return {
    rowNumber: rowIndex + 1,
    item: getCell_(displayRow, COLUMNS.item),
    title: getCell_(displayRow, COLUMNS.title),
    barcode: getCell_(displayRow, COLUMNS.barcode),
    author: getCell_(displayRow, COLUMNS.author),
    stock: stockText,
    stockNumber: getStock_(stockText),
    dateValue,
  };
}

function getFirstDate_(displayRow, rawRow, dateIndexes) {
  for (const index of dateIndexes) {
    const rawDate = rawRow[index];
    if (Object.prototype.toString.call(rawDate) === "[object Date]" && !Number.isNaN(rawDate.getTime())) {
      return rawDate;
    }

    const parsedDate = parseDate_(displayRow[index]);
    if (parsedDate) return parsedDate;
  }
  return null;
}

function parseDate_(value) {
  const text = toHalfWidth_(String(value || "").trim());
  if (!text) return null;
  const normalized = text.replace(/[./]/g, "-");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
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
    date: entry.dateValue ? entry.dateValue.toISOString() : "",
  };
}

function createDebugInfo_(context, query, mode) {
  return {
    mode,
    query,
    sheetName: context.sheet.getName(),
    totalRows: context.displayValues.length,
    dataRows: Math.max(0, context.displayValues.length - HEADER_ROW),
    dateColumns: context.dateIndexes.map(columnName_),
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

function columnName_(index) {
  let column = "";
  let number = index + 1;
  while (number > 0) {
    const remainder = (number - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    number = Math.floor((number - 1) / 26);
  }
  return column;
}
