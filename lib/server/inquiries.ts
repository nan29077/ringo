import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { DB } from "./db";
import type { Viewer } from "./auth";
import { CommerceError } from "./commerce";
import { sendMail } from "./mail";

type Inquiry = typeof s.inquiries.$inferSelect;

export function inquiryAccess(viewer: Viewer, inquiry: Inquiry): "owner" | "seller" | "admin" | null {
  if (viewer.user.role === "admin") return "admin";
  if (inquiry.userId === viewer.user.id) return "owner";
  if (inquiry.sellerId && viewer.seller?.status === "active" && viewer.seller.id === inquiry.sellerId) return "seller";
  return null;
}

export async function getInquiryThread(db: DB, viewer: Viewer, inquiryId: string) {
  const [row] = await db
    .select({ inquiry: s.inquiries, userName: s.users.name, userEmail: s.users.email })
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
  const [inq] = await db.insert(s.inquiries).values({ userId: viewer.user.id, sellerId, productId: input.productId, orderId: input.orderId, category: input.category, subject: input.subject }).returning();
  await db.insert(s.inquiryMessages).values({ inquiryId: inq.id, authorId: viewer.user.id, authorRole: viewer.user.role, body: input.body });
  return inq;
}

export async function replyInquiry(db: DB, viewer: Viewer, inquiryId: string, body: string) {
  const text = body.trim();
  if (text.length < 1 || text.length > 5000) throw new CommerceError("reason_required");
  const { inquiry, access, userEmail } = await getInquiryThread(db, viewer, inquiryId);
  if (inquiry.status === "closed" && access === "owner") throw new CommerceError("invalid_state");
  await db.insert(s.inquiryMessages).values({ inquiryId, authorId: viewer.user.id, authorRole: access === "owner" ? viewer.user.role : access === "admin" ? "admin" : "seller", body: text });
  const status = access === "owner" ? "open" : "answered";
  await db.update(s.inquiries).set({ status, updatedAt: new Date() }).where(eq(s.inquiries.id, inquiryId));
  if (access !== "owner") {
    await sendMail(db, userEmail, `Re: ${inquiry.subject}`, `You have a new reply on Ringo:\n\n${text}\n\n${process.env.APP_URL || ""}/account/inquiries/${inquiryId}`, "inquiry_reply");
  }
}

export async function closeInquiry(db: DB, viewer: Viewer, inquiryId: string) {
  const { access } = await getInquiryThread(db, viewer, inquiryId);
  if (!access) throw new CommerceError("not_found");
  await db.update(s.inquiries).set({ status: "closed", updatedAt: new Date() }).where(eq(s.inquiries.id, inquiryId));
}
