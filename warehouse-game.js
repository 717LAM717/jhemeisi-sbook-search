(() => {
  const game = document.querySelector("#warehouseGame");
  const form = document.querySelector("#warehouseGameForm");
  const spinButton = document.querySelector("#warehouseSpinButton");
  const handleButton = document.querySelector("#warehouseHandleButton");
  const spinAgainButton = document.querySelector("#warehouseSpinAgain");
  const status = document.querySelector("#warehouseGameStatus");
  const result = document.querySelector("#warehouseGameResult");
  const booksContainer = document.querySelector("#warehouseGameBooks");
  const reels = [...document.querySelectorAll(".warehouse-reel")];
  const inputs = [
    document.querySelector("#warehouseWord1"),
    document.querySelector("#warehouseWord2"),
    document.querySelector("#warehouseWord3"),
  ];

  if (!game || !form || !spinButton || !handleButton || !status || !result || !booksContainer) return;

  const warehouseConfig = window.BOOK_SEARCH_CONFIG || {};
  const warehouseApiUrl = warehouseConfig.API_URL || "";
  const instagramUrl = "https://www.instagram.com/iam_jhemeisi/";
  const spinWords = [
    "孤獨", "城市", "雨天", "散步", "失眠", "神話", "島嶼", "宇宙",
    "貓", "失業", "記憶", "革命", "夢", "哲學", "女性", "歷史",
  ];

  let activeWarehouseRequest = 0;
  let reelTimers = [];

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const words = inputs.map((input) => String(input.value || "").trim());
    const validationMessage = validateWarehouseWords(words);

    if (validationMessage) {
      setWarehouseStatus(validationMessage, true);
      const emptyIndex = words.findIndex((word) => !word);
      if (emptyIndex >= 0) inputs[emptyIndex].focus();
      return;
    }

    await digWarehouse(words);
  });

  spinAgainButton.addEventListener("click", () => {
    form.requestSubmit();
  });

  async function digWarehouse(words) {
    const requestId = ++activeWarehouseRequest;
    setWarehouseBusy(true);
    result.hidden = true;
    booksContainer.replaceChildren();
    startReels();
    setWarehouseStatus("齒輪轉起來了。系主任正在倉庫深處翻找……");

    try {
      if (!isWarehouseConfigured()) {
        throw createWarehouseError("尚未連線到庫存服務，請先完成 Apps Script 設定。", "NOT_CONFIGURED");
      }

      const request = requestWarehouseJsonp(warehouseApiUrl, {
        action: "dig",
        word1: words[0],
        word2: words[1],
        word3: words[2],
        nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      const [payload] = await Promise.all([request, wait(1450)]);
      if (requestId !== activeWarehouseRequest) return;

      if (!payload || payload.mode !== "dig") {
        throw createWarehouseError("挖倉庫後端尚未部署，原本的查書功能不受影響。", "DIG_MODE_UNAVAILABLE");
      }

      if (payload.ok === false) {
        const message = payload.error && payload.error.message
          ? payload.error.message
          : "這次沒有成功挖到書，請稍後再試。";
        throw createWarehouseError(message, payload.error && payload.error.code);
      }

      if (!Array.isArray(payload.books) || !payload.books.length) {
        throw createWarehouseError("這次倉庫沒有吐出書，再換一組詞試試看。", "NO_BOOKS");
      }

      await stopReels(words);
      renderWarehouseBooks(payload.books.slice(0, 3));
      result.hidden = false;

      const sourceMessage = payload.source === "ai"
        ? `系主任從候選書裡挑出了 ${Math.min(payload.books.length, 3)} 本。`
        : `系主任今天暫時請假，書庫自己搖出了 ${Math.min(payload.books.length, 3)} 本。`;
      setWarehouseStatus(payload.notice ? `${sourceMessage} ${payload.notice}` : sourceMessage);
      trackWarehouseDig(payload.books.length, payload.source || "unknown");
      result.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
    } catch (error) {
      if (requestId !== activeWarehouseRequest) return;
      stopReelsImmediately(words);
      setWarehouseStatus(error && error.message ? error.message : "機器暫時卡住了，請稍後再挖一次。", true);
    } finally {
      if (requestId === activeWarehouseRequest) setWarehouseBusy(false);
    }
  }

  function validateWarehouseWords(words) {
    if (words.some((word) => !word)) return "三個輪軸都需要一個詞。";
    if (words.some((word) => word.length > 24)) return "每個詞請控制在 24 個字以內。";
    return "";
  }

  function startReels() {
    clearReelTimers();
    game.classList.add("is-spinning");
    reels.forEach((reel, index) => {
      reel.classList.remove("is-stopped");
      const motion = reel.querySelector(".warehouse-reel__motion");
      let position = Math.floor(Math.random() * spinWords.length);
      motion.textContent = spinWords[position];
      reelTimers[index] = window.setInterval(() => {
        position = (position + 1 + index) % spinWords.length;
        motion.textContent = spinWords[position];
      }, 105 + index * 22);
    });
  }

  async function stopReels(words) {
    for (let index = 0; index < reels.length; index += 1) {
      window.clearInterval(reelTimers[index]);
      const reel = reels[index];
      reel.querySelector(".warehouse-reel__motion").textContent = words[index];
      reel.classList.add("is-stopped");
      await wait(prefersReducedMotion() ? 10 : 260);
    }

    await wait(prefersReducedMotion() ? 10 : 240);
    game.classList.remove("is-spinning");
    reels.forEach((reel) => reel.classList.remove("is-stopped"));
    clearReelTimers();
  }

  function stopReelsImmediately(words) {
    clearReelTimers();
    game.classList.remove("is-spinning");
    reels.forEach((reel, index) => {
      reel.classList.remove("is-stopped");
      reel.querySelector(".warehouse-reel__motion").textContent = words[index] || spinWords[index];
    });
  }

  function clearReelTimers() {
    reelTimers.forEach((timer) => window.clearInterval(timer));
    reelTimers = [];
  }

  function renderWarehouseBooks(books) {
    const fragment = document.createDocumentFragment();

    books.forEach((book, index) => {
      const card = document.createElement("article");
      card.className = "warehouse-book-card";

      const number = document.createElement("div");
      number.className = "warehouse-book-card__number";
      number.textContent = `Warehouse pick ${String(index + 1).padStart(2, "0")}`;

      const title = document.createElement("h4");
      title.textContent = String(book.title || "未命名書籍");

      card.append(number, title);

      const authorText = String(book.author || "").trim();
      if (authorText) {
        const author = document.createElement("p");
        author.className = "warehouse-book-card__author";
        author.textContent = authorText;
        card.appendChild(author);
      }

      const reason = document.createElement("p");
      reason.className = "warehouse-book-card__reason";
      reason.textContent = String(book.reason || "這三個詞讓書庫把它搖了出來。");
      card.appendChild(reason);

      card.appendChild(createWarehousePurchaseLinks(book));
      fragment.appendChild(card);
    });

    booksContainer.replaceChildren(fragment);
  }

  function createWarehousePurchaseLinks(book) {
    const container = document.createElement("div");
    container.className = "warehouse-book-card__links";
    const links = [
      { label: "好賣+直接下單", url: book.famiUrl },
      { label: "iOPEN MALL直接下單", url: book.iopenUrl },
    ].filter((link) => isSafeWarehouseUrl(link.url));

    if (!links.length) {
      links.push({ label: "Instagram 私訊詢問", url: instagramUrl, inquiry: true });
    }

    links.forEach((link) => {
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = link.label;
      if (link.inquiry) anchor.classList.add("is-inquiry");
      container.appendChild(anchor);
    });

    return container;
  }

  function requestWarehouseJsonp(url, params) {
    return new Promise((resolve, reject) => {
      const callbackName = `warehouseDigCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const requestUrl = new URL(url);
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(createWarehouseError("倉庫翻得有點久，請稍後再試一次。", "TIMEOUT"));
      }, 30000);

      Object.entries(params).forEach(([key, value]) => requestUrl.searchParams.set(key, value));
      requestUrl.searchParams.set("callback", callbackName);

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        cleanup();
        reject(createWarehouseError("暫時連不到倉庫，原本的查書功能仍可使用。", "NETWORK"));
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

  function setWarehouseBusy(isBusy) {
    game.setAttribute("aria-busy", String(isBusy));
    spinButton.disabled = isBusy;
    handleButton.disabled = isBusy;
    spinAgainButton.disabled = isBusy;
    inputs.forEach((input) => { input.disabled = isBusy; });
    spinButton.querySelector("span").textContent = isBusy ? "正在挖倉庫…" : "系主任，你說了算";
  }

  function setWarehouseStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function isWarehouseConfigured() {
    return warehouseApiUrl && !warehouseApiUrl.includes("PASTE_YOUR_APPS_SCRIPT");
  }

  function isSafeWarehouseUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function createWarehouseError(message, code) {
    const error = new Error(message);
    error.code = code || "WAREHOUSE_ERROR";
    return error;
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function trackWarehouseDig(resultCount, source) {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "warehouse_dig", {
      results_count: resultCount,
      selection_source: source,
    });
  }
})();
