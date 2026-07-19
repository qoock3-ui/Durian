# 💎 FinTrack — 跨國資產管理系統

個人跨國(台灣/越南/美國/其他)資產、收入、支出管理系統,
所有外幣依即時匯率換算成 TWD 呈現總覽與趨勢。

| 文件 | 內容 |
|---|---|
| [SPEC.md](SPEC.md) | 功能規格書 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系統架構規劃 |
| [DEPLOY.md](DEPLOY.md) | Cloudflare 部署步驟 |

## 技術棧

- **前端**:React 19 + Vite + Tailwind CSS v4 + Recharts(SPA)
- **API**:Cloudflare Worker + Hono
- **資料庫**:Cloudflare D1(SQLite)
- **匯率**:Cron Trigger 每小時抓 open.er-api.com,快取於 D1
- **認證**:Email/Password(PBKDF2)+ JWT
- **部署**:單一 Worker(Static Assets + API 同一部署單元)

## 快速開始

```bash
npm install
npm run db:migrate:local
npx wrangler dev     # 終端 1:API(http://localhost:8787)
npm run dev          # 終端 2:前端(http://localhost:5173)
```

部署到 Cloudflare 見 [DEPLOY.md](DEPLOY.md)。
