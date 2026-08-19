# StockV2

個人用的台股與美股投資損益管理系統，使用 Firebase Authentication 與 Realtime Database 儲存個人資料。

## 第一版目標

- 首頁顯示目前持股、成本、市值與未實現損益
- 台股與美股分開統計
- 手動新增與刪除已賣出股票的損益、報酬率與賣出價格，並依台股、美股及年份查看
- 支援手動輸入價格，並可用證交所、櫃買中心與 Finnhub 自動更新
- 分別保存台幣與美元現金餘額
- 每日 06:30 與 14:30 各保存一次「持股市值＋現金」總資產快照
- 顯示總資產相較前次更新的上升或下降

本專案不包含選股、策略分析、自動下單或回測功能。

## 開發流程

- `main`：保持可執行且穩定
- 每項功能從 `main` 建立獨立的 `feature/*` 分支
- 第一個功能分支：`feature/portfolio-dashboard`

## 執行 Dashboard

需要 Node.js 20 以上版本，不需安裝外部套件。

```bash
npm start
```

接著開啟 `http://localhost:3000`。Google 登入需要將 `localhost` 加入 Firebase Authentication 的 Authorized domains。

Firebase 設定與安全規則注意事項請參考 [`docs/firebase-setup.md`](docs/firebase-setup.md)。

## 自動行情

- 台股：使用證交所與櫃買中心的免費公開行情，不需要 API Key。
- 美股：使用 Finnhub，請在登入後從側邊欄開啟「行情設定」。
- Finnhub API Key 只保存在目前瀏覽器的 `localStorage`，不會寫入 Firebase、原始碼或 GitHub。
- 網頁開啟時會在台北時間 06:30 後更新美股、14:30 後更新台股；同一市場每天自動執行一次，失敗時保留原價格。

## GitHub Pages

網站會在 `main` 更新後自動部署至：

<https://deutsches.github.io/stock_V2/>

首次部署前，請在 GitHub repository 的 `Settings → Pages → Build and deployment` 將 Source 設為 `GitHub Actions`，並在 Firebase Authentication 的 Authorized domains 加入 `deutsches.github.io`。
