import { Hono } from "hono";
import type { AppContext, Env } from "./env";
import { isAdmin } from "./auth";
import { categoryExists, ensureCategories } from "./categories";
import { sendNoPrizeEmail, sendPrizeEmail } from "./email";
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

/**
 * 一期對完就寄一封結果通知,中獎與否都寄。
 *
 * 舊版只在中獎時寄信,結果「這期沒中」與「這期根本沒對到」對使用者來說
 * 都是收不到任何信,分不出來——而後者其實是我們壞掉了。所以改成以
 * (使用者, 期別)為單位:那期的發票全部都有 prize_tier 了才寄,一次一封。
 *
 * 寄成功才寫 invoice_notices,Brevo 掛掉的話下一個小時會再試一次。
 *
 * 寄不出去的原因一定要帶回去。信寄不到跟「這期沒中」在使用者那邊又是同一
 * 個樣子——收不到信——所以吞掉錯誤等於把剛修好的洞在隔壁再挖一個。
 */
export type NotifyOutcome = { sent: number; failed: number; error: string };

export async function notifyResults(env: Env): Promise<NotifyOutcome> {
  const { results: groups } = await env.DB.prepare(
    "SELECT i.user_id, i.period, u.email, u.name, COUNT(*) AS total, " +
      "SUM(CASE WHEN i.prize_tier IS NULL THEN 1 ELSE 0 END) AS pending " +
      "FROM invoices i JOIN users u ON u.id = i.user_id " +
      "LEFT JOIN invoice_notices n ON n.user_id = i.user_id AND n.period = i.period " +
      "WHERE n.user_id IS NULL GROUP BY i.user_id, i.period HAVING pending = 0",
  ).all<{ user_id: number; period: string; email: string; name: string; total: number }>();

  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let failed = 0;
  let error = "";
  for (const g of groups) {
    if (drawDate(g.period) > today) continue;

    const { results: wins } = await env.DB.prepare(
      "SELECT id, inv_num, prize_tier, prize_amount, period, notified_at FROM invoices " +
        "WHERE user_id = ? AND period = ? AND prize_amount > 0",
    )
      .bind(g.user_id, g.period)
      .all<{
        id: number; inv_num: string; prize_tier: string; prize_amount: number;
        period: string; notified_at: string | null;
      }>();

    // 舊版寄過的中獎信沒有 invoice_notices 可以認,只認得出 notified_at。
    // 全部都寄過就補一列紀錄了事,不然改版當天會把同一封中獎信再寄一次。
    if (wins.length > 0 && wins.every((w) => w.notified_at)) {
      await markNoticed(env, g.user_id, g.period);
      continue;
    }

    try {
      if (wins.length > 0) {
        await sendPrizeEmail(env, g.email, g.name, wins);
        await env.DB.batch(
          wins.map((w) =>
            env.DB.prepare("UPDATE invoices SET notified_at = datetime('now') WHERE id = ?").bind(w.id),
          ),
        );
      } else {
        await sendNoPrizeEmail(env, g.email, g.name, g.period, g.total);
      }
      await markNoticed(env, g.user_id, g.period);
      sent++;
    } catch (e) {
      // 寄失敗就不寫 invoice_notices,下一次 Cron 會再試同一期。
      // 只留第一個原因:同一把金鑰壞掉時每期的錯都一樣,記十次沒有比較清楚。
      failed++;
      if (!error) error = String(e);
    }
  }
  return { sent, failed, error };
}

/** 這次寄信的結果寫進 job_runs,前端才問得到「信到底寄了沒」 */
async function recordNotify(env: Env, n: NotifyOutcome): Promise<void> {
  const detail = n.failed
    ? `${n.failed} 封寄不出去${n.sent ? `(另外 ${n.sent} 封成功)` : ""}:${n.error}`
    : n.sent
      ? `寄出 ${n.sent} 封`
      : "沒有需要寄的";
  await recordRun(env.DB, "notify", n.failed === 0, detail);
}

async function markNoticed(env: Env, userId: number, period: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO invoice_notices (user_id, period, sent_at) VALUES (?, ?, datetime('now')) " +
      "ON CONFLICT(user_id, period) DO NOTHING",
  )
    .bind(userId, period)
    .run();
}

/**
 * 留下這次跑的結果。每個工作只留最後一次,寫失敗就算了——診斷資訊自己
 * 把整個排程弄掛才是本末倒置。
 */
export async function recordRun(db: D1Database, name: string, ok: boolean, detail: string): Promise<void> {
  try {
    await db
      .prepare(
        "INSERT INTO job_runs (name, ran_at, ok, detail) VALUES (?, datetime('now'), ?, ?) " +
          "ON CONFLICT(name) DO UPDATE SET ran_at = excluded.ran_at, ok = excluded.ok, detail = excluded.detail",
      )
      .bind(name, ok ? 1 : 0, detail.slice(0, 300))
      .run();
  } catch (e) {
    console.log("recordRun failed:", name, e);
  }
}

/** 成功時寫下拿到哪幾期,失敗時寫錯誤原文——兩者都是之後唯一查得到的線索 */
function refreshDetail(periods: string[]): string {
  return periods.length ? `寫入 ${periods.length} 期:${periods.join("、")}` : "沒有任何一期寫入";
}

/** Cron 的整套流程:更新號碼 → 補對獎 → 通知。每一段的結果都記進 job_runs */
export async function runInvoiceJobs(env: Env): Promise<void> {
  try {
    // 中獎號碼兩個月才換一次,沒必要每小時抓
    const last = await env.DB.prepare("SELECT MAX(updated_at) AS at FROM invoice_awards").first<{ at: string | null }>();
    const stale = !last?.at || Date.now() - Date.parse(last.at + "Z") > 6 * 3600 * 1000;
    if (stale) {
      try {
        const periods = await refreshAwards(env);
        await recordRun(env.DB, "awards_refresh", true, refreshDetail(periods));
      } catch (e) {
        // 抓不到就沿用資料庫裡既有的號碼,但這次為什麼抓不到要留下來
        await recordRun(env.DB, "awards_refresh", false, String(e));
      }
    }

    try {
      const checked = await checkPendingInvoices(env);
      const n = await notifyResults(env);
      await recordRun(env.DB, "invoice_check", true, `補對 ${checked} 張,寄出 ${n.sent} 封`);
      await recordNotify(env, n);
    } catch (e) {
      await recordRun(env.DB, "invoice_check", false, String(e));
    }
  } catch (e) {
    // scheduled() 不看回傳值,拋出去只會變成沒人讀的 log
    console.log("runInvoiceJobs failed:", e);
  }
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

/**
 * 對獎這件事目前的全貌:手上有哪幾期號碼、上次去抓的結果,以及 missing。
 *
 * missing 是這支 API 真正要回答的問題。使用者看到「等待對獎」時想知道的是
 * 「為什麼」,而答案幾乎都是「你那期的號碼還沒進來」——只有拿他自己的發票
 * 去比才講得出這句,所以 missing 一定要照呼叫者的發票算,不能回全站的。
 */
invoiceRoutes.get("/awards", async (c) => {
  const today = new Date().toISOString().slice(0, 10);

  const { results } = await c.env.DB.prepare(
    "SELECT period, special, grand, first, extra_sixth, source, updated_at " +
      "FROM invoice_awards ORDER BY period DESC",
  ).all<{
    period: string; special: string; grand: string; first: string;
    extra_sixth: string; source: string; updated_at: string;
  }>();

  const run = await c.env.DB.prepare("SELECT ran_at, ok, detail FROM job_runs WHERE name = 'awards_refresh'")
    .first<{ ran_at: string; ok: number; detail: string | null }>();

  const notify = await c.env.DB.prepare("SELECT ran_at, ok, detail FROM job_runs WHERE name = 'notify'")
    .first<{ ran_at: string; ok: number; detail: string | null }>();

  const { results: gaps } = await c.env.DB.prepare(
    "SELECT DISTINCT i.period FROM invoices i " +
      "LEFT JOIN invoice_awards a ON a.period = i.period " +
      "WHERE i.user_id = ? AND a.period IS NULL ORDER BY i.period DESC",
  )
    .bind(c.get("userId"))
    .all<{ period: string }>();

  return c.json({
    awards: results.map((r) => ({
      ...r,
      first: r.first.split(",").filter(Boolean),
      extra_sixth: r.extra_sixth.split(",").filter(Boolean),
      drawn: drawDate(r.period) <= today,
    })),
    lastFetch: run ? { at: run.ran_at, ok: run.ok === 1, detail: run.detail ?? "" } : null,
    lastNotify: notify ? { at: notify.ran_at, ok: notify.ok === 1, detail: notify.detail ?? "" } : null,
    // 還沒開獎的期別本來就沒有號碼,那不叫缺
    missing: gaps.map((g) => g.period).filter((p) => drawDate(p) <= today),
  });
});

/** 手動重抓。失敗時把原始錯誤一起回去——「抓不到」這三個字誰都修不了 */
invoiceRoutes.post("/awards/refresh", async (c) => {
  try {
    const periods = await refreshAwards(c.env);
    const detail = refreshDetail(periods);
    await recordRun(c.env.DB, "awards_refresh", true, detail);
    const checked = await checkPendingInvoices(c.env);
    // 通知也一起跑。按這顆的人要的是「現在就把該做的做完」,只抓號碼不寄信
    // 的話,信要等到下一個整點才會出去,而使用者只會以為通知壞了。
    const n = await notifyResults(c.env);
    await recordNotify(c.env, n);
    return c.json({ periods: periods.length, checked, detail, sent: n.sent, mailError: n.error });
  } catch (e) {
    const detail = String(e);
    await recordRun(c.env.DB, "awards_refresh", false, detail);
    return c.json({ error: "財政部的中獎號碼抓不到", detail: detail.slice(0, 300) }, 502);
  }
});

/** 號碼字串可以是陣列,也可以是使用者從公告複製下來的一串,逗號頓號空白都算分隔 */
function numberList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map((x) => String(x)) : typeof v === "string" ? v.split(/[,、\s]+/) : [];
  return raw.map((s) => s.trim()).filter(Boolean);
}

/**
 * 管理者手動補一期中獎號碼。
 *
 * RSS 解析壞掉、或財政部把舊期別從 RSS 拿掉時,這是唯一能讓使用者今天就
 * 對到獎的路。存進去的 source='manual',之後自動抓不會蓋掉。
 */
invoiceRoutes.put("/awards/:period", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "forbidden" }, 403);

  const period = c.req.param("period").trim();
  if (!/^\d{4}-\d{2}$/.test(period) || Number(period.slice(5)) % 2 !== 1) {
    return c.json({ error: "期別格式須為 YYYY-MM 且月份為單數月,例如 2026-03" }, 400);
  }

  const b = await c.req.json<Record<string, unknown>>();
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const special = str(b.special);
  const grand = str(b.grand);
  if (!/^\d{8}$/.test(special)) return c.json({ error: "特別獎必須是 8 位數字" }, 400);
  if (!/^\d{8}$/.test(grand)) return c.json({ error: "特獎必須是 8 位數字" }, 400);

  const first = numberList(b.first);
  if (first.length < 1 || first.length > 10) {
    return c.json({ error: "頭獎要 1 到 10 組號碼" }, 400);
  }
  if (!first.every((n) => /^\d{8}$/.test(n))) {
    return c.json({ error: "頭獎每一組都必須是 8 位數字" }, 400);
  }

  const extraSixth = numberList(b.extra_sixth);
  if (extraSixth.length > 5) return c.json({ error: "增開六獎最多 5 組號碼" }, 400);
  if (!extraSixth.every((n) => /^\d{3}$/.test(n))) {
    return c.json({ error: "增開六獎每一組都必須是 3 位數字" }, 400);
  }

  await c.env.DB.prepare(
    "INSERT INTO invoice_awards (period, special, grand, first, extra_sixth, source, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, 'manual', datetime('now')) " +
      "ON CONFLICT(period) DO UPDATE SET special = excluded.special, grand = excluded.grand, " +
      "first = excluded.first, extra_sixth = excluded.extra_sixth, source = 'manual', " +
      "updated_at = excluded.updated_at",
  )
    .bind(period, special, grand, first.join(","), extraSixth.join(","))
    .run();

  // 不動 job_runs:那格記的是「上次去財政部抓的結果」,手動補進來的號碼
  // 寫進去只會讓人以為抓成功了。這一期的來源看 awards[].source 就知道。
  const checked = await checkPendingInvoices(c.env);
  return c.json({ checked });
});
