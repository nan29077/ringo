import "server-only";
import { mailOrigin } from "./request";
import { asc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { DB } from "./db";
import type { Viewer } from "./auth";
import { CommerceError } from "./commerce";
import { getSettings } from "./settings";
import { notify } from "./notify";

type Inquiry = typeof s.inquiries.$inferSelect;

export function inquiryAccess(viewer: Viewer, inquiry: Inquiry): "owner" | "seller" | "admin" | null {
  if (viewer.user.role === "admin") return "admin";
  if (inquiry.userId === viewer.user.id) return "owner";
  if (inquiry.sellerId && viewer.seller?.status === "active" && viewer.seller.id === inquiry.sellerId) return "seller";
  return null;
}

export async function getInquiryThread(db: DB, viewer: Viewer, inquiryId: string) {
  const [row] = await db
    .select({ inquiry: s.inquiries, userName: s.users.name, userEmail: s.users.email, userLocale: s.users.locale })
    .from(s.inquiries)
    .innerJoin(s.users, eq(s.users.id, s.inquiries.userId))
    .where(eq(s.inquiries.id, inquiryId));
  if (!row) throw new CommerceError("not_found");
  const access = inquiryAccess(viewer, row.inquiry);
  if (!access) throw new CommerceError("not_found");
  const messages = await db
    .select({ m: s.inquiryMessages, authorName: s.users.name })
    .from(s.inquiryMessages)
    .leftJoin(s.users, eq(s.users.id, s.inquiryMessages.authorId))
    .where(eq(s.inquiryMessages.inquiryId, inquiryId))
    .orderBy(asc(s.inquiryMessages.createdAt));
  return { ...row, access, messages };
}

/**
 * Records that this side has now seen the thread. A badge counts a thread as unread only when the
 * OTHER side wrote after that mark, so posting a message also marks it read for its own author —
 * otherwise everyone's own reply would light up their own badge.
 */
export async function markInquiryRead(db: DB, access: "owner" | "seller" | "admin", inquiryId: string) {
  const field = access === "owner" ? { buyerReadAt: new Date() } : { staffReadAt: new Date() };
  await db.update(s.inquiries).set(field).where(eq(s.inquiries.id, inquiryId));
}

/** SQL for "the other side wrote after I last looked". */
export const unreadForStaff = or(isNull(s.inquiries.staffReadAt), lt(s.inquiries.staffReadAt, s.inquiries.updatedAt));
export const unreadForBuyer = or(isNull(s.inquiries.buyerReadAt), lt(s.inquiries.buyerReadAt, s.inquiries.updatedAt));

export const newInquiryInput = z.object({
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(5000),
  category: z.enum(["general", "order", "product", "payment", "refund", "account", "seller"]).default("general"),
  productId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  orderId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
});

/** Buyer creates an inquiry. Product/order questions are routed to that seller; everything else to platform support. */
export async function createInquiry(db: DB, viewer: Viewer, raw: Record<string, unknown>) {
  const input = newInquiryInput.parse(raw);
  let sellerId: string | null = null;
  if (input.orderId) {
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, input.orderId));
    if (!o || o.buyerId !== viewer.user.id) throw new CommerceError("not_found");
    sellerId = o.sellerId;
    input.productId = o.productId;
  } else if (input.productId) {
    const [p] = await db.select().from(s.products).where(eq(s.products.id, input.productId));
    if (!p) throw new CommerceError("not_found");
    sellerId = p.sellerId;
  }
  if (["account", "payment"].includes(input.category)) sellerId = null;
  // A suspended store cannot open the seller console, so an inquiry routed to it would never be
  // answered by anyone. Those go to platform support instead.
  let sellerContact: { email: string; locale: "en" | "ko" } | null = null;
  if (sellerId) {
    const [row] = await db
      .select({ status: s.sellers.status, email: s.users.email, locale: s.users.locale })
      .from(s.sellers)
      .innerJoin(s.users, eq(s.users.id, s.sellers.userId))
      .where(eq(s.sellers.id, sellerId));
    if (!row || row.status !== "active") sellerId = null;
    else sellerContact = { email: row.email, locale: row.locale };
  }
  const [inq] = await db.insert(s.inquiries).values({ userId: viewer.user.id, sellerId, productId: input.productId, orderId: input.orderId, category: input.category, subject: input.subject, buyerReadAt: new Date() }).returning();
  await db.insert(s.inquiryMessages).values({ inquiryId: inq.id, authorId: viewer.user.id, authorRole: viewer.user.role, body: input.body });
  // Tell whoever has to answer. Without this the thread only shows up if they happen to open the console.
  const base = await mailOrigin();
  const vars = { subject: input.subject, body: input.body, from: viewer.user.name || viewer.user.email };
  if (sellerContact) {
    await notify(db, sellerContact.email, "inquiry_new", sellerContact.locale, { ...vars, url: `${base}/seller/inquiries/${inq.id}` });
  } else {
    const settings = await getSettings(db);
    await notify(db, settings.site.supportEmail, "inquiry_new", settings.site.defaultLocale, { ...vars, url: `${base}/admin/inquiries/${inq.id}` });
  }
  return inq;
}

export async function replyInquiry(db: DB, viewer: Viewer, inquiryId: string, body: string) {
  const text = body.trim();
  if (text.length < 1 || text.length > 5000) throw new CommerceError("reason_required");
  const { inquiry, access, userEmail, userLocale } = await getInquiryThread(db, viewer, inquiryId);
  if (inquiry.status === "closed" && access === "owner") throw new CommerceError("invalid_state");
  await db.insert(s.inquiryMessages).values({ inquiryId, authorId: viewer.user.id, authorRole: access === "owner" ? viewer.user.role : access === "admin" ? "admin" : "seller", body: text });
  const status = access === "owner" ? "open" : "answered";
  const now = new Date();
  await db
    .update(s.inquiries)
    .set({ status, updatedAt: now, ...(access === "owner" ? { buyerReadAt: now } : { staffReadAt: now }) })
    .where(eq(s.inquiries.id, inquiryId));
  const base = await mailOrigin();
  if (access !== "owner") {
    await notify(db, userEmail, "inquiry_reply", userLocale, {
      subject: inquiry.subject,
      body: text,
      url: `${base}/account/inquiries/${inquiryId}`,
    });
    return;
  }
  // The buyer answered, which re-opens the thread — the other side needs to hear about it too.
  if (inquiry.sellerId) {
    const [row] = await db
      .select({ email: s.users.email, locale: s.users.locale })
      .from(s.sellers)
      .innerJoin(s.users, eq(s.users.id, s.sellers.userId))
      .where(eq(s.sellers.id, inquiry.sellerId));
    if (row) await notify(db, row.email, "inquiry_new", row.locale, { subject: inquiry.subject, body: text, from: viewer.user.name || viewer.user.email, url: `${base}/seller/inquiries/${inquiryId}` });
  } else {
    const settings = await getSettings(db);
    await notify(db, settings.site.supportEmail, "inquiry_new", settings.site.defaultLocale, { subject: inquiry.subject, body: text, from: viewer.user.name || viewer.user.email, url: `${base}/admin/inquiries/${inquiryId}` });
  }
}

export async function closeInquiry(db: DB, viewer: Viewer, inquiryId: string) {
  const { access } = await getInquiryThread(db, viewer, inquiryId);
  if (!access) throw new CommerceError("not_found");
  await db.update(s.inquiries).set({ status: "closed", updatedAt: new Date() }).where(eq(s.inquiries.id, inquiryId));
}
