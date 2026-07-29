import { describe, expect, it } from "vitest";
import {
  checkPrize, claimDeadline, drawDate, nextPeriod, parseAwardsXml, periodOf, type Award,
} from "../server/einvoice";

// 財政部的 RSS 沒有正式規格,版面也改過幾次,所以這裡的 fixture 是照公告的
// 文案自己組的:號碼以頓號分隔、獎金寫在號碼旁邊。真實回應長什麼樣沒辦法在
// 這裡驗證,這些測試守的是「解析器不會把獎金當成中獎號碼」這類自家的錯。

function item(title: string, desc: string): string {
  return `<item><title>${title}</title><link>https://invoice.etax.nat.gov.tw/</link>` +
    `<description>${desc}</description></item>`;
}

/** 跳脫過的 HTML,description 最常見的樣子 */
function escaped(period: string, special: string, grand: string, first: string[], extra: string[]): string {
  return [
    `&lt;p&gt;${period}統一發票中獎號碼&lt;/p&gt;`,
    `&lt;p&gt;特別獎:${special}&lt;/p&gt;&lt;p&gt;1000萬元&lt;/p&gt;`,
    `&lt;p&gt;特獎:${grand}&lt;/p&gt;&lt;p&gt;200萬元&lt;/p&gt;`,
    `&lt;p&gt;頭獎:${first.join("、")}&lt;/p&gt;`,
    `&lt;p&gt;同期統一發票收執聯8位數號碼與上列號碼相同者獎金20萬元&lt;/p&gt;`,
    `&lt;p&gt;增開六獎:${extra.join("、")}&lt;/p&gt;`,
    `&lt;p&gt;同期統一發票收執聯末三位數號碼與上列號碼相同者獎金200元&lt;/p&gt;`,
  ].join("");
}

function feed(...items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>` +
    `<title>統一發票中獎號碼</title>${items.join("")}</channel></rss>`;
}

const FIRST = ["12345678", "23456789", "34567891"];

describe("parseAwardsXml", () => {
  const xml = feed(
    item("115年05-06月統一發票中獎號碼單", escaped("115年5-6月", "70223851", "60313770", FIRST, ["573", "961"])),
    item("115年03-04月統一發票中獎號碼單", escaped("115年3-4月", "11223344", "55667788", ["99887766"], ["408"])),
  );

  it("多個 item 各自成一期", () => {
    const awards = parseAwardsXml(xml);
    expect(awards.map((a) => a.period)).toEqual(["2026-05", "2026-03"]);
    expect(awards[0]).toMatchObject({
      special: "70223851",
      grand: "60313770",
      first: FIRST,
      extraSixth: ["573", "961"],
    });
    expect(awards[1].first).toEqual(["99887766"]);
  });

  it("增開六獎不會把獎金 200 元當成中獎號碼", () => {
    const [award] = parseAwardsXml(xml);
    expect(award.extraSixth).not.toContain("200");
    expect(award.extraSixth).toEqual(["573", "961"]);
  });

  it("頭獎不會撿到 1000萬元、200萬元 這類金額", () => {
    const [award] = parseAwardsXml(xml);
    expect(award.first).toEqual(FIRST);
    expect(award.special).toBe("70223851");
  });

  it("description 包在 CDATA 裡也讀得到", () => {
    const desc =
      `<![CDATA[<p>特別獎:70223851（1000萬元）</p>` +
      `<p>特獎:60313770（200萬元）</p>` +
      `<p>頭獎:${FIRST.join("、")},獎金20萬元</p>` +
      `<p>增開六獎:573、961,獎金200元</p>]]>`;
    const [award] = parseAwardsXml(feed(item("115年05-06月中獎號碼單", desc)));
    expect(award).toMatchObject({
      period: "2026-05",
      special: "70223851",
      grand: "60313770",
      first: FIRST,
      extraSixth: ["573", "961"],
    });
  });

  it("只有一個 item 也解得出來", () => {
    const awards = parseAwardsXml(
      feed(item("115年05-06月中獎號碼單", escaped("", "70223851", "60313770", FIRST, ["573"]))),
    );
    expect(awards).toHaveLength(1);
    expect(awards[0].period).toBe("2026-05");
  });

  it.each([
    ["115年01-02月統一發票中獎號碼單", "2026-01"],
    ["114年11-12月統一發票中獎號碼單", "2025-11"],
    ["115年3月統一發票中獎號碼單", "2026-03"],
    ["統一發票 115 年 7-8 月中獎號碼", "2026-07"],
  ])("標題 %s 對應期別 %s", (title, period) => {
    const awards = parseAwardsXml(feed(item(title, escaped("", "70223851", "60313770", FIRST, []))));
    expect(awards.map((a) => a.period)).toEqual([period]);
  });

  it("缺特獎的那一期整期跳過,不寫半套號碼", () => {
    const half =
      `&lt;p&gt;特別獎:70223851&lt;/p&gt;&lt;p&gt;1000萬元&lt;/p&gt;` +
      `&lt;p&gt;頭獎:${FIRST.join("、")}&lt;/p&gt;&lt;p&gt;獎金20萬元&lt;/p&gt;`;
    const awards = parseAwardsXml(
      feed(
        item("115年05-06月中獎號碼單", half),
        item("115年03-04月中獎號碼單", escaped("", "11223344", "55667788", ["99887766"], [])),
      ),
    );
    expect(awards.map((a) => a.period)).toEqual(["2026-03"]);
  });

  it("認不出期別或整份 XML 壞掉時回空陣列,不亂猜", () => {
    expect(parseAwardsXml("")).toEqual([]);
    expect(parseAwardsXml(feed(item("中獎號碼單", escaped("", "70223851", "60313770", FIRST, []))))).toEqual([]);
  });
});

describe("checkPrize", () => {
  // 增開六獎故意放一組與頭獎末三碼相同的 678,用來確認兩邊都中時取大的
  const award: Award = {
    period: "2026-05",
    special: "70223851",
    grand: "60313770",
    first: FIRST,
    extraSixth: ["573", "678"],
  };

  it.each([
    ["AB70223851", "special", 10_000_000],
    ["CD60313770", "grand", 2_000_000],
    ["EF12345678", "first", 200_000],
    ["EF92345678", "second", 40_000],
    ["EF00345678", "third", 10_000],
    ["EF00045678", "fourth", 4_000],
    ["EF00005678", "fifth", 1_000],
    ["EF00000678", "sixth", 200],
    ["EF00000573", "sixth_extra", 200],
    ["EF00000000", "none", 0],
  ])("%s 中 %s", (invNum, tier, amount) => {
    expect(checkPrize(invNum, award)).toEqual({ tier, amount });
  });

  it("同時對中頭獎末幾碼與增開六獎時取大的那一個", () => {
    // 末四碼 5678 中五獎 1000 元,末三碼 678 也在增開六獎裡,只能算 1000
    expect(checkPrize("EF00005678", award)).toEqual({ tier: "fifth", amount: 1_000 });
  });

  it("號碼帶不帶字軌都一樣", () => {
    expect(checkPrize("12345678", award)).toEqual({ tier: "first", amount: 200_000 });
  });
});

describe("期別換算", () => {
  it("雙月一期,一律以單數月當 key", () => {
    expect(periodOf("2026-03-01")).toBe("2026-03");
    expect(periodOf("2026-04-30")).toBe("2026-03");
    expect(periodOf("2026-12-31")).toBe("2026-11");
  });

  it("115 年 3-4 月在 2026-05-25 開獎,2026-09-05 截止兌領", () => {
    expect(drawDate("2026-03")).toBe("2026-05-25");
    expect(claimDeadline("2026-03")).toBe("2026-09-05");
  });

  it("跨年的期別不會算錯", () => {
    expect(drawDate("2026-11")).toBe("2027-01-25");
    expect(claimDeadline("2026-11")).toBe("2027-05-05");
    expect(nextPeriod("2026-11")).toBe("2027-01");
    expect(nextPeriod("2026-03")).toBe("2026-05");
  });
});
