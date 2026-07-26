import { Hono } from "hono";
import type { AppContext } from "./env";
import { CATEGORY_KINDS, DEFAULTS, TINTS } from "./defaultCategories";

type Kind = (typeof CATEGORY_KINDS)[number];

const isKind = (v: unknown): v is Kind => typeof v === "string" && (CATEGORY_KINDS as readonly string[]).includes(v);

/**
 * 首次讀取時把預設分類種進去。用 INSERT OR IGNORE 搭配唯一索引,
 * 併發重複呼叫也只會留一份。
 */
export async function ensureCategories(db: D1Database, userId: number): Promise<void> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM categories WHERE user_id = ?").bind(userId).first<{ n: number }>();
  if (row && row.n > 0) return;

  const stmt = db.prepare(
    "INSERT OR IGNORE INTO categories (user_id, kind, key, group_name, label, icon, tint, sign, sort) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const batch: D1PreparedStatement[] = [];
  for (const kind of CATEGORY_KINDS) {
    DEFAULTS[kind].forEach((c, i) => {
      batch.push(stmt.bind(userId, kind, c.key, c.group, c.label, c.icon, c.tint, c.sign ?? 1, i));
    });
  }
  await db.batch(batch);
}

/** crud.ts 用:確認這個 key 屬於該使用者的該類分類(封存的仍可通過,以免舊資料改不動) */
export async function categoryExists(
  db: D1Database,
  userId: number,
  kind: Kind,
  key: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM categories WHERE user_id = ? AND kind = ? AND key = ?")
    .bind(userId, kind, key)
    .first<{ ok: number }>();
  return !!row;
}

export const categoryRoutes = new Hono<AppContext>();

categoryRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  await ensureCategories(c.env.DB, userId);
  const { results } = await c.env.DB.prepare(
    "SELECT id, kind, key, group_name, label, icon, tint, sign, sort, archived " +
      "FROM categories WHERE user_id = ? ORDER BY kind, sort, id",
  )
    .bind(userId)
    .all();
  return c.json(results);
});

categoryRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  await ensureCategories(c.env.DB, userId);
  const body = await c.req.json<Record<string, unknown>>();

  const kind = body.kind;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const group = typeof body.group_name === "string" ? body.group_name.trim() : "";
  const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "🏷️";
  const tint = typeof body.tint === "string" && (TINTS as readonly string[]).includes(body.tint) ? body.tint : "bg-p-stone";
  const sign = body.sign === -1 ? -1 : 1;

  if (!isKind(kind)) return c.json({ error: "kind 值不合法" }, 400);
  if (!label) return c.json({ error: "名稱為必填" }, 400);
  if (!group) return c.json({ error: "分組為必填" }, 400);

  // 自訂 key 加前綴,永遠不會撞到預設分類
  const key = `c_${crypto.randomUUID().slice(0, 8)}`;
  const next = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM categories WHERE user_id = ? AND kind = ?",
  )
    .bind(userId, kind)
    .first<{ s: number }>();

  const row = await c.env.DB.prepare(
    "INSERT INTO categories (user_id, kind, key, group_name, label, icon, tint, sign, sort) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "RETURNING id, kind, key, group_name, label, icon, tint, sign, sort, archived",
  )
    .bind(userId, kind, key, group, label, icon, tint, kind === "asset" ? sign : 1, next?.s ?? 0)
    .first();
  return c.json(row, 201);
});

categoryRoutes.put("/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const group = typeof body.group_name === "string" ? body.group_name.trim() : "";
  const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "🏷️";
  const tint = typeof body.tint === "string" && (TINTS as readonly string[]).includes(body.tint) ? body.tint : "bg-p-stone";
  const archived = body.archived ? 1 : 0;

  if (!label) return c.json({ error: "名稱為必填" }, 400);
  if (!group) return c.json({ error: "分組為必填" }, 400);

  const row = await c.env.DB.prepare(
    "UPDATE categories SET label = ?, group_name = ?, icon = ?, tint = ?, archived = ? " +
      "WHERE id = ? AND user_id = ? " +
      "RETURNING id, kind, key, group_name, label, icon, tint, sign, sort, archived",
  )
    .bind(label, group, icon, tint, archived, id, userId)
    .first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

/**
 * 封存而非刪除。分類的 key 已經寫進資料列裡,真的刪掉會讓那些
 * 資產/收入/花費失去標籤,所以只是從選單裡收起來。
 */
categoryRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const result = await c.env.DB.prepare("UPDATE categories SET archived = 1 WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  if (!result.meta.changes) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
