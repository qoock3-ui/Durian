import { Hono } from "hono";
import type { AppContext, Env } from "./env";
import { authRoutes, requireAuth } from "./auth";
import { crudRoutes } from "./crud";
import { ratesRoutes, refreshRates } from "./rates";

const app = new Hono<AppContext>();

app.route("/api/auth", authRoutes);

app.use("/api/*", requireAuth);

app.get("/api/me", async (c) => {
  const user = await c.env.DB.prepare("SELECT id, email, name FROM users WHERE id = ?")
    .bind(c.get("userId"))
    .first();
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json(user);
});

app.route("/api/assets", crudRoutes("assets"));
app.route("/api/incomes", crudRoutes("incomes"));
app.route("/api/expenses", crudRoutes("expenses"));
app.route("/api/rates", ratesRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshRates(env));
  },
};
