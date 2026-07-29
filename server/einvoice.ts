// 電子發票證明聯 QR Code 的解析,以及統一發票對獎。
//
// 為什麼是掃 QR 而不是串接財政部載具 API:載具 API(carrierInvChk)要帶
// appID,而申請資格已限縮成通過 ISO 27001 的企業,個人拿不到。紙本發票
// 上的兩個 QR Code 本身就含發票號碼、日期、金額與品項,不需要任何授權。
//
// 解析一律在後端做:前端只負責把掃到的字串原封不動送上來,金額與號碼由
// 這裡自己從字串裡取,前端改不動。

import type { Env } from "./env";
import { periodOf, type PrizeTier } from "../shared/invoice";

export { PRIZE_LABEL, claimDeadline, drawDate, periodLabel, periodOf } from "../shared/invoice";
export type { PrizeTier } from "../shared/invoice";

/** 左側 QR 的固定表頭長度,其後才是以 : 分隔的品項區 */
const HEADER_LEN = 77;

/** 財政部稅務入口網公布的中獎號碼,公開 RSS,不需金鑰 */
const AWARDS_URL = "https://invoice.etax.nat.gov.tw/invoice.xml";

export type InvoiceItem = { name: string; qty: number; price: number };

export type ParsedInvoice = {
  invNum: string;
  /** 西元日期 YYYY-MM-DD */
  date: string;
  /** 所屬期別,以單數月表示。2026-07 = 115 年 7-8 月期 */
  period: string;
  randomCode: string;
  /** 未稅銷售額 */
  salesAmount: number;
  /** 含稅總計,記帳用這個 */
  totalAmount: number;
  buyerBan: string;
  sellerBan: string;
  items: InvoiceItem[];
  /** 這張發票總共幾個品目。大於 items.length 代表明細在右側 QR 裡 */
  totalItemCount: number;
  /** 品名的字元編碼,右側 QR 續篇要沿用同一套 */
  encoding: string;
};

// ── QR Code 解析 ──────────────────────────────────────
//
// 左側 QR 前 77 碼為固定寬度欄位(規格見「電子發票證明聯一維及二維條碼
// 規格說明」):
//   0-9   發票字軌號碼      10 碼
//   10-16 開立日期(民國)     7 碼 YYYMMDD
//   17-20 隨機碼             4 碼
//   21-28 銷售額(未稅)       8 碼 十六進位
//   29-36 總計額(含稅)       8 碼 十六進位
//   37-44 買方統編           8 碼
//   45-52 賣方統編           8 碼
//   53-76 加密驗證資訊      24 碼
// 第 77 碼之後為 :營業人自訂資料:本碼品目數:總品目數:中文編碼:品名:數量:單價...

/** 民國 YYYMMDD 轉西元 YYYY-MM-DD,格式不合回 null */
function rocToIso(roc: string): string | null {
  if (!/^\d{7}$/.test(roc)) return null;
  const year = Number(roc.slice(0, 3)) + 1911;
  const month = Number(roc.slice(3, 5));
  const day = Number(roc.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 品名的字元編碼。0=Big5、1=UTF-8、2=Base64。
 *
 * Big5 沒有處理:掃碼器交給我們的已經是解過一次的字串,原始位元組早就
 * 丟失,硬猜只會得到亂碼。這種發票就不帶品名,讓使用者自己命名。
 */
function decodeName(raw: string, encoding: string): string | null {
  if (encoding === "2") {
    try {
      const bytes = Uint8Array.from(atob(raw), (ch) => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }
  if (encoding === "0") return null;
  return raw;
}

/** 把 :品名:數量:單價 三個一組的區段拆成品項 */
function readItems(parts: string[], encoding: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const name = decodeName(parts[i], encoding);
    if (!name) continue;
    const qty = Number(parts[i + 1]);
    const price = Number(parts[i + 2]);
    items.push({
      name: name.trim().slice(0, 60),
      qty: Number.isFinite(qty) ? qty : 0,
      price: Number.isFinite(price) ? price : 0,
    });
  }
  return items;
}

/**
 * 解析左側 QR。右側 QR(以 ** 開頭)只是品項的續篇,單獨掃沒有意義,
 * 要透過 mergeRightQr() 併進來。
 */
export function parseInvoiceQr(raw: string): ParsedInvoice | null {
  const s = raw.trim();
  if (s.length < HEADER_LEN) return null;

  const invNum = s.slice(0, 10).toUpperCase();
  if (!/^[A-Z]{2}\d{8}$/.test(invNum)) return null;

  const date = rocToIso(s.slice(10, 17));
  if (!date) return null;

  const randomCode = s.slice(17, 21);
  if (!/^\d{4}$/.test(randomCode)) return null;

  // 金額為十六進位。負數(折讓)不會出現在證明聯上,解不出來就當這張無效
  const salesAmount = parseInt(s.slice(21, 29), 16);
  const totalAmount = parseInt(s.slice(29, 37), 16);
  if (!Number.isFinite(salesAmount) || !Number.isFinite(totalAmount)) return null;

  const parsed: ParsedInvoice = {
    invNum,
    date,
    period: periodOf(date),
    randomCode,
    salesAmount,
    totalAmount,
    buyerBan: s.slice(37, 45),
    sellerBan: s.slice(45, 53),
    items: [],
    totalItemCount: 0,
    encoding: "1",
  };

  // 品項區是選配的,壞掉不該讓整張發票掃不進來
  const rest = s.slice(HEADER_LEN);
  if (rest.startsWith(":")) {
    const parts = rest.slice(1).split(":");
    parsed.totalItemCount = Number(parts[2]) || 0;
    parsed.encoding = parts[3] ?? "1";
    parsed.items = readItems(parts.slice(4), parsed.encoding);
  }
  return parsed;
}

/** 右側 QR 以 ** 開頭,後面接續左側沒放完的品項 */
export function mergeRightQr(parsed: ParsedInvoice, raw: string): void {
  const s = raw.trim();
  if (!s.startsWith("**")) return;
  const parts = s.slice(2).replace(/^:/, "").split(":");
  parsed.items.push(...readItems(parts, parsed.encoding));
}

// ── 對獎 ──────────────────────────────────────────────

export type Award = {
  period: string;
  special: string;
  grand: string;
  first: string[];
  extraSixth: string[];
};

/** 頭獎號碼由後往前比,對中越多碼獎越大 */
const SUFFIX_TIERS: { digits: number; tier: PrizeTier; amount: number }[] = [
  { digits: 8, tier: "first", amount: 200_000 },
  { digits: 7, tier: "second", amount: 40_000 },
  { digits: 6, tier: "third", amount: 10_000 },
  { digits: 5, tier: "fourth", amount: 4_000 },
  { digits: 4, tier: "fifth", amount: 1_000 },
  { digits: 3, tier: "sixth", amount: 200 },
];

/** 比對單一張發票。invNum 可帶字軌英文,只取後 8 碼數字 */
export function checkPrize(invNum: string, award: Award): { tier: PrizeTier; amount: number } {
  const n = invNum.slice(-8);
  if (n === award.special) return { tier: "special", amount: 10_000_000 };
  if (n === award.grand) return { tier: "grand", amount: 2_000_000 };

  let best: { tier: PrizeTier; amount: number } = { tier: "none", amount: 0 };
  for (const win of award.first) {
    for (const t of SUFFIX_TIERS) {
      if (n.slice(-t.digits) === win.slice(-t.digits)) {
        if (t.amount > best.amount) best = { tier: t.tier, amount: t.amount };
        break; // 同一組號碼只算最高的那一獎
      }
    }
  }
  for (const win of award.extraSixth) {
    if (n.slice(-3) === win && best.amount < 200) best = { tier: "sixth_extra", amount: 200 };
  }
  return best;
}

// ── 中獎號碼來源 ──────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * 去掉 HTML 標籤,標籤位置補一個空白免得數字黏在一起。
 *
 * description 有時是跳脫過的 HTML、有時整段包在 CDATA 裡,兩種都會出現,
 * 所以先把 CDATA 拆掉再解跳脫,一條路徑吃兩種格式。
 */
function toText(html: string): string {
  const raw = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const EIGHT = /(?<!\d)\d{8}(?!\d)/g;
const THREE = /(?<!\d)\d{3}(?!\d)/g;

/**
 * 去掉獎金金額再找號碼。
 *
 * 「增開六獎:200元」的 200 自己就是三位數,不先拿掉就會被當成中獎號碼,
 * 於是每一期的尾數 200 都會被誤報中獎——這是寧可漏報也不能發生的錯。
 * 八位數的區段照樣濾一次:金額寫成 12345678 元的機率很低,但濾掉不花什麼。
 */
function stripAmounts(text: string): string {
  return text.replace(/[\d,]+\s*(?:萬|億)\s*元?|[\d,]+\s*元/g, " ");
}

/** 從關鍵字往後切到下一個關鍵字為止 */
function segment(text: string, from: string, until: string[]): string {
  const start = text.indexOf(from);
  if (start < 0) return "";
  const after = text.slice(start + from.length);
  let end = after.length;
  for (const u of until) {
    const i = after.indexOf(u);
    if (i >= 0 && i < end) end = i;
  }
  return stripAmounts(after.slice(0, end));
}

/**
 * 解析財政部的中獎號碼 RSS。
 *
 * 這份 XML 的 description 是一段 HTML,版面偶爾會調整,所以不去假設標籤
 * 結構,只認「特別獎/特獎/頭獎/增開六獎」這幾個字,再從各自的區段裡撈
 * 數字。撈不到完整的一期就整期跳過 —— 少一期只是晚點對獎,寫進半套的
 * 號碼卻會讓人以為自己沒中。
 */
export function parseAwardsXml(xml: string): Award[] {
  const awards = new Map<string, Award>();
  for (const block of xml.split(/<item[\s/>]/i).slice(1)) {
    const title = toText(/<title>([\s\S]*?)<\/title>/i.exec(block)?.[1] ?? "");
    const desc = toText(/<description>([\s\S]*?)<\/description>/i.exec(block)?.[1] ?? "");

    // 標題如「114年11-12月中獎號碼單」,也可能只寫單一個月份。
    // 只取區間的前一個月,periodOf() 會再把偶數月正規化回單數月。
    const m = /(\d{2,3})\s*年\s*(\d{1,2})\s*(?:[-~－–至]\s*\d{1,2}\s*)?月/.exec(title);
    if (!m) continue;
    const year = Number(m[1]) + 1911;
    const month = Number(m[2]);
    if (month < 1 || month > 12) continue;
    const period = periodOf(`${year}-${String(month).padStart(2, "0")}-01`);

    const special = segment(desc, "特別獎", ["特獎", "頭獎"]).match(EIGHT)?.[0] ?? "";
    const grand = segment(desc, "特獎", ["頭獎"]).match(EIGHT)?.[0] ?? "";
    const first = segment(desc, "頭獎", ["增開"]).match(EIGHT) ?? [];
    const extraSixth = segment(desc, "增開", []).match(THREE) ?? [];

    if (!special || !grand || first.length === 0) continue;
    // 同一期出現在兩個 item(改版重貼)時以先出現的為準,RSS 是新的排前面
    if (awards.has(period)) continue;
    awards.set(period, {
      period,
      special,
      grand,
      first: [...new Set(first)],
      extraSixth: [...new Set(extraSixth)],
    });
  }
  return [...awards.values()];
}

/**
 * 抓一次中獎號碼並寫進 invoice_awards,回傳實際寫入的期別。
 *
 * 回期別而不是回筆數,是因為呼叫端要把「這次到底拿到哪幾期」記進 job_runs
 * ——只知道「成功寫了 3 期」還是回答不了「那我那期呢」。
 */
export async function refreshAwards(env: Env): Promise<string[]> {
  const res = await fetch(AWARDS_URL);
  if (!res.ok) throw new Error(`中獎號碼來源回應 ${res.status}`);
  const awards = parseAwardsXml(await res.text());
  if (awards.length === 0) throw new Error("中獎號碼解析不到任何一期,RSS 版面可能已經改了");

  await env.DB.batch(
    awards.map((a) =>
      env.DB.prepare(
        "INSERT INTO invoice_awards (period, special, grand, first, extra_sixth, source, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, 'rss', datetime('now')) " +
          "ON CONFLICT(period) DO UPDATE SET special = excluded.special, grand = excluded.grand, " +
          "first = excluded.first, extra_sixth = excluded.extra_sixth, updated_at = excluded.updated_at " +
          // 人工補的那期不讓 RSS 蓋回去:會需要人工補,就表示這支解析器對那期
          // 是靠不住的,再抓一次也沒有比較可信。要改回自動抓就把那列刪掉。
          "WHERE invoice_awards.source <> 'manual'",
      ).bind(a.period, a.special, a.grand, a.first.join(","), a.extraSixth.join(",")),
    ),
  );
  return awards.map((a) => a.period);
}

/** 下一期。112-11 的下一期跨年到 113-01 */
export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m >= 11 ? `${y + 1}-01` : `${y}-${String(m + 2).padStart(2, "0")}`;
}

export function rowToAward(r: {
  period: string; special: string; grand: string; first: string; extra_sixth: string;
}): Award {
  return {
    period: r.period,
    special: r.special,
    grand: r.grand,
    first: r.first ? r.first.split(",") : [],
    extraSixth: r.extra_sixth ? r.extra_sixth.split(",") : [],
  };
}
