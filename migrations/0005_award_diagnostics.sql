-- 中獎號碼抓不到時,原本每一條失敗路徑都是 catch {},使用者只看得到「還沒對獎」,
-- 我們也查不出是哪一步斷掉。這份 migration 補的全是「後來看得出發生過什麼」的欄位。

-- 號碼從哪來。RSS 版面偶爾會改,解析不出來的期別由管理者手動補(manual),
-- 之後 RSS 再抓到同一期也不會蓋掉人工確認過的號碼。
ALTER TABLE invoice_awards ADD COLUMN source TEXT NOT NULL DEFAULT 'rss';

-- 每個排程工作留最後一次的結果。只留最後一次是刻意的:要判斷「現在對不了獎
-- 是因為什麼」看最新一次就夠,不需要為此養一張會長大的 log 表。
CREATE TABLE job_runs (
  name TEXT PRIMARY KEY,               -- awards_refresh / invoice_check
  ran_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT                          -- 成功寫寫入了哪幾期,失敗寫錯誤原文
);

-- 每期的對獎結果通知只寄一次。沒中獎也要寄——收不到信的人分不出「對完了沒中」
-- 與「根本沒對到」,而 invoices.notified_at 只記得住中獎的那幾張,承載不了這件事。
CREATE TABLE invoice_notices (
  user_id INTEGER NOT NULL REFERENCES users(id),
  period TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, period)
);
