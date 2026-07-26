export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET?: string;
  ALLOW_REGISTRATION?: string;
  BREVO_API_KEY?: string;
  MAIL_FROM?: string;
  /** 可核發臨時密碼的帳號 Email。未設定時管理功能一律關閉 */
  ADMIN_EMAIL?: string;
};

export type AppContext = {
  Bindings: Env;
  Variables: { userId: number };
};
