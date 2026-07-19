export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET?: string;
  ALLOW_REGISTRATION?: string;
};

export type AppContext = {
  Bindings: Env;
  Variables: { userId: number };
};
