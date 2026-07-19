import { Hono } from "hono";
import type { AppContext, Env } from "./env";

export const CURRENCIES = ["TWD", "VND", "USD", "EUR", "JPY", "GBP", "HKD", "SGD", "AUD", "CAD", "KRW"] as const;

const STALE_MS = 24 * 3600 * 1000;

// open.er-api.com:免費、無需金鑰,以 TWD 為基準回傳各幣別匯率
export async function refreshRates(env: Env): Promise<void> {
  const res = await fetch("https://open.er-api.com/v6/latest/TWD");
  if (!res.ok) throw new Error(`rate api ${res.status}`);
  const data = (await res.json()) as { result: string; rates: Record<string, number> };
  if (data.result !== "success") throw new Error("rate api returned failure");
  const stmts = [];
  for (const cur of CURRENCIES) {
    const perTwd = data.rates[cur];
    if (!perTwd) continue;
    stmts.push(
      env.DB.prepare(
        "INSERT INTO exchange_rates (currency, rate_to_twd, updated_at) VALUES (?, ?, datetime('now')) " +
          "ON CONFLICT(currency) DO UPDATE SET rate_to_twd = excluded.rate_to_twd, updated_at = excluded.updated_at",
      ).bind(cur, 1 / perTwd),
    );
  }
  await env.DB.batch(stmts);
}

async function readRates(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT currency, rate_to_twd, updated_at FROM exchange_rates",
  ).all<{ currency: string; rate_to_twd: number; updated_at: string }>();
  const rates: Record<string, number> = {};
  let updatedAt: string | null = null;
  for (const r of results) {
    rates[r.currency] = r.rate_to_twd;
    if (!updatedAt || r.updated_at > updatedAt) updatedAt = r.updated_at;
  }
  return { rates, updated_at: updatedAt };
}

export const ratesRoutes = new Hono<AppContext>();

ratesRoutes.get("/", async (c) => {
  let data = await readRates(c.env);
  const stale = !data.updated_at || Date.now() - Date.parse(data.updated_at + "Z") > STALE_MS;
  if (stale) {
    try {
      await refreshRates(c.env);
      data = await readRates(c.env);
    } catch {
      // 抓取失敗時沿用快取(含種子匯率)
    }
  }
  return c.json(data);
});

ratesRoutes.post("/refresh", async (c) => {
  try {
    await refreshRates(c.env);
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
  return c.json(await readRates(c.env));
});
