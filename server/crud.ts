import { Hono } from "hono";
import type { AppContext } from "./env";
import { CURRENCIES } from "./rates";

type FieldSpec = {
  name: string;
  kind: "string" | "number" | "enum" | "date" | "optional-string";
  values?: readonly string[];
};

const REGIONS = ["TW", "VN", "US", "OTHER"] as const;

const ASSET_CATEGORIES = [
  "cash_tw", "cash_vn", "cash_other",
  "stock_tw", "etf_fund", "stock_vn", "stock_us",
  "realestate_tw", "realestate_vn",
  "insurance", "pension", "liability", "other",
] as const;

const INCOME_TYPES = ["active", "passive", "investment", "other"] as const;
const FREQUENCIES = ["monthly", "yearly", "once"] as const;
const EXPENSE_CATEGORIES = [
  "food", "transport", "housing", "entertainment", "medical", "shopping", "work", "other",
] as const;

const TABLES: Record<string, FieldSpec[]> = {
  assets: [
    { name: "name", kind: "string" },
    { name: "category", kind: "enum", values: ASSET_CATEGORIES },
    { name: "region", kind: "enum", values: REGIONS },
    { name: "amount", kind: "number" },
    { name: "currency", kind: "enum", values: CURRENCIES },
    { name: "note", kind: "optional-string" },
  ],
  incomes: [
    { name: "name", kind: "string" },
    { name: "type", kind: "enum", values: INCOME_TYPES },
    { name: "region", kind: "enum", values: REGIONS },
    { name: "amount", kind: "number" },
    { name: "currency", kind: "enum", values: CURRENCIES },
    { name: "frequency", kind: "enum", values: FREQUENCIES },
    { name: "note", kind: "optional-string" },
  ],
  expenses: [
    { name: "name", kind: "string" },
    { name: "category", kind: "enum", values: EXPENSE_CATEGORIES },
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
      case "optional-string":
        values.push(typeof v === "string" && v.trim() ? v.trim() : null);
        break;
    }
  }
  return { values };
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
