import { Hono } from "hono";
import type { AppContext } from "./env";
import { CURRENCIES } from "./rates";
import { categoryExists, ensureCategories } from "./categories";

type FieldSpec = {
  name: string;
  kind: "string" | "number" | "enum" | "date" | "optional-string" | "category";
  values?: readonly string[];
  /** kind 為 category 時,要比對哪一類的分類表 */
  categoryKind?: "asset" | "income" | "expense";
};

const REGIONS = ["TW", "VN", "US", "OTHER"] as const;
const FREQUENCIES = ["monthly", "yearly", "once"] as const;

const TABLES: Record<string, FieldSpec[]> = {
  assets: [
    { name: "name", kind: "string" },
    { name: "category", kind: "category", categoryKind: "asset" },
    { name: "region", kind: "enum", values: REGIONS },
    { name: "amount", kind: "number" },
    { name: "currency", kind: "enum", values: CURRENCIES },
    { name: "note", kind: "optional-string" },
  ],
  incomes: [
    { name: "name", kind: "string" },
    { name: "type", kind: "category", categoryKind: "income" },
    { name: "region", kind: "enum", values: REGIONS },
    { name: "amount", kind: "number" },
    { name: "currency", kind: "enum", values: CURRENCIES },
    { name: "frequency", kind: "enum", values: FREQUENCIES },
    { name: "note", kind: "optional-string" },
  ],
  expenses: [
    { name: "name", kind: "string" },
    { name: "category", kind: "category", categoryKind: "expense" },
    { name: "region", kind: "enum", values: REGIONS },
    { name: "amount", kind: "number" },
    { name: "currency", kind: "enum", values: CURRENCIES },
    { name: "date", kind: "date" },
    { name: "note", kind: "optional-string" },
  ],
};

function validate(fields: FieldSpec[], body: Record<string, unknown>): { values: unknown[]; error?: string } {
  const values: unknown[] = [];
  for (const f of fields) {
    const v = body[f.name];
    switch (f.kind) {
      case "string":
        if (typeof v !== "string" || !v.trim()) return { values, error: `${f.name} 為必填` };
        values.push(v.trim());
        break;
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) return { values, error: `${f.name} 必須是數字` };
        values.push(v);
        break;
      case "enum":
        if (typeof v !== "string" || !f.values!.includes(v)) return { values, error: `${f.name} 值不合法` };
        values.push(v);
        break;
      case "date":
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { values, error: `${f.name} 格式須為 YYYY-MM-DD` };
        values.push(v);
        break;
      case "category":
        // 只做格式檢查,是否真的存在留給 checkCategories 查資料庫
        if (typeof v !== "string" || !v.trim()) return { values, error: `${f.name} 為必填` };
        values.push(v.trim());
        break;
      case "optional-string":
        values.push(typeof v === "string" && v.trim() ? v.trim() : null);
        break;
    }
  }
  return { values };
}

/**
 * 分類是動態的,得回資料庫確認這個 key 屬於該使用者。
 *
 * 查不到才補種一次再判——ensureCategories 現在是補齊差集,
 * 每次寫入都跑會白白多出幾十筆 no-op。正常路徑上分類早就存在了。
 */
async function checkCategories(
  db: D1Database,
  userId: number,
  fields: FieldSpec[],
  values: unknown[],
): Promise<string | null> {
  let seeded = false;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.kind !== "category") continue;
    const key = values[i] as string;
    let ok = await categoryExists(db, userId, f.categoryKind!, key);
    if (!ok && !seeded) {
      await ensureCategories(db, userId);
      seeded = true;
      ok = await categoryExists(db, userId, f.categoryKind!, key);
    }
    if (!ok) return `${f.name} 值不合法`;
  }
  return null;
}

export function crudRoutes(table: keyof typeof TABLES) {
  const fields = TABLES[table];
  const cols = fields.map((f) => f.name);
  const app = new Hono<AppContext>();

  app.get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT id, ${cols.join(", ")} FROM ${table} WHERE user_id = ? ORDER BY id DESC`,
    )
      .bind(c.get("userId"))
      .all();
    return c.json(results);
  });

  app.post("/", async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const { values, error } = validate(fields, body);
    if (error) return c.json({ error }, 400);
    const catError = await checkCategories(c.env.DB, c.get("userId"), fields, values);
    if (catError) return c.json({ error: catError }, 400);
    const row = await c.env.DB.prepare(
      `INSERT INTO ${table} (user_id, ${cols.join(", ")}) VALUES (?${", ?".repeat(cols.length)}) RETURNING id, ${cols.join(", ")}`,
    )
      .bind(c.get("userId"), ...values)
      .first();
    return c.json(row, 201);
  });

  app.put("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<Record<string, unknown>>();
    const { values, error } = validate(fields, body);
    if (error) return c.json({ error }, 400);
    const catError = await checkCategories(c.env.DB, c.get("userId"), fields, values);
    if (catError) return c.json({ error: catError }, 400);
    const row = await c.env.DB.prepare(
      `UPDATE ${table} SET ${cols.map((n) => `${n} = ?`).join(", ")}, updated_at = datetime('now') ` +
        `WHERE id = ? AND user_id = ? RETURNING id, ${cols.join(", ")}`,
    )
      .bind(...values, id, c.get("userId"))
      .first();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  app.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const result = await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`)
      .bind(id, c.get("userId"))
      .run();
    if (!result.meta.changes) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
