const SPREADSHEET_ID = "15EEUPEMDwCGMMEXWQ93WcqHiFhF2nXT6nkjBISEAE4s";
const SHEET_NAME = "";
const HEADER_ROW = 1;
const MAX_RESULTS = 300;

const FALLBACK_COLUMNS = {
  title: 1,
  barcode: 2,
  author: 3,
  stock: 4,
};

const PUBLIC_COLUMNS = {
  title: ["書名"],
  barcode: ["條碼"],
  author: ["作者"],
  stock: ["庫存"],
};

const SEARCH_ONLY_COLUMNS = [
  "書名",
  "條碼",
  "作者",
  "商品來源",
  "特別注意",
  "書況大致描述",
  "上架月份",
  "網拍",
  "是否曾陳列",
  "裝箱",
];

function doGet(event) {
  const query = String((event.parameter && event.parameter.q) || "").trim();
  const callback = String((event.parameter && event.parameter.callback) || "").trim();
  const payload = {
    books: searchBooks_(query),
    updatedAt: new Date().toISOString(),
  };

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(payload)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function searchBooks_(query) {
  if (!query) return [];

  const sheet = getSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length <= HEADER_ROW) return [];

  const headers = values[HEADER_ROW - 1].map(normalizeHeader_);
  const titleIndex = withFallback_(findColumn_(headers, PUBLIC_COLUMNS.title), FALLBACK_COLUMNS.title);
  const barcodeIndex = withFallback_(findColumn_(headers, PUBLIC_COLUMNS.barcode), FALLBACK_COLUMNS.barcode);
  const authorIndex = withFallback_(findColumn_(headers, PUBLIC_COLUMNS.author), FALLBACK_COLUMNS.author);
  const stockIndex = withFallback_(findColumn_(headers, PUBLIC_COLUMNS.stock), FALLBACK_COLUMNS.stock);
  const searchIndexes = unique_([
    titleIndex,
    barcodeIndex,
    authorIndex,
    ...SEARCH_ONLY_COLUMNS.map((name) => findColumn_(headers, [name])),
  ]).filter((index) => index >= 0);

  const needle = normalizeText_(query);
  const books = [];

  for (let rowIndex = HEADER_ROW; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const title = getCell_(row, titleIndex);
    const barcode = getCell_(row, barcodeIndex);
    const author = getCell_(row, authorIndex);
    const stock = getStock_(row, stockIndex);
    if (!title) continue;
    if (stock <= 0) continue;

    const haystack = normalizeText_(searchIndexes.map((index) => getCell_(row, index)).join(" "));
    if (!haystack.includes(needle)) continue;

    books.push({
      title,
      barcode,
      author,
    });

    if (books.length >= MAX_RESULTS) break;
  }

  return books;
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (SHEET_NAME) return spreadsheet.getSheetByName(SHEET_NAME);
  return spreadsheet.getSheets()[0];
}

function findColumn_(headers, possibleNames) {
  const normalizedNames = possibleNames.map(normalizeHeader_);
  return headers.findIndex((header) => normalizedNames.includes(header));
}

function getCell_(row, index) {
  if (index < 0) return "";
  return String(row[index] || "").trim();
}

function getStock_(row, index) {
  if (index < 0) return 1;
  const rawValue = toHalfWidth_(String(row[index] || "").trim());
  const match = rawValue.match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return 0;
  return value;
}

function normalizeHeader_(value) {
  return toHalfWidth_(String(value || "")).trim().replace(/\s+/g, "").toLowerCase();
}

function normalizeText_(value) {
  return toHalfWidth_(String(value || "")).trim().replace(/\s+/g, "").toLowerCase();
}

function unique_(values) {
  return [...new Set(values)];
}

function withFallback_(index, fallbackIndex) {
  return index >= 0 ? index : fallbackIndex;
}

function toHalfWidth_(value) {
  return String(value || "").replace(/[！-～]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
}
