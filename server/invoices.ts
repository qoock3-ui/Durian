import { Hono } from "hono";
import type { AppContext, Env } from "./env";
import { categoryExists, ensureCategories } from "./categories";
import { sendPrizeEmail } from "./email";
import {
  checkPrize, drawDate, mergeRightQr, parseInvoiceQr, periodOf,
  refreshAwards, rowToAward, type InvoiceItem,
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

/**
 * 這筆花費要叫什麼。店名最好認,但 QR 裡沒有——只有手動輸入時才拿得到,
 * 所以其次用品項湊,再不然就掛發票號碼。
 */
function nameOf(inv: {
  invNum: string;
  sellerName?: string | null;
  items: InvoiceItem[];
  totalItemCount?: number;
}): string {
  const seller = inv.sellerName?.trim();
  if (seller) return seller;
  const first = inv.items[0]?.name?.trim();
  if (!first) return `發票 ${inv.invNum}`;
  const extra = Math.max(inv.items.length, inv.totalItemCount ?? 0) - 1;
  return extra > 0 ? `${first} 等 ${extra + 1} 項` : first;
}

type NewInvoice = {
  invNum: string;
  date: string;
  period: string;
  randomCode: string;
  totalAmount: number;
  sellerBan: string;
  sellerName: string | null;
  items: InvoiceItem[];
  totalItemCount?: number;
  /** 使用者自己挑的分類。沒給就從品名猜 */
  category?: string;
};

/**
 * 寫進資料庫的共用路徑:掃描與手動輸入最後都走這裡,才不會有兩套規則。
 * 重複的發票回 409 而不是覆蓋——同一張掃第二次是誤觸,不是要改資料。
 */
async function insertInvoice(
  db: D1Database,
  userId: number,
  inv: NewInvoice,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const dup = await db
    .prepare(`SELECT ${INVOICE_COLS} FROM invoices WHERE user_id = ? AND inv_num = ?`)
    .bind(userId, inv.invNum)
    .first();
  if (dup) return { status: 409, body: { error: "這張發票已經記過了", invoice: dup } };

  // 分類是使用者自己的一份,猜出來(或指定)的 key 不一定在他的表裡
  // (可能被封存或這個帳號還沒種過),補種一次再退回「其他」。
  let category = inv.category?.trim() || guessCategory(inv.items);
  if (!(await categoryExists(db, userId, "expense", category))) {
    await ensureCategories(db, userId);
    if (!(await categoryExists(db, userId, "expense", category))) category = "other";
  }

  const expense = await db
    .prepare(
      "INSERT INTO expenses (user_id, name, category, region, amount, currency, date, note) " +
        "VALUES (?, ?, ?, 'TW', ?, 'TWD', ?, ?) RETURNING id",
    )
    .bind(userId, nameOf(inv), category, inv.totalAmount, inv.date, `發票 ${inv.invNum}`)
    .first<{ id: number }>();

  // 開過獎的期別就當場對,沒開獎的留白等 Cron
  const award = (await loadAwards(db)).get(inv.period);
  const prize = award ? checkPrize(inv.invNum, award) : null;

  const invoice = await db
    .prepare(
      "INSERT INTO invoices (user_id, inv_num, inv_date, period, random_code, total_amount, " +
        "seller_ban, seller_name, items, expense_id, prize_tier, prize_amount, checked_at) " +
        `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${prize ? "datetime('now')" : "NULL"}) ` +
        `RETURNING ${INVOICE_COLS}`,
    )
    .bind(
      userId, inv.invNum, inv.date, inv.period, inv.randomCode, inv.totalAmount,
      inv.sellerBan, inv.sellerName, JSON.stringify(inv.items), expense?.id ?? null,
      prize?.tier ?? null, prize?.amount ?? null,
    )
    .first();

  return { status: 201, body: { invoice } };
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

  const r = await insertInvoice(c.env.DB, c.get("userId"), {
    ...parsed,
    sellerName: null,
  });
  if (r.status !== 201) return c.json(r.body, 409);
  return c.json({ ...r.body, needRightQr: parsed.totalItemCount > parsed.items.length }, 201);
});

/**
 * 手動輸入。QR 破損、影印本、或單純不想開相機的時候用。
 *
 * 對獎只認發票號碼與日期,所以必填就這兩項加金額;店名與品項是 QR 給不了
 * 的東西,反而只有這條路填得進來。隨機碼不影響對獎,但去櫃台兌獎時要核對,
 * 有就存著。
 */
invoiceRoutes.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const invNum = str(b.inv_num).toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z]{2}\d{8}$/.test(invNum)) {
    return c.json({ error: "發票號碼格式不對,應該是兩個英文字母加八位數字,例如 AB12345678" }, 400);
  }
  const date = str(b.inv_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return c.json({ error: "開立日期格式須為 YYYY-MM-DD" }, 400);
  }
  const totalAmount = Number(b.total_amount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return c.json({ error: "金額必須是大於 0 的數字" }, 400);
  }
  const randomCode = str(b.random_code);
  if (randomCode && !/^\d{4}$/.test(randomCode)) {
    return c.json({ error: "隨機碼是四位數字" }, 400);
  }

  // 品項用逗號、頓號或換行分隔,只收名稱——手動輸入還要一項項填數量單價太累了
  const items: InvoiceItem[] = str(b.items)
    .split(/[,、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((name) => ({ name: name.slice(0, 60), qty: 0, price: 0 }));

  const r = await insertInvoice(c.env.DB, c.get("userId"), {
    invNum,
    date,
    period: periodOf(date),
    randomCode,
    totalAmount,
    sellerBan: "",
    sellerName: str(b.seller_name) || null,
    items,
    category: str(b.category),
  });
  return c.json(r.body, r.status as 201 | 409);
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
