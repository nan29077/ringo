"use server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { authTokens, users } from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { createSession, destroyOtherSessions, getViewer, isSafeNext } from "@/lib/server/auth";
import { hashPassword, passwordProblems, randomToken, sha256, verifyPassword } from "@/lib/server/password";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { appOrigin, rateLimit, rateLimitReset, requestMeta } from "@/lib/server/request";
import { sendTemplateMail } from "@/lib/server/mail";
import { getT } from "@/lib/server/i18n-server";
import type { Lang } from "@/lib/i18n";
import { audit } from "@/lib/server/audit";
import { DEMO_LOGIN_ACCOUNTS, demoLoginEnabled, type DemoRole } from "@/lib/server/demo-login";

const email = z.string().trim().toLowerCase().email().max(200);

async function destinationFor(userId: string, next: string | null) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (isSafeNext(next)) return next!;
  if (u.role === "admin") return "/admin";
  if (u.role === "seller") return "/seller";
  return "/account";
}

export async function login(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ email, password: z.string().min(1).max(200), next: z.string().optional() }).parse(Object.fromEntries(fd));
    const meta = await requestMeta();
    // Per-account limit does not depend on the IP, so rotating/forging addresses cannot bypass it.
    const ipKey = meta.ip ?? "unknown";
    if (
      !rateLimit(`login-email:${input.email}`, 10, 15 * 60000) ||
      !rateLimit(`login:${ipKey}:${input.email}`, 8, 15 * 60000) ||
      (meta.ip !== null && !rateLimit(`login-ip:${meta.ip}`, 40, 15 * 60000))
    ) throw new ActionError("too_many_attempts");
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, input.email));
    const ok = await verifyPassword(input.password, user?.passwordHash);
    if (!user || !ok) throw new ActionError("invalid_credentials");
    if (user.status !== "active") {
      const { t } = await getT();
      throw new ActionError(t("This account is not active. Contact support.", "이용이 제한된 계정입니다. 고객센터에 문의하세요."));
    }
    await createSession(db, user.id);
    // A successful sign-in clears this account's failure counters. The IP-wide counter is deliberately kept:
    // otherwise one valid account could reset it after every burst of guesses against other accounts.
    rateLimitReset(`login-email:${input.email}`, `login:${ipKey}:${input.email}`);
    if (user.role === "admin") await audit(db, { user, seller: null, sessionId: "" }, "auth.login");
    return { ok: true, redirect: await destinationFor(user.id, input.next ?? null) };
  });
}

export async function signup(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({
      name: z.string().trim().min(1).max(80),
      email,
      password: z.string(),
      terms: z.literal("on"),
      marketing: z.string().optional(),
      next: z.string().optional(),
    }).parse(Object.fromEntries(fd));
    if (passwordProblems(input.password)) throw new ActionError("weak_password");
    const meta = await requestMeta();
    if (!rateLimit(`signup:${meta.ip ?? "unknown"}`, meta.ip ? 10 : 60, 60 * 60000)) throw new ActionError("too_many_attempts");
    const db = await getDb();
    const { lang } = await getT();
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (exists) throw new ActionError("email_taken");
    const [user] = await db.insert(users).values({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: "buyer",
      locale: lang,
      marketingOptIn: input.marketing === "on",
    }).returning();
    await sendVerification(user.id, user.email, user.name, user.locale);
    await createSession(db, user.id);
    return { ok: true, redirect: isSafeNext(input.next) ? input.next : "/account" };
  });
}

async function sendVerification(userId: string, to: string, name: string, locale: Lang) {
  const db = await getDb();
  const token = randomToken();
  await db.insert(authTokens).values({ userId, type: "verify_email", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3 * 86400000) });
  const origin = await appOrigin();
  await sendTemplateMail(db, to, "verify_email", locale, { name, url: `${origin}/verify-email?token=${token}` });
}

export async function resendVerification(): Promise<ActionResult> {
  return run(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new ActionError("forbidden");
    if (!rateLimit(`verify:${viewer.user.id}`, 3, 60 * 60000)) throw new ActionError("too_many_attempts");
    await sendVerification(viewer.user.id, viewer.user.email, viewer.user.name, viewer.user.locale);
    const { t } = await getT();
    return { ok: true, message: t("Verification email sent.", "인증 메일을 보냈습니다.") };
  });
}

export async function requestPasswordReset(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { email: addr } = z.object({ email }).parse(Object.fromEntries(fd));
    const meta = await requestMeta();
    if (!rateLimit(`reset-email:${addr}`, 3, 60 * 60000) || !rateLimit(`reset:${meta.ip ?? "unknown"}`, meta.ip ? 5 : 30, 60 * 60000)) throw new ActionError("too_many_attempts");
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, addr));
    if (user && user.status === "active") {
      const token = randomToken();
      await db.insert(authTokens).values({ userId: user.id, type: "reset_password", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600000) });
      const origin = await appOrigin();
      await sendTemplateMail(db, user.email, "reset_password", user.locale, { name: user.name, url: `${origin}/reset-password?token=${token}` });
    }
    const { t } = await getT();
    return { ok: true, message: t("If an account exists, we sent a reset link.", "가입된 이메일이라면 재설정 링크를 보냈습니다.") };
  });
}

export async function resetPassword(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ token: z.string().min(10), password: z.string() }).parse(Object.fromEntries(fd));
    if (passwordProblems(input.password)) throw new ActionError("weak_password");
    const db = await getDb();
    const [row] = await db.select().from(authTokens).where(and(eq(authTokens.tokenHash, sha256(input.token)), eq(authTokens.type, "reset_password"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
    if (!row) throw new ActionError("token_invalid");
    await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
    await db.update(users).set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() }).where(eq(users.id, row.userId));
    await destroyOtherSessions(row.userId);
    await createSession(db, row.userId);
    return { ok: true, redirect: await destinationFor(row.userId, null) };
  });
}

/** "verified" (just now), "already" (link already used — the address is confirmed) or "invalid". */
export async function verifyEmailToken(token: string): Promise<"verified" | "already" | "invalid"> {
  const db = await getDb();
  const hash = sha256(token);
  const [row] = await db.select().from(authTokens).where(and(eq(authTokens.tokenHash, hash), eq(authTokens.type, "verify_email")));
  if (!row) return "invalid";
  if (row.usedAt) {
    // Clicking the same link twice (mail clients prefetch links) is not an error.
    const [u] = await db.select({ verified: users.emailVerifiedAt }).from(users).where(eq(users.id, row.userId));
    return u?.verified ? "already" : "invalid";
  }
  if (row.expiresAt.getTime() <= Date.now()) return "invalid";
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  return "verified";
}

/** Test login button (development / RINGO_DEMO_LOGIN=true only). Signs in as a seeded demo account without a password. */
export async function demoLogin(role: DemoRole, next?: string): Promise<ActionResult> {
  return run(async () => {
    const { t } = await getT();
    if (!demoLoginEnabled() || !(role in DEMO_LOGIN_ACCOUNTS)) throw new ActionError("forbidden");
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, DEMO_LOGIN_ACCOUNTS[role]));
    if (!user || user.status !== "active") {
      throw new ActionError(t("The test account does not exist. Reset the local database (.data) to recreate demo data.", "테스트 계정이 없습니다. 로컬 DB(.data 폴더)를 초기화하면 예시 데이터가 다시 만들어집니다."));
    }
    await createSession(db, user.id);
    const fallback = role === "admin" ? "/admin" : role === "seller" ? "/seller" : "/account";
    return { ok: true, redirect: role === "buyer" && isSafeNext(next) ? next! : fallback };
  });
}
