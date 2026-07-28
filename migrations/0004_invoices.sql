-- 掃描紙本電子發票證明聯 QR Code 後存下的發票。
-- 一張發票同時是兩件事:一筆花費(expense_id)與一張待對獎的彩券(prize_tier)。
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  inv_num TEXT NOT NULL,               -- 發票字軌號碼,如 AB12345678
  inv_date TEXT NOT NULL,              -- 開立日期(西元) 2026-07-15
  period TEXT NOT NULL,                -- 所屬期別,存單數月 2026-07 = 115 年 7-8 月期
  random_code TEXT NOT NULL,           -- 四位隨機碼,兌獎時櫃台會核對
  total_amount REAL NOT NULL,          -- 含稅總計
  seller_ban TEXT NOT NULL,            -- 賣方統編
  seller_name TEXT,                    -- QR 裡沒有店名,留給使用者自己補
  items TEXT,                          -- JSON:[{ name, qty, price }]
  expense_id INTEGER REFERENCES expenses(id),
  -- NULL 代表尚未對獎(該期還沒開獎,或中獎號碼還沒抓到)。
  -- 只有在確實拿到該期號碼後才會寫入,寧可留白也不要誤判沒中。
  prize_tier TEXT,
  prize_amount INTEGER,
  checked_at TEXT,
  notified_at TEXT,                    -- 中獎通知信寄出時間,用來避免重複寄
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 同一張發票掃第二次要被擋下來,而不是變成兩筆花費
CREATE UNIQUE INDEX idx_invoices_unique ON invoices(user_id, inv_num);
CREATE INDEX idx_invoices_user_date ON invoices(user_id, inv_date);
-- Cron 每次只撈還沒對獎的,加條件索引免得整表掃
CREATE INDEX idx_invoices_pending ON invoices(period) WHERE prize_tier IS NULL;

-- 財政部公布的中獎號碼。與使用者無關,全站共用一份。
CREATE TABLE invoice_awards (
  period TEXT PRIMARY KEY,             -- 2026-07 = 115 年 7-8 月期
  special TEXT NOT NULL,               -- 特別獎 1000 萬,8 碼
  grand TEXT NOT NULL,                 -- 特獎 200 萬,8 碼
  first TEXT NOT NULL,                 -- 頭獎 20 萬,逗號分隔的多組 8 碼
  extra_sixth TEXT NOT NULL DEFAULT '',-- 增開六獎 200 元,逗號分隔的 3 碼
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
