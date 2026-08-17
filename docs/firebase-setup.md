# Firebase 設定

StockV2 使用既有 Firebase 專案 `stock-bf37a`，資料存放在 Realtime Database 的獨立命名空間：

```text
stockV2/users/{uid}/holdings
```

既有股票程式的其他節點不會被讀取或修改。

## Authentication

1. 在 Firebase Console 開啟 Authentication。
2. 啟用 Google 登入提供者。
3. 開發期間在 Authorized domains 加入 `localhost`。
4. 使用 `http://localhost:3000` 開啟本機網站。

## Realtime Database Rules

`firebase/database.rules.stockv2.example.json` 是 StockV2 所需規則的完整示例，但不得直接覆蓋既有專案規則。請將示例中的 `stockV2` 節點合併到目前 Rules 的最外層 `rules` 物件內。

StockV2 規則只允許已登入使用者讀寫與自己 UID 相同的路徑：

```json
"stockV2": {
  "users": {
    "$uid": {
      ".read": "auth != null && auth.uid === $uid",
      ".write": "auth != null && auth.uid === $uid"
    }
  }
}
```

在確認舊程式既有規則前，不要部署整份規則檔。

## 本機資料搬移

使用者第一次登入且 Firebase 尚無 StockV2 持股時，程式會檢查瀏覽器 `localStorage`。若找到資料，會先詢問是否搬移；確認後才寫入 Firebase，成功後移除本機副本。

## 資產快照

網站開啟時會在台北時間每日兩個時段檢查快照：

- `06:30–14:29`：`YYYY-MM-DD_0630`
- `14:30–23:59`：`YYYY-MM-DD_1430`

快照儲存在 `stockV2/users/{uid}/snapshots/{snapshotId}`。程式使用 Firebase transaction，只有該時段文件不存在時才建立，因此多個分頁或裝置不會產生重複資料。若下午才第一次開啟網站，只建立下午快照，不使用下午資料回填上午時段。

檢查時機包含登入後、持股載入後、每五分鐘、分頁重新取得焦點、分頁恢復顯示及網路重新連線。網站關閉時不會執行。
