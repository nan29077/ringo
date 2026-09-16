import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { sessions, sellers, users } from "@/db/schema";
import { getDb, type DB } from "./db";
import { randomToken, sha256 } from "./password";
import { requestMeta } from "./request";

const SESSION_DAYS = 30;
const secureCookies = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
export const SESSION_COOKIE = secureCookies ? "__Host-ringo_session" : "ringo_session";

export type SessionUser = typeof users.$inferSelect;
export type SellerProfile = typeof sellers.$inferSelect;
export type Viewer = { user: SessionUser; seller: SellerProfile | null; sessionId: string };

export async function createSession(db: DB, userId: string) {
  const token = randomToken(32);
  const meta = await requestMeta();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function destroyOtherSessions(userId: string, keepSessionId?: string) {
  const db = await getDb();
  const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const r of rows) if (r.id !== keepSessionId) await db.delete(sessions).where(eq(sessions.id, r.id));
}

/** Current signed-in viewer for this request (memoized per request). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const id = sha256(token);
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  const row = rows[0];
  if (!row || row.user.status !== "active") return null;
  if (Date.now() - row.session.lastSeenAt.getTime() > 3600000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
  const [seller] = await db.select().from(sellers).where(eq(sellers.userId, row.user.id));
  return { user: row.user, seller: seller ?? null, sessionId: id };
});

export async function requireViewer(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login" + (next ? `?next=${encodeURIComponent(next)}` : ""));
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/admin");
  if (viewer.user.role !== "admin") redirect("/forbidden");
  return viewer;
}

/** Active seller (approved). Pending/rejected sellers are sent to their application status page. */
export async function requireSeller(): Promise<Viewer & { seller: SellerProfile }> {
  const viewer = await requireViewer("/seller");
  if (!viewer.seller) redirect("/sell");
  if (viewer.seller.status !== "active") redirect("/sell/status");
  return viewer as Viewer & { seller: SellerProfile };
}

/**
 * Only same-site relative paths are allowed as post-login destinations.
 * Rejects protocol-relative ("//x"), backslash tricks ("/\\x" → browsers read "//x"), control characters,
 * and anything that resolves to another origin.
 */
export function isSafeNext(next: string | null | undefined): next is string {
  if (!next || next.length > 2000) return false;
  if (!next.startsWith("/") || next.startsWith("//")) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return false;
  try {
    return new URL(next, "https://ringo.invalid").origin === "https://ringo.invalid";
  } catch {
    return false;
  }
}
