import type { Env } from "./env";
import { PRIZE_LABEL, claimDeadline, drawDate, nextPeriod, periodLabel, type PrizeTier } from "./einvoice";

// 透過 Brevo(單一寄件人驗證,免網域)寄送交易信件。
async function send(env: Env, toEmail: string, subject: string, textContent: string): Promise<void> {
  if (!env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY 未設定");
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: env.MAIL_FROM ?? "qoock3@gmail.com", name: "FinTrack" },
      to: [{ email: toEmail }],
      subject,
      textContent,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API 錯誤: ${res.status} ${body}`);
  }
}

export async function sendResetEmail(env: Env, toEmail: string, tempPassword: string): Promise<void> {
  await send(
    env,
    toEmail,
    "FinTrack 臨時密碼",
    `您好,\n\n您申請了 FinTrack 的密碼重設。以下是您的臨時密碼:\n\n${tempPassword}\n\n此臨時密碼將於 30 分鐘內有效,登入後請立即至「修改密碼」設定新的密碼。\n\n若您並未申請重設密碼,請忽略本封信件,您的原密碼不會受到任何影響。\n\nFinTrack 團隊`,
  );
}

/**
 * 中獎通知。iOS 的網頁推播要求加到主畫面且 16.4 以上,不是每個人都會做,
 * 所以通知走 Email——不管用哪支手機、有沒有裝成 App 都收得到。
 */
export async function sendPrizeEmail(
  env: Env,
  toEmail: string,
  name: string,
  wins: { inv_num: string; prize_tier: string; prize_amount: number; period: string }[],
): Promise<void> {
  const total = wins.reduce((s, w) => s + w.prize_amount, 0);
  const lines = wins.map(
    (w) =>
      `  ${w.inv_num}  ${PRIZE_LABEL[w.prize_tier as PrizeTier] ?? w.prize_tier}  ${w.prize_amount.toLocaleString("en-US")} 元` +
      `  (${periodLabel(w.period)},領獎期限 ${claimDeadline(w.period)})`,
  );
  await send(
    env,
    toEmail,
    `FinTrack 對獎結果:中了 ${total.toLocaleString("en-US")} 元`,
    `${name} 您好,\n\n您掃描的發票對中了 ${wins.length} 張,合計 ${total.toLocaleString("en-US")} 元:\n\n` +
      `${lines.join("\n")}\n\n` +
      `記得帶著中獎的發票正本與身分證件在領獎期限內兌領。\n\n` +
      `本結果由 FinTrack 依財政部公布的中獎號碼自動比對,實際中獎與否請以財政部公告及兌獎櫃台為準。\n\nFinTrack 團隊`,
  );
}

/**
 * 沒中獎也要寄的那一封。
 *
 * 只有中獎才寄的話,沒中獎跟「號碼還沒抓到、根本沒對」在使用者那邊長得
 * 一模一樣,兩種都是收不到信。這封信的用途就是把這兩件事分開。
 */
export async function sendNoPrizeEmail(
  env: Env,
  toEmail: string,
  name: string,
  period: string,
  count: number,
): Promise<void> {
  const next = nextPeriod(period);
  await send(
    env,
    toEmail,
    `FinTrack 對獎結果:${periodLabel(period)}`,
    `${name} 您好,\n\n${periodLabel(period)}這期的 ${count} 張發票都對完了,這期沒有中獎。\n\n` +
      `下一期是${periodLabel(next)},${drawDate(next)} 開獎,號碼一出來就會自動幫您對。\n\n` +
      `FinTrack 團隊`,
  );
}
