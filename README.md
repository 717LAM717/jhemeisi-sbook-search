# 書籍庫存查詢系統

這一版適合部署到 GitHub Pages，資料來源使用你的 Google 試算表，並透過 Google Apps Script 只回傳客人可看的欄位。

## 客人可查詢

- 書名
- 條碼
- 併在書名欄裡的作者文字
- 其他內部欄位可作為搜尋用，但不會顯示給客人

## 客人會看到

- 書名
- 條碼
- 作者

如果作者獨立放在 `作者` 欄，網站會顯示作者；如果作者併在 `書名` 欄，仍然可以被搜尋到。

## 設定 Google Apps Script

1. 打開你的 Google 試算表。
2. 點選「擴充功能」→「Apps Script」。
3. 把 [apps-script/Code.gs](/C:/Users/kokia/Documents/Codex/2026-05-15/excel/apps-script/Code.gs) 的內容貼進 Apps Script。
4. 確認 `SPREADSHEET_ID` 是你的試算表 ID。目前設定為 `15cQ6KD_UE18xFUtX9_lab_MbnwT4iePsELuMS3xj6I0`。
5. 如果資料不在第一個工作表，請填寫 `SHEET_NAME`。
6. 點選「部署」→「新增部署作業」。
7. 類型選「網頁應用程式」。
8. 執行身分選「我」。
9. 存取權選「任何人」。
10. 複製部署後的 Web app URL。

## 設定網站

把 Web app URL 貼到 [config.js](/C:/Users/kokia/Documents/Codex/2026-05-15/excel/config.js)：

```js
window.BOOK_SEARCH_CONFIG = {
  API_URL: "你的 Apps Script Web app URL",
  MIN_QUERY_LENGTH: 1,
};
```

## 部署到 GitHub Pages

1. 建立 GitHub repo。
2. 上傳這些檔案：`index.html`、`styles.css`、`app.js`、`config.js`。
3. 到 repo 的 Settings → Pages。
4. Source 選 `Deploy from a branch`。
5. Branch 選 `main`，資料夾選 `/root`。
6. 儲存後，GitHub 會產生公開網址。

## 欄位對應

依照目前線上表格截圖：

- A 欄：`項目`
- B 欄：`書名`
- C 欄：`條碼`
- D 欄：`作者`
- E 欄：`庫存`
- F 欄：`好賣+連結`
- G 欄：`iOPEN MALL連結`
- H 欄：`關鍵字配對`
- I 欄：`出版社`
- J 欄：`定價`

Apps Script 會優先依第一列的表頭名稱讀取資料，並支援「出版社」與「定價」欄位。既有主要欄位仍保留 A 到 G 的位置作為相容備援；H 欄「關鍵字配對」不受影響。出版社與定價沒有固定位置備援，因此必須使用正確表頭。

線上 Google Sheet 的 I 欄為 `出版社`，請在其右側新增 J 欄，並在 J1 填入 `定價`。不要移動、刪除或覆蓋 A 到 I 欄；舊書的出版社與定價儲存格都可以保持空白。API 會對每本書回傳 `publisher` 與 `listPrice`，沒有資料時為空字串，客人查書頁面不會顯示這兩個欄位。

`庫存` 大於 0 才會顯示給客人；庫存為 0 或空白不會出現在查詢結果。

每次查詢最多回傳 300 筆結果，避免客人輸入太短的關鍵字時頁面過長。Apps Script 仍會掃描整張表；如果想增加顯示數量，可調整 `MAX_RESULTS`。

## 這次前端優化

- 手機版查詢結果改為直向卡片，桌機仍保留表格。
- 搜尋字詞會同步到網址的 `q` 參數，可分享查詢結果並支援瀏覽器上一頁、下一頁。
- 新增清除搜尋、載入狀態與讀取失敗後重新載入。
- API 回傳欄位維持不變；這一版新增總庫存「可直接下單」模式，需要更新既有 Apps Script 部署。
- 搜尋框範例會從目前有庫存的近期書籍中隨機挑選，讀取失敗時使用固定備援範例。
- 新增「我有書要處理」入口，先說明二手書收購與免費提供書籍兩種方式，再由訪客自行前往 Instagram 詢問；目前不蒐集或送出訪客資料。
- 首頁近期書籍先顯示 12 本，可展開其餘書籍或再次收合；搜尋結果仍完整顯示。
- 前端不再顯示庫存數量，但 Apps Script 仍只回傳庫存大於 0 的書。
- 新增「全部書籍／可直接下單」篩選；「可直接下單」會掃描總庫存，而非只篩選最近 30 本。有平台連結時顯示醒目下單按鈕，沒有連結時簡化為「可私訊詢問」。
- 手機版會省略沒有內容的作者列；桌機表格仍保留作者欄，以維持欄位對齊。
- 沒有購書平台連結的書會顯示「Instagram 私訊詢問」，並連到與收書說明相同的哲美系 Instagram 頁面。
- 「我有書要處理」採用暖白底、深棕字與霧金外框，降低首頁視覺權重；說明視窗內的主要聯絡按鈕仍保留品牌紅色。
- 收書說明視窗在收購原則圖片上方新增兩種處理方式：少量書籍留意店內收購日，50 本以上先拍照評估後再預約到府收購；既有 Instagram 詢問按鈕維持不變。
- Apps Script API 新增 `publisher` 欄位，優先依表頭名稱讀取「出版社」；空白或尚未建立欄位時回傳空字串。公開查書頁面維持原樣，且仍只回傳庫存大於零的書。
- Apps Script API 新增 `listPrice` 欄位，依表頭名稱讀取 J 欄「定價」；空白或尚未建立欄位時回傳空字串，不顯示在客人查書頁面。
- 收書入口使用「我有書要處理」，說明視窗標題使用「書籍收購與整理」。保留原有二手書收購方式、收購原則圖片與 Instagram 聯絡管道，並以精簡文案區分付費收購及免費提供書籍／整批整理。
- 新增月份收書狀態公告。`intake-status.js` 集中保存月份、預約到府收購（50 本以上）是否開放及店內收購是否開放三個設定值；免費提供書籍不會跟隨付費收購狀態自動停用。

## 更新既有 Apps Script 部署

1. 將 `apps-script/Code.gs` 的完整內容貼到原本的 Apps Script 專案並儲存。
2. 開啟「部署」→「管理部署作業」。
3. 編輯目前的網頁應用程式部署，版本選擇「新版本」。
4. 保留原本的執行身分與存取權，按下部署。
5. 既有 Web app URL 不變，`config.js` 不需修改。

若 GitHub Pages 曾載入舊的檔案，請上傳新版 `index.html`、`styles.css`、`app.js` 與新增的 `intake-status.js`。目前首頁會使用 `v=20261008-4`，強制瀏覽器重新取得最新的前端檔案。

## 修改每月收書狀態

只需編輯 `intake-status.js` 的三個設定值：

```js
window.BOOK_INTAKE_STATUS = {
  month: "2026 年 10 月",
  appointmentOpen: true,
  storeOpen: false,
};
```

- `month`：公告顯示月份。
- `appointmentOpen`：預約到府收購（50 本以上），`true` 為開放，`false` 為暫停。開放僅代表可聯繫並提供照片、數量供評估，不代表保證收購或立即到府。
- `storeOpen`：店內收購，`true` 為開放，`false` 為暫停。

修改後直接提交到 GitHub Pages 使用的分支即可，不需要更新 Apps Script。
