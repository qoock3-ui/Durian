import type { Env } from "./env";

export async function sendResetEmail(env: Env, toEmail: string, tempPassword: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY 未設定");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM ?? "onboarding@resend.dev",
      to: [toEmail],
      subject: "FinTrack 臨時密碼",
      text: `您好,\n\n您申請了 FinTrack 的密碼重設。以下是您的臨時密碼:\n\n${tempPassword}\n\n此臨時密碼將於 30 分鐘內有效,登入後請立即至「修改密碼」設定新的密碼。\n\n若您並未申請重設密碼,請忽略本封信件,您的原密碼不會受到任何影響。\n\nFinTrack 團隊`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API 錯誤: ${res.status} ${body}`);
  }
}
