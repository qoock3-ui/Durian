# FinTrack 部署指南(Cloudflare)

目標帳戶:`6ad0888a2ee7ec203e961493dd19193e`(已寫入 `wrangler.jsonc` 的 `account_id`)。

## 一、首次部署(約 5 分鐘)

在本機(或任何裝有 Node 22+ 的環境)執行:

```bash
npm install

# 1. 登入 Cloudflare(瀏覽器 OAuth)
npx wrangler login

# 2. 建立 D1 資料庫
npx wrangler d1 create fintrack-db
#    → 把輸出的 database_id 貼到 wrangler.jsonc 裡取代 REPLACE_WITH_DATABASE_ID

# 3. 建表(套用 migrations/)
npm run db:migrate

# 4. 設定 JWT 密鑰(輸入一串隨機長字串,例如 `openssl rand -base64 32` 的輸出)
npx wrangler secret put JWT_SECRET

# 5. 建置前端並部署
npm run deploy
```

部署完成後 wrangler 會顯示網址(`https://fintrack.<你的子網域>.workers.dev`)。
開啟後先「註冊」建立你的帳號。

## 二、註冊完成後建議關閉註冊

`wrangler.jsonc` 中把 `ALLOW_REGISTRATION` 改成 `"false"`,再跑一次 `npm run deploy`,
之後就沒有人能再註冊新帳號(你已有的帳號不受影響)。

## 三、自動部署(可選,GitHub Actions)

`.github/workflows/deploy.yml` 已就緒:push 到 `main` 就會自動建置 + 部署。
只需在 GitHub repo → Settings → Secrets and variables → Actions 新增:

- `CLOUDFLARE_API_TOKEN`:到 [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
  建立 token,套用範本 **Edit Cloudflare Workers**,並在權限中額外加上 **D1: Edit**。

## 四、匯率更新

- Cron 每小時整點自動抓 [open.er-api.com](https://open.er-api.com)(免費、無需金鑰)。
- 若快取超過 24 小時未更新,前端讀取 `/api/rates` 時也會即時補抓一次。
- 手動刷新:登入後呼叫 `POST /api/rates/refresh`。

## 五、本機開發

```bash
# 終端 1:本機 D1 + API
npm run db:migrate:local
npx wrangler dev          # http://localhost:8787

# 終端 2:前端(API 會 proxy 到 8787)
npm run dev               # http://localhost:5173
```

## 常見問題

| 問題 | 解法 |
|---|---|
| 部署時報 `database_id` 錯誤 | 確認已執行步驟 2 並把 id 填回 `wrangler.jsonc` |
| 登入回 401 | JWT_SECRET 換過會使舊 token 失效,重新登入即可 |
| 想改 Cron 頻率 | 改 `wrangler.jsonc` 的 `triggers.crons` 後重新部署 |
| 想綁自訂網域 | Cloudflare Dash → Workers & Pages → fintrack → Settings → Domains & Routes |
