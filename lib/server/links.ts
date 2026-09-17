import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { parseZonedInput } from "@/lib/time";
import * as s from "@/db/schema";
import type { DB } from "./db";
import type { Viewer } from "./auth";
import { CommerceError } from "./commerce";
import { randomCode } from "./ids";
import type { Attribution } from "./commerce";

export const ATTR_COOKIE = "ringo_attr";
const ATTR_DAYS = 30;

export const linkInput = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  source: z.string().trim().min(1).max(60).regex(/^[\w.-]+$/),
  medium: z.string().trim().max(60).regex(/^[\w.-]*$/).default("link"),
  campaign: z.string().trim().max(80).regex(/^[\w.-]*$/).optional().transform((v) => v || null),
  destination: z.enum(["product", "checkout"]).default("product"),
  locale: z.enum(["en", "ko"]).default("en"),
  couponCode: z.string().trim().max(40).optional().transform((v) => (v ? v.toUpperCase() : null)),
  expiresAt: z.string().optional().transform((v, ctx) => {
    if (!v) return null;
    const d = parseZonedInput(v);
    if (!d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  }),
  code: z.string().trim().max(40).regex(/^[a-zA-Z0-9-]*$/).optional(),
});

export async function saveLink(db: DB, viewer: Viewer, raw: Record<string, unknown>, linkId?: string) {
  const input = linkInput.parse(raw);
  const [product] = await db.select().from(s.products).where(eq(s.products.id, input.productId));
  if (!product) throw new CommerceError("not_found");
  const admin = viewer.user.role === "admin";
  if (!admin && viewer.seller?.id !== product.sellerId) throw new CommerceError("forbidden");
  const existing = linkId ? (await db.select().from(s.deepLinks).where(eq(s.deepLinks.id, linkId)))[0] : undefined;
  if (linkId && (!existing || (!admin && existing.sellerId !== viewer.seller?.id))) throw new CommerceError("not_found");
  // A past expiry is only rejected when it is being set now; keeping an already-expired date lets the other fields be edited.
  const minute = (d: Date | null | undefined) => (d ? Math.floor(d.getTime() / 60000) : null);
  // The form renders minutes, so a stored value with seconds still counts as unchanged.
  const expiryUnchanged = !!existing && minute(existing.expiresAt) === minute(input.expiresAt);
  if (input.expiresAt && input.expiresAt.getTime() < Date.now() && !expiryUnchanged) throw new CommerceError("expiry_past");
  if (input.couponCode) {
    const [c] = await db.select().from(s.coupons).where(eq(s.coupons.code, input.couponCode));
    if (!c || (c.sellerId && c.sellerId !== product.sellerId)) throw new CommerceError("coupon_not_applicable");
  }
  const values = { productId: product.id, sellerId: product.sellerId, name: input.name, source: input.source, medium: input.medium || "link", campaign: input.campaign, destination: input.destination, locale: input.locale, couponCode: input.couponCode, expiresAt: input.expiresAt, updatedAt: new Date() };
  if (linkId) {
    const [row] = await db.update(s.deepLinks).set(values).where(eq(s.deepLinks.id, linkId)).returning();
    return row;
  }
  let code = input.code?.toLowerCase() || randomCode(7).toLowerCase();
  const taken = await db.select({ id: s.deepLinks.id }).from(s.deepLinks).where(eq(s.deepLinks.code, code));
  if (taken.length) {
    if (input.code) throw new CommerceError("code_taken");
    code = randomCode(9).toLowerCase();
  }
  const [row] = await db.insert(s.deepLinks).values({ ...values, code, createdBy: viewer.user.id }).returning();
  return row;
}

export async function toggleLink(db: DB, viewer: Viewer, linkId: string) {
  const [link] = await db.select().from(s.deepLinks).where(eq(s.deepLinks.id, linkId));
  if (!link || (viewer.user.role !== "admin" && link.sellerId !== viewer.seller?.id)) throw new CommerceError("not_found");
  await db.update(s.deepLinks).set({ status: link.status === "active" ? "paused" : "active", updatedAt: new Date() }).where(eq(s.deepLinks.id, linkId));
}

export function linkState(link: { status: string; expiresAt: Date | null }) {
  if (link.status === "paused") return "paused" as const;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return "expired" as const;
  return "active" as const;
}

/** Link performance: clicks + paid orders + revenue. */
export async function linkStats(db: DB, linkIds: string[]) {
  if (!linkIds.length) return new Map<string, { orders: number; cents: number }>();
  const rows = await db
    .select({ linkId: s.orders.linkId, orders: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int` })
    .from(s.orders)
    .where(and(sql`${s.orders.linkId} in (${sql.join(linkIds.map((id) => sql`${id}`), sql`, `)})`, eq(s.orders.status, "paid")))
    .groupBy(s.orders.linkId);
  return new Map(rows.map((r) => [r.linkId!, { orders: r.orders, cents: r.cents }]));
}

export async function readAttribution(): Promise<Attribution & { coupon?: string | null; productId?: string | null }> {
  const raw = (await cookies()).get(ATTR_COOKIE)?.value;
  if (!raw) return {};
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return typeof v === "object" && v ? v : {};
  } catch {
    return {};
  }
}

export function encodeAttribution(v: Attribution & { coupon?: string | null; productId?: string | null }) {
  return { name: ATTR_COOKIE, value: Buffer.from(JSON.stringify(v)).toString("base64url"), maxAge: ATTR_DAYS * 86400 };
}
