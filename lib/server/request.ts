import "server-only";
import { headers } from "next/headers";

/**
 * Client IP that a visitor cannot forge.
 * X-Forwarded-For is only trusted for the number of proxy hops we control (TRUSTED_PROXY_HOPS, e.g. 1 behind an AWS ALB):
 * each trusted proxy appends the address it saw, so the real client is the entry `hops` positions from the right.
 * Values further left are supplied by the client and are ignored.
 */
export function clientIpFrom(h: Headers): string | null {
  const hops = Math.max(0, Math.min(5, Number(process.env.TRUSTED_PROXY_HOPS ?? 0) || 0));
  if (hops > 0) {
    const chain = (h.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    if (chain.length >= hops) return chain[chain.length - hops].slice(0, 64);
    return null;
  }
  // No trusted proxy configured (local development): forwarding headers are not trusted.
  return null;
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: clientIpFrom(h),
    userAgent: h.get("user-agent")?.slice(0, 300) || null,
    origin: h.get("origin"),
    host: h.get("x-forwarded-host") || h.get("host"),
  };
}

export async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3031";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

const buckets = new Map<string, { count: number; reset: number }>();
/** Clears a counter after a successful attempt, so legitimate use never exhausts an abuse limit. */
export function rateLimitReset(...keys: string[]) {
  for (const k of keys) buckets.delete(k);
}

/** Simple fixed-window limiter (per server instance). Use a shared store (Redis/DynamoDB) when scaling out. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count++;
  if (buckets.size > 10000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.count <= limit;
}
