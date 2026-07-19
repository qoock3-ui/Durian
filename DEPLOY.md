# FinTrack 部署指南(Cloudflare)

目標帳戶:`6ad0888a2ee7ec203e961493dd19193e`(已寫入 `wrangler.jsonc` 的 `account_id`)。

> **目前進度**:D1 資料庫 `fintrack-db`(id `8dc509fc-f072-4526-b4a3-391de733fcd7`)
> 已建立、migration 已套用、種子匯率已寫入,`wrangler.jsonc` 已填好 id。
> **只剩部署 Worker 這一步**,走下面任一條路即可。

## 路線 A:手機/瀏覽器(GitHub Actions 自動部署)

1. **建立 Cloudflare API Token**:
   [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   → Create Token → 套用範本 **Edit Cloudflare Workers** → 權限再加一列 **Account / D1 / Edit** → 建立並複製 token。
2. **加到 GitHub Secrets**:repo → Settings → Secrets and variables → Actions →
   - `CLOUDFLARE_API_TOKEN`:剛複製的 token(必填)
   - `JWT_SECRET`:一串隨機長字串(建議設定;沒設會用開發用預設值,安全性較低)
3. **把分支合併進 `main`**:push 到 main 就會自動建置 + 部署(`.github/workflows/deploy.yml`)。

## 路線 B:本機電腦(wrangler CLI)

```bash
npm install
npx wrangler login
npx wrangler secret put JWT_SECRET   # 輸入一串隨機長字串
npm run deploy
```

部署完成後會顯示網址(`https://fintrack.<你的子網域>.workers.dev`)。
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
