import type { Env } from "./env";

// 透過 Brevo(單一寄件人驗證,免網域)寄送交易信件。
export async function sendResetEmail(env: Env, toEmail: string, tempPassword: string): Promise<void> {
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
      subject: "FinTrack 臨時密碼",
      textContent: `您好,\n\n您申請了 FinTrack 的密碼重設。以下是您的臨時密碼:\n\n${tempPassword}\n\n此臨時密碼將於 30 分鐘內有效,登入後請立即至「修改密碼」設定新的密碼。\n\n若您並未申請重設密碼,請忽略本封信件,您的原密碼不會受到任何影響。\n\nFinTrack 團隊`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API 錯誤: ${res.status} ${body}`);
  }
}
