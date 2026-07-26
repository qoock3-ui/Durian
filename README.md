# 💎 FinTrack — 跨國資產管理系統

個人跨國(台灣/越南/美國/其他)資產、收入、支出管理系統,
所有外幣依即時匯率換算成 TWD 呈現總覽與趨勢。

| 文件 | 內容 |
|---|---|
| [SPEC.md](SPEC.md) | 功能規格書 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系統架構規劃 |
| [DEPLOY.md](DEPLOY.md) | Cloudflare 部署步驟 |

## ⚠️ 部署範圍(動手前先讀)

本 repo 名為 **Durian**,但這是專案代號,**與榴槤買賣管理平台無關**。
同一個 Cloudflare 帳號底下有兩套獨立系統,請勿混淆:

| | 本 repo(資產管理) | 榴槤買賣平台 |
|---|---|---|
| Worker | `fintrack` | `durian-shop` |
| 網址 | fintrack.qoock3.workers.dev | durian-shop.qoock3.workers.dev |
| D1 資料庫 | `fintrack-db` | `durian-db` |
| 程式碼 | 本 repo | 另一個 repo |

**一眼確認你在對的地方**:打開 `wrangler.jsonc`,`name` 應為 `fintrack`、
`database_name` 應為 `fintrack-db`。看到 `durian-shop` 或 `durian-db` 就是走錯 repo 了。

`wrangler.jsonc` 綁定的是寫死的 `database_id`(UUID),不只是名稱,
因此本 repo 的部署在設定層級上就無法指向 `durian-db`。
UUID 以 `wrangler.jsonc` 為唯一準據,本文件不複寫,以免兩邊失準。

修改本 repo 時請確認:

- `wrangler.jsonc` 的 `name` 與 `database_id` 未被更動
- 新增 migration 前先確認是要改 `fintrack-db`,不是榴槤平台的資料表
- 帳號下另有一個名為 `durian` 的 Worker,無任何 binding(空殼),與本專案無關

## 技術棧

- **前端**:React 19 + Vite + Tailwind CSS v4 + Recharts(SPA)
- **API**:Cloudflare Worker + Hono
- **資料庫**:Cloudflare D1(SQLite)
- **匯率**:Cron Trigger 每小時抓 open.er-api.com,快取於 D1
- **認證**:Email/Password(PBKDF2)+ JWT
- **部署**:單一 Worker(Static Assets + API 同一部署單元)
- **PWA**:可安裝到主畫面,Service Worker 對導覽與 `/api` 採網路優先,
  僅快取帶內容雜湊的 `/assets/*`,部署後不會被舊 bundle 黏住

## 快速開始

```bash
npm install
npm run db:migrate:local
npx wrangler dev     # 終端 1:API(http://localhost:8787)
npm run dev          # 終端 2:前端(http://localhost:5173)
```

部署到 Cloudflare 見 [DEPLOY.md](DEPLOY.md)。
