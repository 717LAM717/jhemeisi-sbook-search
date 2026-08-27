const config = window.BOOK_SEARCH_CONFIG || {};
const API_URL = config.API_URL || "";
const MIN_QUERY_LENGTH = Number(config.MIN_QUERY_LENGTH || 1);

const RECENT_TITLE = "最近來到哲美系的書";
const RECENT_DESCRIPTION = "這裡會顯示近期整理建檔的書籍。若想找特定書名、作者或關鍵字，也可以直接搜尋。";
const SEARCH_TITLE = "查詢結果";
const SEARCH_DESCRIPTION = "以下為符合搜尋條件的書籍。";
const DIRECT_TITLE = "可直接下單的書";
const DIRECT_DESCRIPTION = "以下為總庫存中已有購書平台連結、可直接前往下單的書籍。";
const FALLBACK_SEARCH_EXAMPLE = "例如：幸福建築、艾倫・狄波頓、9789861340814";
const RECENT_INITIAL_LIMIT = 12;
const INSTAGRAM_URL = "https://www.instagram.com/iam_jhemeisi/";

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
const resultsToolbar = document.querySelector("#resultsToolbar");
const resultsFooterControls = document.querySelector("#resultsFooterControls");
const toggleRecentBooksButton = document.querySelector("#toggleRecentBooks");
const filterButtons = [...document.querySelectorAll("[data-book-filter]")];
const openBookIntakeButton = document.querySelector("#openBookIntake");
const bookIntakeDialog = document.querySelector("#bookIntakeDialog");
const closeBookIntakeButtons = [
  document.querySelector("#closeBookIntake"),
  document.querySelector("#closeBookIntakeBottom"),
];

let activeRequest = 0;
let lastAttemptedQuery = "";
let currentBooks = [];
let currentQuery = "";
let currentIsSearch = false;
let activeBookFilter = "all";
let recentBooksExpanded = false;

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

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeBookFilter = button.dataset.bookFilter;
    recentBooksExpanded = false;
    updateFilterButtons();
    loadBooks(searchInput.value.trim(), {
      historyMode: "none",
      bookFilter: activeBookFilter,
    });
  });
});

toggleRecentBooksButton.addEventListener("click", () => {
  recentBooksExpanded = !recentBooksExpanded;
  renderCurrentBooks();
  if (!recentBooksExpanded) listTitle.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const requestedBookFilter = options.bookFilter || activeBookFilter;
  lastAttemptedQuery = query;
  syncQueryToUrl(query, historyMode);

  const validation = validateQuery(query);
  const isSearch = validation.type === "search";

  if (requestedBookFilter === "direct") {
    setListIntro(DIRECT_TITLE, DIRECT_DESCRIPTION);
  } else {
    setListIntro(
      isSearch || validation.type === "invalid" ? SEARCH_TITLE : RECENT_TITLE,
      isSearch || validation.type === "invalid" ? SEARCH_DESCRIPTION : RECENT_DESCRIPTION
    );
  }

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
    const params = {};
    if (isSearch) params.q = query;
    if (requestedBookFilter === "direct") params.view = "direct";
    const payload = await requestJsonp(API_URL, params);
    if (requestId !== activeRequest) return;
    if (!payload || !Array.isArray(payload.books)) {
      throw new Error("Unexpected API response");
    }
    if (requestedBookFilter === "direct" && payload.mode !== "direct") {
      const error = new Error("Direct purchase mode is unavailable");
      error.code = "DIRECT_MODE_UNAVAILABLE";
      throw error;
    }
    const books = payload.books;
    renderResults(books, query, payload.updatedAt, isSearch, requestedBookFilter);
    if (isSearch) trackSearch(query, books.length);
  } catch (error) {
    if (requestId !== activeRequest) return;
    if (error && error.code === "DIRECT_MODE_UNAVAILABLE") {
      renderEmpty("可直接下單清單尚未啟用", "資料服務更新後即可查看總庫存中的可下單書籍。", true);
      resultSummary.textContent = "可直接下單清單尚未啟用";
    } else {
      renderEmpty("資料暫時讀取失敗", "請稍後再試，或通知店主確認資料來源。", true);
      resultSummary.textContent = "讀取失敗";
    }
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

function renderResults(books, query, lastUpdatedAt, isSearch, bookFilter = "all") {
  currentBooks = books.map((book) => book && typeof book === "object" ? book : {});
  currentQuery = query;
  currentIsSearch = isSearch;
  activeBookFilter = bookFilter;
  recentBooksExpanded = false;

  updateFilterButtons();
  renderCurrentBooks();

  const formattedUpdatedAt = lastUpdatedAt ? formatDate(lastUpdatedAt) : "";
  updatedAt.textContent = formattedUpdatedAt ? `資料更新：${formattedUpdatedAt}` : "";
  if (!isSearch) updateSearchExample(currentBooks);
}

function renderCurrentBooks() {
  resultsBody.innerHTML = "";
  const filteredBooks = currentBooks;
  const isCollapsedRecent = activeBookFilter === "all" && !currentIsSearch && !recentBooksExpanded;
  const visibleBooks = isCollapsedRecent
    ? filteredBooks.slice(0, RECENT_INITIAL_LIMIT)
    : filteredBooks;

  const fragment = document.createDocumentFragment();

  visibleBooks.forEach((book) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="book-title-cell" data-label="書名">${escapeHtml(book.title)}</td>
      <td data-label="條碼">${escapeHtml(book.barcode)}</td>
      <td class="author-cell${String(book.author || "").trim() ? "" : " is-empty"}" data-label="作者">${escapeHtml(book.author)}</td>
      <td data-label="購買">${renderPurchaseCell(book)}</td>
    `;
    fragment.appendChild(row);
  });

  resultsBody.appendChild(fragment);

  if (filteredBooks.length > 0) {
    hideEmptyState();
    resultsToolbar.hidden = false;
  } else {
    if (activeBookFilter === "direct") {
      renderEmpty("目前沒有可直接下單的書", "可切換回「全部書籍」查看其他庫存。", false, true);
    } else {
      renderEmpty(
        currentIsSearch ? "沒有找到符合的書" : "目前沒有可顯示的新書",
        currentIsSearch ? "請試試其他書名、完整條碼或作者。" : "有新書建檔後，會優先顯示在這裡。"
      );
    }
  }

  if (activeBookFilter === "direct") {
    resultSummary.textContent = currentIsSearch
      ? `找到 ${filteredBooks.length} 本可直接下單且符合「${currentQuery}」的書`
      : `總庫存中有 ${filteredBooks.length} 本可直接下單`;
  } else {
    resultSummary.textContent = currentIsSearch
      ? `找到 ${filteredBooks.length} 本符合「${currentQuery}」的書`
      : recentBooksExpanded || filteredBooks.length <= RECENT_INITIAL_LIMIT
        ? `目前顯示最近 ${filteredBooks.length} 本書`
        : `目前顯示最近 ${visibleBooks.length} 本書（共 ${filteredBooks.length} 本）`;
  }

  const canToggleRecent = activeBookFilter === "all" && !currentIsSearch && filteredBooks.length > RECENT_INITIAL_LIMIT;
  resultsFooterControls.hidden = !canToggleRecent;
  toggleRecentBooksButton.textContent = recentBooksExpanded
    ? "收合近期書籍"
    : `顯示更多（還有 ${filteredBooks.length - RECENT_INITIAL_LIMIT} 本）`;
}

function updateFilterButtons() {
  filterButtons.forEach((button) => {
    const isActive = button.dataset.bookFilter === activeBookFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
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
      <a
        class="purchase-inquiry-link"
        href="${escapeAttribute(INSTAGRAM_URL)}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="前往哲美系 Instagram 私訊詢問"
      >Instagram 私訊詢問</a>
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

function renderEmpty(title, message, showRetry = false, keepToolbar = false) {
  resultsBody.innerHTML = "";
  emptyState.hidden = false;
  emptyState.querySelector("strong").textContent = title;
  emptyState.querySelector("span").textContent = message;
  retryButton.hidden = !showRetry;
  resultsToolbar.hidden = !keepToolbar;
  resultsFooterControls.hidden = true;
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
