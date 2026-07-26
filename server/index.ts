import { Hono } from "hono";
import type { AppContext, Env } from "./env";
import { authRoutes, computeIsAdmin, requireAuth } from "./auth";
import { categoryRoutes } from "./categories";
import { crudRoutes } from "./crud";
import { ratesRoutes, refreshRates } from "./rates";

const app = new Hono<AppContext>();

app.route("/api/auth", authRoutes);

app.use("/api/*", requireAuth);

app.get("/api/me", async (c) => {
  const user = await c.env.DB.prepare("SELECT id, email, name FROM users WHERE id = ?")
    .bind(c.get("userId"))
    .first<{ id: number; email: string; name: string }>();
  if (!user) return c.json({ error: "unauthorized" }, 401);
  // 前端據此決定要不要顯示「核發臨時密碼」,實際權限仍由後端再驗一次
  return c.json({ ...user, is_admin: computeIsAdmin(c.env, user.email) });
});

app.route("/api/categories", categoryRoutes);
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
