const config = window.BOOK_SEARCH_CONFIG || {};
const API_URL = config.API_URL || "";
const MIN_QUERY_LENGTH = Number(config.MIN_QUERY_LENGTH || 1);

const RECENT_TITLE = "最近來到哲美系的書";
const RECENT_DESCRIPTION = "這裡會顯示近期整理建檔的書籍。若想找特定書名、作者或關鍵字，也可以直接搜尋。";
const SEARCH_TITLE = "查詢結果";
const SEARCH_DESCRIPTION = "以下為符合搜尋條件的書籍。";

const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const listTitle = document.querySelector("#listTitle");
const listDescription = document.querySelector("#listDescription");
const resultsBody = document.querySelector("#resultsBody");
const emptyState = document.querySelector("#emptyState");
const resultSummary = document.querySelector("#resultSummary");
const updatedAt = document.querySelector("#updatedAt");

let activeRequest = 0;

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadBooks(searchInput.value.trim());
});

searchInput.addEventListener("input", debounce(() => {
  loadBooks(searchInput.value.trim());
}, 260));

hideEmptyState();
loadBooks("");

async function loadBooks(query) {
  const requestId = ++activeRequest;
  const isSearch = query.length >= MIN_QUERY_LENGTH;
  setListIntro(isSearch ? SEARCH_TITLE : RECENT_TITLE, isSearch ? SEARCH_DESCRIPTION : RECENT_DESCRIPTION);
  setLoadingState(isSearch ? "查詢中..." : "載入最近書籍中...");

  if (!isConfigured()) {
    renderEmpty("尚未連線到庫存表", "請先在 config.js 貼上 Apps Script Web app URL。");
    resultSummary.textContent = "尚未設定資料來源";
    updatedAt.textContent = "";
    return;
  }

  try {
    const params = isSearch ? { q: query } : {};
    const payload = await requestJsonp(API_URL, params);
    if (requestId !== activeRequest) return;
    const books = payload.books || [];
    renderResults(books, query, payload.updatedAt, isSearch);
    if (isSearch) trackSearch(query, books.length);
  } catch (error) {
    if (requestId !== activeRequest) return;
    renderEmpty("資料暫時讀取失敗", "請稍後再試，或通知店主確認資料來源。");
    resultSummary.textContent = "讀取失敗";
    updatedAt.textContent = "";
  }
}

function setLoadingState(message) {
  resultsBody.innerHTML = "";
  hideEmptyState();
  resultSummary.textContent = message;
  updatedAt.textContent = "";
}

function renderResults(books, query, lastUpdatedAt, isSearch) {
  resultsBody.innerHTML = "";

  books.forEach((book) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(book.title)}</td>
      <td>${escapeHtml(book.barcode)}</td>
      <td>${escapeHtml(book.author)}</td>
      <td>${escapeHtml(book.stock)}</td>
    `;
    resultsBody.appendChild(row);
  });

  if (books.length > 0) {
    hideEmptyState();
  } else {
    renderEmpty(
      isSearch ? "沒有找到符合的書" : "目前沒有可顯示的新書",
      isSearch ? "請試試其他書名、條碼或作者。" : "有新書建檔後，會優先顯示在這裡。"
    );
  }

  resultSummary.textContent = isSearch
    ? `找到 ${books.length} 本符合「${query}」的書`
    : `目前顯示最近 ${books.length} 本書`;
  updatedAt.textContent = lastUpdatedAt ? `資料更新：${formatDate(lastUpdatedAt)}` : "";
}

function setListIntro(title, description) {
  listTitle.textContent = title;
  listDescription.textContent = description;
}

function renderEmpty(title, message) {
  resultsBody.innerHTML = "";
  emptyState.hidden = false;
  emptyState.querySelector("strong").textContent = title;
  emptyState.querySelector("span").textContent = message;
}

function hideEmptyState() {
  emptyState.hidden = true;
}

function requestJsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `bookSearchCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const requestUrl = new URL(url);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONP request timed out"));
    }, 12000);

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
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    script.src = requestUrl.toString();
    document.body.appendChild(script);
  });
}

function trackSearch(query, resultCount) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", "search", {
    search_term: query,
    results_count: resultCount,
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
