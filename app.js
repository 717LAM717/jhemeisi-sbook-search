const config = window.BOOK_SEARCH_CONFIG || {};
const API_URL = config.API_URL || "";
const MIN_QUERY_LENGTH = Number(config.MIN_QUERY_LENGTH || 1);

const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const resultsBody = document.querySelector("#resultsBody");
const emptyState = document.querySelector("#emptyState");
const resultSummary = document.querySelector("#resultSummary");
const updatedAt = document.querySelector("#updatedAt");

let activeRequest = 0;

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchBooks(searchInput.value.trim());
});

searchInput.addEventListener("input", debounce(() => {
  searchBooks(searchInput.value.trim());
}, 260));

renderEmpty("請輸入關鍵字查詢", "可用書名、條碼，或併在書名欄中的作者文字搜尋。");

async function searchBooks(query) {
  const requestId = ++activeRequest;

  if (!isConfigured()) {
    renderEmpty("尚未連線到庫存表", "請先在 config.js 貼上 Apps Script Web app URL。");
    resultSummary.textContent = "尚未設定資料來源";
    return;
  }

  if (query.length < MIN_QUERY_LENGTH) {
    renderEmpty("請輸入關鍵字查詢", "可用書名、條碼，或併在書名欄中的作者文字搜尋。");
    resultSummary.textContent = "準備查詢中";
    updatedAt.textContent = "";
    return;
  }

  resultSummary.textContent = "查詢中...";

  try {
    const payload = await requestJsonp(API_URL, { q: query });
    if (requestId !== activeRequest) return;
    renderResults(payload.books || [], query, payload.updatedAt);
  } catch (error) {
    if (requestId !== activeRequest) return;
    renderEmpty("查詢暫時失敗", "請稍後再試，或通知店主確認資料來源。");
    resultSummary.textContent = "查詢失敗";
    updatedAt.textContent = "";
  }
}

function renderResults(books, query, lastUpdatedAt) {
  resultsBody.innerHTML = "";

  books.forEach((book) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(book.title)}</td>
      <td>${escapeHtml(book.barcode)}</td>
      <td>${escapeHtml(book.author || "")}</td>
    `;
    resultsBody.appendChild(row);
  });

  emptyState.hidden = books.length > 0;
  if (!books.length) {
    renderEmpty("沒有找到符合的書", "請試試其他書名、作者文字或條碼。");
  }

  resultSummary.textContent = `找到 ${books.length} 本符合「${query}」的書`;
  updatedAt.textContent = lastUpdatedAt ? `資料更新：${formatDate(lastUpdatedAt)}` : "";
}

function renderEmpty(title, message) {
  resultsBody.innerHTML = "";
  emptyState.hidden = false;
  emptyState.querySelector("strong").textContent = title;
  emptyState.querySelector("span").textContent = message;
}

function requestJsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `bookSearchCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const requestUrl = new URL(url);

    Object.entries(params).forEach(([key, value]) => requestUrl.searchParams.set(key, value));
    requestUrl.searchParams.set("callback", callbackName);

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed"));
    };

    function cleanup() {
      script.remove();
      delete window[callbackName];
    }

    script.src = requestUrl.toString();
    document.body.appendChild(script);
  });
}

function isConfigured() {
  return API_URL && !API_URL.includes("PASTE_YOUR_APPS_SCRIPT");
}

function debounce(callback, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value || "";
  return element.innerHTML;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
