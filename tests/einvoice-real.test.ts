import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPrize, claimDeadline, drawDate, parseAwardsXml, periodOf } from "../server/einvoice";

// tests/einvoice.test.ts 的 fixture 是照公告文案自己組的,守的是自家的解析錯誤。
// 這一份不一樣:它是 https://invoice.etax.nat.gov.tw/invoice.xml 在 2026-08-02
// 當天的原始回應,一個字都沒動。
//
// 留著它的理由是這支解析器曾經對真實資料整份解不出來,而手寫的 fixture 照樣全綠:
// 真實 RSS 的標題是 <![CDATA[ 115年 03~04月 ]]>,整串裡面一個 '>' 都沒有,於是
// 去 HTML 標籤的 <[^>]*> 從頭吃到尾,把標題整個刪掉,期別認不出來就整期跳過。
// 六期全跳過、一筆號碼都沒寫進 D1,發票就一直停在「等待對獎」。
//
// 所以財政部改版面時,要壞就讓它在這裡壞。
const REAL_XML = readFileSync(
  fileURLToPath(new URL("./fixtures/invoice-awards-real.xml", import.meta.url)),
  "utf8",
);

const awards = parseAwardsXml(REAL_XML);

/** 那一期的獎號,拿不到就讓測試自己講是哪一期不見了 */
function award(period: string) {
  const a = awards.find((x) => x.period === period);
  if (!a) throw new Error(`真實 RSS 裡沒解出 ${period},解出來的是:${awards.map((x) => x.period).join(", ")}`);
  return a;
}

describe("財政部 RSS 的真實回應", () => {
  it("六期一期都不漏,而且順序照 RSS 由新到舊", () => {
    expect(awards.map((a) => a.period)).toEqual([
      "2026-05", "2026-03", "2026-01", "2025-11", "2025-09", "2025-07",
    ]);
  });

  it("CDATA 包起來的標題不會被當成 HTML 標籤吃掉", () => {
    // 這就是當初的死因。<![CDATA[ 115年 03~04月 ]]> 認得出 03,期別才成立
    expect(REAL_XML).toContain("<![CDATA[ 115年 03~04月 ]]>");
    expect(award("2026-03")).toBeTruthy();
  });

  it("115 年 3-4 月的號碼與公告一字不差", () => {
    const a = award("2026-03");
    expect(a.special).toBe("19531471");
    expect(a.grand).toBe("85941329");
    expect(a.first).toEqual(["07225810", "20231230", "83518781"]);
  });

  it("每一期都是完整的一期,沒有撈到雜訊", () => {
    // 先確認真的有東西可以檢查:解不出來時迴圈會空轉,那是假的綠燈
    expect(awards).toHaveLength(6);
    for (const a of awards) {
      expect(a.special).toMatch(/^\d{8}$/);
      expect(a.grand).toMatch(/^\d{8}$/);
      expect(a.first).toHaveLength(3);
      for (const f of a.first) expect(f).toMatch(/^\d{8}$/);
    }
  });

  it("增開六獎是空的,因為它已經停辦了", () => {
    // 增開六獎自 111 年 1-2 月期起停辦,改為增開雲端發票專屬獎,所以 RSS 沒有
    // 這一欄。空的是對的,不是漏抓。六獎(末三碼)不受影響,它是從頭獎推出來的。
    expect(awards).toHaveLength(6);
    for (const a of awards) expect(a.extraSixth).toEqual([]);
  });

  it("六獎是頭獎的末三碼,三組都要認", () => {
    const a = award("2026-03");   // 頭獎 07225810、20231230、83518781
    expect(checkPrize("AB11111810", a)).toEqual({ tier: "sixth", amount: 200 });
    expect(checkPrize("AB22222230", a)).toEqual({ tier: "sixth", amount: 200 });
    expect(checkPrize("AB33333781", a)).toEqual({ tier: "sixth", amount: 200 });
    expect(checkPrize("AB44444999", a)).toEqual({ tier: "none", amount: 0 });
  });

  it("開獎日算出來的日期就是 RSS 自己的發布日", () => {
    // pubDate: Mon, 25 May 2026 —— 兩邊各自算出同一天,期別換算才算真的對上
    expect(drawDate("2026-03")).toBe("2026-05-25");
    expect(drawDate("2026-05")).toBe("2026-07-25");
    expect(claimDeadline("2026-03")).toBe("2026-09-05");
  });

  it("115 年 3-4 月開的發票,期別對得上那一期的獎號", () => {
    expect(periodOf("2026-03-01")).toBe("2026-03");
    expect(periodOf("2026-04-30")).toBe("2026-03");
  });

  it("拿真實號碼由後往前逐碼放寬", () => {
    const a = award("2026-03");
    // 頭獎之一 = 07225810
    expect(checkPrize("AB19531471", a)).toEqual({ tier: "special", amount: 10_000_000 });
    expect(checkPrize("AB85941329", a)).toEqual({ tier: "grand", amount: 2_000_000 });
    expect(checkPrize("AB07225810", a)).toEqual({ tier: "first", amount: 200_000 });
    expect(checkPrize("AB97225810", a)).toEqual({ tier: "second", amount: 40_000 });
    expect(checkPrize("AB99225810", a)).toEqual({ tier: "third", amount: 10_000 });
    expect(checkPrize("AB99925810", a)).toEqual({ tier: "fourth", amount: 4_000 });
    expect(checkPrize("AB99995810", a)).toEqual({ tier: "fifth", amount: 1_000 });
    expect(checkPrize("AB99999810", a)).toEqual({ tier: "sixth", amount: 200 });
    expect(checkPrize("AB12345678", a)).toEqual({ tier: "none", amount: 0 });
  });
});
