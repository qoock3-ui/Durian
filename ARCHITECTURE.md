# FinTrack — 系統架構規劃(Cloudflare 部署)

> 依據 `SPEC.md` 規格書制定。部署目標帳戶:`6ad0888a2ee7ec203e961493dd19193e`。

## 1. 架構總覽

```
                        ┌─────────────────────────────────────────┐
 使用者瀏覽器 ──HTTPS──▶│  Cloudflare Worker(單一部署單元)        │
                        │                                         │
                        │  ┌───────────────┐  ┌────────────────┐  │
                        │  │ Static Assets │  │  Hono API      │  │
                        │  │ (React SPA)   │  │  /api/*        │  │
                        │  └───────────────┘  └───────┬────────┘  │
                        │                             │           │
                        │  ┌───────────────┐  ┌───────▼────────┐  │
                        │  │ Cron Trigger  │─▶│  D1 (SQLite)   │  │
                        │  │ 每小時抓匯率   │  │  fintrack-db   │  │
                        │  └───────┬───────┘  └────────────────┘  │
                        └──────────┼──────────────────────────────┘
                                   ▼
                        open.er-api.com(免費匯率 API,無需金鑰)
```

## 2. 與規格書第 6 節的差異(建議調整)

| 項目 | 規格書建議 | 本規劃採用 | 理由 |
|---|---|---|---|
| 部署形態 | Pages + Pages Functions | **單一 Worker + Static Assets** | Pages 無法設 Cron Trigger(匯率定時更新需要);Cloudflare 官方已建議新專案改用 Workers;單一部署單元、一份 `wrangler.jsonc` |
| 匯率快取 | Workers KV / Cache | **直接存 D1 `exchange_rates` 表** | 少一個服務綁定;匯率本來就要跟資料一起查,D1 一次查完;免費 API 每小時抓一次量極小 |
| 前端 | React+Vite 或 Next.js | **React 19 + Vite + Tailwind v4** | 純 SPA 即可,不需要 SSR;Vite 建置最單純 |
| 圖表 | Recharts 或 Chart.js | **Recharts** | React 原生組件模型,和頁面狀態整合容易 |
| 認證 | email/password+JWT 或 Sessions | **email/password + PBKDF2(WebCrypto)+ JWT(HS256)** | Worker 無狀態,JWT 免去 session 儲存;PBKDF2 是 WebCrypto 原生支援,不需額外套件 |

其餘(Hono、D1、三張資料表、TWD 換算邏輯)皆依規格書。

## 3. 專案結構

```
Durian/
├── wrangler.jsonc        # Cloudflare 設定(account_id、D1 綁定、Cron、Assets)
├── package.json
├── vite.config.ts
├── tsconfig*.json
├── migrations/
│   └── 0001_init.sql     # users / assets / incomes / expenses / exchange_rates
├── server/               # Cloudflare Worker(Hono API)
│   ├── index.ts          # app 入口 + scheduled(Cron)handler
│   ├── auth.ts           # 註冊/登入、PBKDF2、JWT 簽發與驗證 middleware
│   ├── crud.ts           # assets / incomes / expenses CRUD(欄位白名單)
│   ├── einvoice.ts       # 電子發票 QR 解析、統一發票對獎、中獎號碼抓取
│   ├── invoices.ts       # 掃描入口、自動記帳、Cron 對獎與中獎通知
│   └── rates.ts          # 匯率抓取(open.er-api.com)與快取讀取
├── shared/               # 前後端共用的純函式(tsconfig 兩邊都 include)
│   └── invoice.ts        # 統一發票期別換算、開獎/領獎日、獎項名稱
├── src/                  # React SPA
│   ├── main.tsx / App.tsx / index.css
│   ├── api.ts            # fetch wrapper(帶 JWT)
│   ├── store.tsx         # 全域資料(assets/incomes/expenses/rates)+ 重新整理
│   ├── lib/
│   │   ├── constants.ts  # 枚舉、分組、標籤、國旗、色彩語意
│   │   └── finance.ts    # TWD 換算、月均收入、淨資產、月度彙總
│   ├── components/       # Sidebar、Modal、FormModal、卡片等
│   └── pages/            # Login / Overview / Assets / Incomes / Expenses / Trends
├── SPEC.md               # 原始規格書
├── ARCHITECTURE.md       # 本文件
└── DEPLOY.md             # 部署步驟(對應你的 Cloudflare 帳戶)
```

## 4. 資料模型(D1 / SQLite)

- `users(id, email UNIQUE, name, password_hash, created_at)`
- `assets(id, user_id, name, category, region, amount, currency, note, created_at, updated_at)`
- `incomes(id, user_id, name, type, region, amount, currency, frequency, note, …)`
- `expenses(id, user_id, name, category, region, amount, currency, date, note, …)`
- `exchange_rates(currency PK, rate_to_twd, updated_at)` — Cron 每小時整點更新
- `invoices(id, user_id, inv_num, inv_date, period, random_code, total_amount, seller_ban, items, expense_id, prize_tier, prize_amount, …)` — 掃進來的發票,`(user_id, inv_num)` 唯一
- `invoice_awards(period PK, special, grand, first, extra_sixth, updated_at)` — 財政部公布的中獎號碼,全站共用

枚舉一律存**英文代碼**(如 `cash_tw`、`stock_us`、`monthly`),中文標籤只存在前端 `constants.ts`,避免日後改文案要動資料庫。

### 資產類別代碼 ↔ 規格書分組
| 分組 | 代碼 |
|---|---|
| 現金與存款 | `cash_tw` / `cash_vn` / `cash_other` |
| 投資 | `stock_tw` / `etf_fund` / `stock_vn` / `stock_us` |
| 不動產 | `realestate_tw` / `realestate_vn` |
| 保障 | `insurance` |
| 勞退/退休金 | `pension` |
| 負債 | `liability` |
| 其他 | `other` |

## 5. API 設計(全部在 `/api` 下,除 auth 外皆需 JWT)

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/auth/register` | 註冊(可用 `ALLOW_REGISTRATION` 環境變數關閉) |
| POST | `/api/auth/login` | 登入,回傳 JWT |
| GET | `/api/me` | 目前使用者 |
| GET/POST | `/api/assets` · `/api/incomes` · `/api/expenses` | 清單 / 新增 |
| PUT/DELETE | `/api/{assets,incomes,expenses}/:id` | 編輯 / 刪除(限本人資料) |
| GET | `/api/rates` | 匯率表 + 更新時間(超過 24h 未更新會現抓一次) |
| POST | `/api/rates/refresh` | 手動刷新匯率 |
| GET | `/api/invoices` | 已記錄的發票 + 對獎結果 |
| POST | `/api/invoices` | 手動輸入(號碼、日期、金額必填;店名與品項只有這條路填得到) |
| POST | `/api/invoices/scan` | 送出 QR 原始字串,回傳解析結果(重複回 409) |
| DELETE | `/api/invoices/:id` | 刪除發票,連帶刪掉它產生的花費 |
| GET | `/api/invoices/awards` | 目前手上有哪幾期中獎號碼 |
| POST | `/api/invoices/awards/refresh` | 手動重抓號碼並補對獎 |

### 發票記帳為什麼是掃 QR 而不是綁載具

財政部的載具 API(`carrierInvChk`)每次呼叫都要帶 `appID`,而申請資格已限縮為
通過 ISO 27001 / CNS 27001 驗證的企業,個人開發者拿不到。紙本電子發票證明聯
上的兩個 QR Code 本身就含發票號碼、開立日期、含稅金額與品項明細,解析它不需
要任何授權。

- 左側 QR 前 77 碼是固定寬度欄位(金額為十六進位),右側 QR 以 `**` 開頭,只是
  品項的續篇——記帳與對獎只需要左碼。
- 解析一律在後端做,前端只把掃到的字串原封不動送上來,金額與號碼前端改不動。
- 中獎號碼來自財政部稅務入口網的公開 RSS(`invoice.etax.nat.gov.tw/invoice.xml`),
  同樣免申請。解析不到完整的一期就整期跳過:少一期只是晚點對獎,寫進半套號碼
  卻會讓人誤以為自己沒中。
- 中獎通知走 Email(Brevo)。iOS 的網頁推播要求 16.4 以上且必須先加到主畫面,
  Email 則是不管哪支手機都收得到。

## 6. 商業邏輯落點

計算(TWD 換算、月均收入、淨資產公式、月度結餘)全部放在**前端 `lib/finance.ts`**:
API 只回傳原始列 + 匯率表,一次載入後所有頁面共用,切換篩選/月份不需重打 API。
規格書第 3 節的規則逐條對應:

1. 換算:`toTWD(amount, currency) = amount × rate_to_twd`;清單顯示原幣別。
2. 月均收入:`monthly` 全額、`yearly` ÷12、`once` 不計入。
3. 本月支出:僅加總 `date` 落在當月的 expenses。
4. 淨資產:`(現金+投資+不動產+勞退) − (負債+保險)`。
5. 結餘:`月均收入(TWD) − 當月實際支出(TWD)`。

## 7. 安全性

- 密碼:PBKDF2-SHA256(100,000 次迭代 + 隨機 salt),WebCrypto 原生。
- JWT:HS256,secret 存 Worker Secret(`wrangler secret put JWT_SECRET`),7 天效期。
- 所有資料表查詢都帶 `user_id` 條件(多人共用也不會互看資料)。
- D1 綁定只在 Worker 內部,前端拿不到資料庫。

## 8. 部署流程摘要(詳見 DEPLOY.md)

1. `wrangler d1 create fintrack-db` → 把 `database_id` 填回 `wrangler.jsonc`
2. `wrangler d1 migrations apply fintrack-db --remote`
3. `wrangler secret put JWT_SECRET`
4. `npm run deploy`(= `vite build` + `wrangler deploy`)
5. (可選)GitHub Actions 自動部署:在 repo secrets 加 `CLOUDFLARE_API_TOKEN`
