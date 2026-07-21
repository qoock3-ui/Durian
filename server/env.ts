export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET?: string;
  ALLOW_REGISTRATION?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
};

export type AppContext = {
  Bindings: Env;
  Variables: { userId: number };
};
