const config = window.BOOK_SEARCH_CONFIG || {};
const API_URL = config.API_URL || "";
const MIN_QUERY_LENGTH = Number(config.MIN_QUERY_LENGTH || 1);

const RECENT_TITLE = "最近來到哲美系的書";
const RECENT_DESCRIPTION = "這裡會顯示近期整理建檔的書籍。若想找特定書名、作者或關鍵字，也可以直接搜尋。";
const SEARCH_TITLE = "查詢結果";
const SEARCH_DESCRIPTION = "以下為符合搜尋條件的書籍。";
const FALLBACK_SEARCH_EXAMPLE = "例如：幸福建築、艾倫・狄波頓、9789861340814";

const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const searchButton = document.querySelector("#searchButton");
const clearSearchButton = document.querySelector("#clearSearch");
const retryButton = document.querySelector("#retryButton");
const listTitle = document.querySelector("#listTitle");
const listDescription = document.querySelector("#listDescription");
const resultsBody = document.querySelector("#resultsBody");
const emptyState = document.querySelector("#emptyState");
const resultSummary = document.querySelector("#resultSummary");
const updatedAt = document.querySelector("#updatedAt");
const resultsPanel = document.querySelector(".results-panel");
const openBookIntakeButton = document.querySelector("#openBookIntake");
const bookIntakeDialog = document.querySelector("#bookIntakeDialog");
const closeBookIntakeButtons = [
  document.querySelector("#closeBookIntake"),
  document.querySelector("#closeBookIntakeBottom"),
];

let activeRequest = 0;
let lastAttemptedQuery = "";

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadBooks(searchInput.value.trim(), { historyMode: "push" });
});

searchInput.addEventListener("input", debounce(() => {
  updateClearButton();
  loadBooks(searchInput.value.trim(), { historyMode: "replace" });
}, 260));

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  updateClearButton();
  loadBooks("", { historyMode: "push" });
  searchInput.focus();
});

retryButton.addEventListener("click", () => {
  loadBooks(lastAttemptedQuery, { historyMode: "none" });
});

openBookIntakeButton.addEventListener("click", openBookIntakeDialog);
closeBookIntakeButtons.forEach((button) => {
  button.addEventListener("click", closeBookIntakeDialog);
});

bookIntakeDialog.addEventListener("click", (event) => {
  if (event.target === bookIntakeDialog) closeBookIntakeDialog();
});

window.addEventListener("popstate", () => {
  const query = getQueryFromUrl();
  searchInput.value = query;
  updateClearButton();
  loadBooks(query, { historyMode: "none" });
});

hideEmptyState();
searchInput.value = getQueryFromUrl();
updateClearButton();
loadBooks(searchInput.value.trim(), { historyMode: "replace" });

async function loadBooks(query, options = {}) {
  const requestId = ++activeRequest;
  const historyMode = options.historyMode || "none";
  lastAttemptedQuery = query;
  syncQueryToUrl(query, historyMode);

  const validation = validateQuery(query);
  const isSearch = validation.type === "search";

  setListIntro(isSearch || validation.type === "invalid" ? SEARCH_TITLE : RECENT_TITLE, isSearch || validation.type === "invalid" ? SEARCH_DESCRIPTION : RECENT_DESCRIPTION);

  if (validation.type === "invalid") {
    activeRequest += 1;
    renderEmpty("請輸入完整 13 碼條碼", "條碼搜尋需要輸入完整 13 碼；若要找書名或作者，請輸入文字。");
    resultSummary.textContent = "請輸入完整 13 碼條碼";
    updatedAt.textContent = "";
    setBusy(false);
    return;
  }

  setLoadingState(isSearch ? "查詢中..." : "載入最近書籍中...");

  if (!isConfigured()) {
    renderEmpty("尚未連線到庫存表", "請先在 config.js 貼上 Apps Script Web app URL。");
    resultSummary.textContent = "尚未設定資料來源";
    updatedAt.textContent = "";
    setBusy(false);
    return;
  }

  try {
    const params = isSearch ? { q: query } : {};
    const payload = await requestJsonp(API_URL, params);
    if (requestId !== activeRequest) return;
    if (!payload || !Array.isArray(payload.books)) {
      throw new Error("Unexpected API response");
    }
    const books = payload.books;
    renderResults(books, query, payload.updatedAt, isSearch);
    if (isSearch) trackSearch(query, books.length);
  } catch (error) {
    if (requestId !== activeRequest) return;
    renderEmpty("資料暫時讀取失敗", "請稍後再試，或通知店主確認資料來源。", true);
    resultSummary.textContent = "讀取失敗";
    updatedAt.textContent = "";
  } finally {
    if (requestId === activeRequest) setBusy(false);
  }
}

function validateQuery(query) {
  if (!query) return { type: "recent" };
  const normalized = normalizeNumberText(query);
  if (/^\d+$/.test(normalized)) {
    return normalized.length === 13 ? { type: "search" } : { type: "invalid" };
  }
  return query.length >= MIN_QUERY_LENGTH ? { type: "search" } : { type: "recent" };
}

function normalizeNumberText(value) {
  return String(value || "")
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "");
}

function setLoadingState(message) {
  hideEmptyState();
  resultSummary.textContent = message;
  updatedAt.textContent = "";
  setBusy(true);
}

function renderResults(books, query, lastUpdatedAt, isSearch) {
  resultsBody.innerHTML = "";

  const fragment = document.createDocumentFragment();

  books.forEach((rawBook) => {
    const book = rawBook && typeof rawBook === "object" ? rawBook : {};
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="book-title-cell" data-label="書名">${escapeHtml(book.title)}</td>
      <td data-label="條碼">${escapeHtml(book.barcode)}</td>
      <td data-label="作者">${escapeHtml(book.author)}</td>
      <td data-label="庫存">${escapeHtml(book.stock)}</td>
      <td data-label="購買">${renderPurchaseCell(book)}</td>
    `;
    fragment.appendChild(row);
  });

  resultsBody.appendChild(fragment);

  if (books.length > 0) {
    hideEmptyState();
  } else {
    renderEmpty(
      isSearch ? "沒有找到符合的書" : "目前沒有可顯示的新書",
      isSearch ? "請試試其他書名、完整條碼或作者。" : "有新書建檔後，會優先顯示在這裡。"
    );
  }

  resultSummary.textContent = isSearch
    ? `找到 ${books.length} 本符合「${query}」的書`
    : `目前顯示最近 ${books.length} 本書`;
  updatedAt.textContent = lastUpdatedAt ? `資料更新：${formatDate(lastUpdatedAt)}` : "";
  if (!isSearch) updateSearchExample(books);
}

function updateSearchExample(books) {
  const candidates = books.filter((book) => {
    const title = String((book && book.title) || "").trim();
    return title && title.length <= 18;
  });

  if (!candidates.length) {
    searchInput.placeholder = FALLBACK_SEARCH_EXAMPLE;
    return;
  }

  const book = candidates[Math.floor(Math.random() * candidates.length)];
  const parts = [book.title, book.author, book.barcode]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  searchInput.placeholder = `例如：${parts.join("、")}`;
}

function openBookIntakeDialog() {
  if (typeof bookIntakeDialog.showModal === "function") {
    bookIntakeDialog.showModal();
  } else {
    bookIntakeDialog.setAttribute("open", "");
  }
}

function closeBookIntakeDialog() {
  if (typeof bookIntakeDialog.close === "function") {
    bookIntakeDialog.close();
  } else {
    bookIntakeDialog.removeAttribute("open");
  }
}

function renderPurchaseCell(book) {
  const links = [
    {
      label: "好賣+直接下單",
      url: book.famiUrl,
    },
    {
      label: "iOPEN MALL直接下單",
      url: book.iopenUrl,
    },
  ].filter((link) => isSafeHttpUrl(link.url));

  if (!links.length) {
    return `
      <div class="purchase-unavailable">
        <span>尚未上架購書平台</span>
        <small>可透過社群聯繫購買</small>
      </div>
    `;
  }

  return `
    <div class="purchase-links">
      ${links.map((link) => `
        <a href="${escapeAttribute(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>
      `).join("")}
    </div>
  `;
}

function isSafeHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;

  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function setListIntro(title, description) {
  listTitle.textContent = title;
  listDescription.textContent = description;
}

function renderEmpty(title, message, showRetry = false) {
  resultsBody.innerHTML = "";
  emptyState.hidden = false;
  emptyState.querySelector("strong").textContent = title;
  emptyState.querySelector("span").textContent = message;
  retryButton.hidden = !showRetry;
}

function hideEmptyState() {
  emptyState.hidden = true;
  retryButton.hidden = true;
}

function setBusy(isBusy) {
  resultsPanel.setAttribute("aria-busy", String(isBusy));
  resultsPanel.classList.toggle("is-loading", isBusy);
  searchButton.disabled = isBusy;
  searchButton.textContent = isBusy ? "查詢中…" : "查詢";
}

function updateClearButton() {
  clearSearchButton.hidden = !searchInput.value.trim();
}

function getQueryFromUrl() {
  try {
    return new URL(window.location.href).searchParams.get("q") || "";
  } catch {
    return "";
  }
}

function syncQueryToUrl(query, historyMode) {
  if (historyMode !== "push" && historyMode !== "replace") return;

  try {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const method = historyMode === "push" ? "pushState" : "replaceState";
    window.history[method]({ query }, "", nextUrl);
  } catch {
    // URL 同步失敗時仍保留查詢功能。
  }
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
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("zh-Hant-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
