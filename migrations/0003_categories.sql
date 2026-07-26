-- 使用者可自訂的分類表。
-- 不種資料:預設分類由 server/categories.ts 的 ensureCategories() 在首次
-- 讀取時寫入,既有使用者與新註冊者走同一條路徑,定義只留在 TypeScript 一處。
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,                  -- asset | income | expense
  key TEXT NOT NULL,                   -- 寫進 assets.category / incomes.type / expenses.category 的值
  group_name TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  tint TEXT NOT NULL,
  sign INTEGER NOT NULL DEFAULT 1,     -- 資產專用:-1 計入淨資產時為減項
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0, -- 封存而非刪除,既有資料才不會變成孤兒
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_categories_unique ON categories(user_id, kind, key);
CREATE INDEX idx_categories_user_kind ON categories(user_id, kind);
