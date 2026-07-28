import { Hono } from "hono";
import type { AppContext, Env } from "./env";
import { categoryExists, ensureCategories } from "./categories";
import { sendPrizeEmail } from "./email";
import {
  checkPrize, drawDate, mergeRightQr, parseInvoiceQr,
  refreshAwards, rowToAward, type InvoiceItem, type ParsedInvoice,
} from "./einvoice";

/**
 * 從品名猜花費分類。猜錯是常態,所以只求命中常見的幾類,其餘一律丟
 * 「其他」,讓使用者在花費頁改——這比硬猜一個看起來很篤定的分類好。
 */
const CATEGORY_HINTS: [string, RegExp][] = [
  ["food", /咖啡|拿鐵|美式|飲|茶|奶|餐|食|便當|麵|飯|粥|湯|包子|吐司|麵包|蛋糕|餅|糖|巧克力|冰|雞|豬|牛|魚|蔬|果|零食|泡麵|水餃|壽司|披薩|漢堡/],
  ["daily", /衛生紙|紙巾|洗髮|沐浴|牙膏|牙刷|洗衣|清潔|垃圾袋|電池|口罩|洗碗|柔軟精|肥皂/],
  ["transport", /加油|汽油|柴油|停車|過路|捷運|高鐵|台鐵|客運|計程車|車票|悠遊|一卡通|輪胎|機油/],
  ["telecom", /電信|通話|網路|寬頻|門號|預付卡|漫遊/],
  ["housing", /電費|水費|瓦斯|天然氣|房租|管理費|租金/],
  ["medical", /藥|診所|醫院|門診|掛號|口罩|維他命|保健|眼鏡|隱形/],
  ["clothing", /衣|褲|裙|鞋|襪|外套|帽|包包|內衣/],
  ["beauty", /化妝|保養|面膜|洗面|乳液|口紅|美髮|剪髮|染髮|指甲/],
  ["baby", /尿布|奶粉|嬰兒|寶寶|奶嘴|副食品/],
  ["pet", /飼料|貓砂|寵物|狗糧|貓糧/],
  ["entertainment", /電影|遊戲|門票|KTV|訂閱|Netflix|Spotify|樂園/i],
  ["education", /書|文具|課程|補習|學費|教材|筆記本/],
];

function guessCategory(items: InvoiceItem[]): string {
  const text = items.map((i) => i.name).join(" ");
  if (!text) return "other";
  for (const [key, re] of CATEGORY_HINTS) if (re.test(text)) return key;
  return "other";
}

/** QR 裡沒有店名,只能拿品項湊一個看得懂的名字 */
function nameOf(parsed: ParsedInvoice): string {
  const first = parsed.items[0]?.name?.trim();
  if (!first) return `發票 ${parsed.invNum}`;
  const extra = Math.max(parsed.items.length, parsed.totalItemCount) - 1;
  return extra > 0 ? `${first} 等 ${extra + 1} 項` : first;
}

const INVOICE_COLS =
  "id, inv_num, inv_date, period, random_code, total_amount, seller_ban, seller_name, " +
  "items, expense_id, prize_tier, prize_amount, checked_at";

// ── 對獎 ──────────────────────────────────────────────

/** 已開獎且抓得到號碼的期別,一次全撈,呼叫端自己挑 */
async function loadAwards(db: D1Database) {
  const { results } = await db
    .prepare("SELECT period, special, grand, first, extra_sixth FROM invoice_awards")
    .all<{ period: string; special: string; grand: string; first: string; extra_sixth: string }>();
  const today = new Date().toISOString().slice(0, 10);
  return new Map(
    results.filter((r) => drawDate(r.period) <= today).map((r) => [r.period, rowToAward(r)]),
  );
}

/**
 * 把還沒對獎的發票補對完。只處理已經開獎、而且中獎號碼確實在庫裡的期別
 * ——號碼抓不到就讓它一直掛著,總比誤標成「沒中獎」好。
 */
export async function checkPendingInvoices(env: Env): Promise<number> {
  const awards = await loadAwards(env.DB);
  if (awards.size === 0) return 0;

  const { results } = await env.DB.prepare(
    `SELECT id, inv_num, period FROM invoices WHERE prize_tier IS NULL AND period IN (${
      [...awards.keys()].map(() => "?").join(", ")
    })`,
  )
    .bind(...awards.keys())
    .all<{ id: number; inv_num: string; period: string }>();
  if (results.length === 0) return 0;

  await env.DB.batch(
    results.map((inv) => {
      const { tier, amount } = checkPrize(inv.inv_num, awards.get(inv.period)!);
      return env.DB.prepare(
        "UPDATE invoices SET prize_tier = ?, prize_amount = ?, checked_at = datetime('now') WHERE id = ?",
      ).bind(tier, amount, inv.id);
    }),
  );
  return results.length;
}

/** 中獎了才寄信,而且每張只寄一次(notified_at) */
export async function notifyWinners(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    "SELECT i.id, i.inv_num, i.prize_tier, i.prize_amount, i.period, u.email, u.name " +
      "FROM invoices i JOIN users u ON u.id = i.user_id " +
      "WHERE i.prize_amount > 0 AND i.notified_at IS NULL ORDER BY u.email",
  ).all<{
    id: number; inv_num: string; prize_tier: string; prize_amount: number;
    period: string; email: string; name: string;
  }>();
  if (results.length === 0) return 0;

  const byUser = new Map<string, typeof results>();
  for (const r of results) {
    const list = byUser.get(r.email);
    if (list) list.push(r);
    else byUser.set(r.email, [r]);
  }

  let sent = 0;
  for (const [email, wins] of byUser) {
    try {
      await sendPrizeEmail(env, email, wins[0].name, wins);
      await env.DB.batch(
        wins.map((w) =>
          env.DB.prepare("UPDATE invoices SET notified_at = datetime('now') WHERE id = ?").bind(w.id),
        ),
      );
      sent += wins.length;
    } catch {
      // 寄失敗就留著 notified_at = NULL,下一次 Cron 會再試
    }
  }
  return sent;
}

/** Cron 的整套流程:更新號碼 → 補對獎 → 通知 */
export async function runInvoiceJobs(env: Env): Promise<void> {
  // 中獎號碼兩個月才換一次,沒必要每小時抓
  const last = await env.DB.prepare("SELECT MAX(updated_at) AS at FROM invoice_awards").first<{ at: string | null }>();
  const stale = !last?.at || Date.now() - Date.parse(last.at + "Z") > 6 * 3600 * 1000;
  if (stale) {
    try {
      await refreshAwards(env);
    } catch {
      // 抓不到就沿用資料庫裡既有的號碼
    }
  }
  await checkPendingInvoices(env);
  await notifyWinners(env);
}

// ── 路由 ──────────────────────────────────────────────

export const invoiceRoutes = new Hono<AppContext>();

invoiceRoutes.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${INVOICE_COLS} FROM invoices WHERE user_id = ? ORDER BY inv_date DESC, id DESC`,
  )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

/**
 * 掃描結果進來的唯一入口。
 *
 * 前端只送掃到的原始字串,發票號碼與金額都由後端自己從字串裡取,不接受
 * 前端算好的數字。左側 QR 是必要的,右側(**開頭)只補品項。
 */
invoiceRoutes.post("/scan", async (c) => {
  const body = await c.req.json<{ left?: unknown; right?: unknown }>();
  if (typeof body.left !== "string") return c.json({ error: "缺少掃描內容" }, 400);

  const parsed = parseInvoiceQr(body.left);
  if (!parsed) {
    const hint = body.left.trim().startsWith("**")
      ? "這是右邊那個 QR Code,請改掃左邊的"
      : "認不出這是電子發票的 QR Code";
    return c.json({ error: hint }, 400);
  }
  if (typeof body.right === "string") mergeRightQr(parsed, body.right);

  const userId = c.get("userId");
  const dup = await c.env.DB.prepare(`SELECT ${INVOICE_COLS} FROM invoices WHERE user_id = ? AND inv_num = ?`)
    .bind(userId, parsed.invNum)
    .first();
  if (dup) return c.json({ error: "這張發票已經掃過了", invoice: dup }, 409);

  // 分類是使用者自己的一份,猜出來的 key 不一定在他的表裡(可能被封存或
  // 這個帳號還沒種過),補種一次再退回「其他」。
  let category = guessCategory(parsed.items);
  if (!(await categoryExists(c.env.DB, userId, "expense", category))) {
    await ensureCategories(c.env.DB, userId);
    if (!(await categoryExists(c.env.DB, userId, "expense", category))) category = "other";
  }

  const expense = await c.env.DB.prepare(
    "INSERT INTO expenses (user_id, name, category, region, amount, currency, date, note) " +
      "VALUES (?, ?, ?, 'TW', ?, 'TWD', ?, ?) RETURNING id",
  )
    .bind(userId, nameOf(parsed), category, parsed.totalAmount, parsed.date, `發票 ${parsed.invNum}`)
    .first<{ id: number }>();

  // 開過獎的期別就當場對,沒開獎的留白等 Cron
  const awards = await loadAwards(c.env.DB);
  const award = awards.get(parsed.period);
  const prize = award ? checkPrize(parsed.invNum, award) : null;

  const invoice = await c.env.DB.prepare(
    "INSERT INTO invoices (user_id, inv_num, inv_date, period, random_code, total_amount, " +
      "seller_ban, items, expense_id, prize_tier, prize_amount, checked_at) " +
      `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${prize ? "datetime('now')" : "NULL"}) RETURNING ${INVOICE_COLS}`,
  )
    .bind(
      userId, parsed.invNum, parsed.date, parsed.period, parsed.randomCode, parsed.totalAmount,
      parsed.sellerBan, JSON.stringify(parsed.items), expense?.id ?? null,
      prize?.tier ?? null, prize?.amount ?? null,
    )
    .first();

  return c.json({ invoice, needRightQr: parsed.totalItemCount > parsed.items.length }, 201);
});

/** 刪發票時連帶刪掉它產生的那筆花費,不然帳上會留一筆孤兒 */
invoiceRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const userId = c.get("userId");
  const row = await c.env.DB.prepare("SELECT expense_id FROM invoices WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ expense_id: number | null }>();
  if (!row) return c.json({ error: "not_found" }, 404);

  const stmts = [c.env.DB.prepare("DELETE FROM invoices WHERE id = ? AND user_id = ?").bind(id, userId)];
  if (row.expense_id) {
    stmts.push(
      c.env.DB.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").bind(row.expense_id, userId),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

/** 目前手上有哪幾期的中獎號碼,順便讓人看得出對獎是不是真的有資料 */
invoiceRoutes.get("/awards", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT period, special, grand, first, extra_sixth, updated_at FROM invoice_awards ORDER BY period DESC",
  ).all<{ period: string; first: string; extra_sixth: string; updated_at: string }>();
  const today = new Date().toISOString().slice(0, 10);
  return c.json(
    results.map((r) => ({
      ...r,
      first: r.first.split(",").filter(Boolean),
      extra_sixth: r.extra_sixth.split(",").filter(Boolean),
      drawn: drawDate(r.period) <= today,
    })),
  );
});

invoiceRoutes.post("/awards/refresh", async (c) => {
  try {
    const periods = await refreshAwards(c.env);
    const checked = await checkPendingInvoices(c.env);
    return c.json({ periods, checked });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});
