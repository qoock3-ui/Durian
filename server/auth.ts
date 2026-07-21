import { Hono } from "hono";
import type { AppContext, Env } from "./env";
import type { MiddlewareHandler } from "hono";
import { sendResetEmail } from "./email";

const TEMP_PASSWORD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const RESET_TTL_MS = 30 * 60 * 1000;

function generateTempPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length];
  return out;
}

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;
const JWT_TTL_SECONDS = 7 * 24 * 3600;

// 未設定 JWT_SECRET 時的開發用預設值;正式環境請 `wrangler secret put JWT_SECRET`
const DEV_SECRET = "fintrack-dev-secret-change-me";

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, , saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const expected = b64urlDecode(hashB64);
  const actual = await pbkdf2(password, b64urlDecode(saltB64));
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signJwt(userId: number, env: Env): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(enc.encode(JSON.stringify({ sub: userId, iat: now, exp: now + JWT_TTL_SECONDS })));
  const key = await hmacKey(env.JWT_SECRET ?? DEV_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function verifyJwt(token: string, env: Env): Promise<number | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const key = await hmacKey(env.JWT_SECRET ?? DEV_SECRET);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlDecode(parts[2]) as BufferSource,
    enc.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (typeof payload.sub !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = token ? await verifyJwt(token, c.env) : null;
  if (userId === null) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", userId);
  await next();
};

export const authRoutes = new Hono<AppContext>();

authRoutes.post("/register", async (c) => {
  if (c.env.ALLOW_REGISTRATION === "false") return c.json({ error: "registration_disabled" }, 403);
  const body = await c.req.json<{ email?: string; name?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const password = body.password ?? "";
  if (!email || !name || password.length < 8) {
    return c.json({ error: "email、name 為必填,密碼至少 8 碼" }, 400);
  }
  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) return c.json({ error: "email_taken" }, 409);
  const hash = await hashPassword(password);
  const row = await c.env.DB.prepare(
    "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?) RETURNING id",
  )
    .bind(email, name, hash)
    .first<{ id: number }>();
  const token = await signJwt(row!.id, c.env);
  return c.json({ token, user: { id: row!.id, email, name } });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const user = await c.env.DB.prepare(
    "SELECT id, email, name, password_hash, reset_hash, reset_expires FROM users WHERE email = ?",
  )
    .bind(email)
    .first<{
      id: number;
      email: string;
      name: string;
      password_hash: string;
      reset_hash: string | null;
      reset_expires: string | null;
    }>();
  if (!user) return c.json({ error: "帳號或密碼錯誤" }, 401);

  let authenticated = await verifyPassword(password, user.password_hash);
  if (
    !authenticated &&
    user.reset_hash &&
    user.reset_expires &&
    new Date(user.reset_expires).getTime() > Date.now()
  ) {
    authenticated = await verifyPassword(password, user.reset_hash);
  }
  if (!authenticated) return c.json({ error: "帳號或密碼錯誤" }, 401);

  const token = await signJwt(user.id, c.env);
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

authRoutes.post("/change-password", requireAuth, async (c) => {
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>();
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 8) {
    return c.json({ error: "新密碼至少 8 碼" }, 400);
  }
  const userId = c.get("userId");
  const user = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(userId)
    .first<{ password_hash: string }>();
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    return c.json({ error: "目前密碼錯誤" }, 401);
  }
  const newHash = await hashPassword(newPassword);
  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, reset_hash = NULL, reset_expires = NULL WHERE id = ?",
  )
    .bind(newHash, userId)
    .run();
  return c.json({ ok: true });
});

authRoutes.post("/forgot-password", async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email) return c.json({ ok: true });

  const user = await c.env.DB.prepare("SELECT id, email, reset_expires FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string; reset_expires: string | null }>();

  if (user) {
    const now = Date.now();
    const recentlyIssued = user.reset_expires && new Date(user.reset_expires).getTime() - now > 28 * 60 * 1000;
    if (!recentlyIssued) {
      try {
        const tempPassword = generateTempPassword();
        const resetHash = await hashPassword(tempPassword);
        const resetExpires = new Date(now + RESET_TTL_MS).toISOString();
        await c.env.DB.prepare("UPDATE users SET reset_hash = ?, reset_expires = ? WHERE id = ?")
          .bind(resetHash, resetExpires, user.id)
          .run();
        await sendResetEmail(c.env, user.email, tempPassword);
      } catch (err) {
        console.log("forgot-password email failed:", err);
      }
    }
  }

  return c.json({ ok: true });
});
