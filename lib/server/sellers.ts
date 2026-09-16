import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { DB } from "./db";
import type { Viewer } from "./auth";
import { CommerceError } from "./commerce";
import { getSettings } from "./settings";
import { sendMail } from "./mail";

export const sellerProfileInput = z.object({
  displayName: z.string().trim().min(2).max(60),
  slug: z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9-]+$/),
  bio: z.string().trim().max(1000).optional().transform((v) => v || null),
  website: z.string().trim().max(200).optional().transform((v) => v || null),
  avatarKey: z.string().max(300).optional().transform((v) => v || null),
});

export const payoutInput = z.object({
  payoutMethod: z.enum(["bank", "gcash", "maya", "paypal", "other"]),
  payoutBankName: z.string().trim().max(80).optional().transform((v) => v || null),
  payoutAccountName: z.string().trim().min(1).max(120),
  payoutAccountNumber: z.string().trim().min(3).max(60),
});

async function assertSlugFree(db: DB, slug: string, exceptId?: string) {
  const rows = await db.select({ id: s.sellers.id }).from(s.sellers).where(and(eq(s.sellers.slug, slug), exceptId ? ne(s.sellers.id, exceptId) : undefined));
  if (rows.length) throw new CommerceError("slug_taken");
}

/** Buyer applies to become a seller (or re-applies after rejection). */
export async function applyAsSeller(db: DB, viewer: Viewer, raw: Record<string, unknown>) {
  const profile = sellerProfileInput.parse(raw);
  const payout = payoutInput.partial().parse(raw);
  const note = z.string().trim().min(10).max(2000).parse(raw.applicationNote);
  if (viewer.seller && ["active", "pending", "suspended"].includes(viewer.seller.status)) throw new CommerceError("invalid_state");
  await assertSlugFree(db, profile.slug, viewer.seller?.id);
  const settings = await getSettings(db);
  const auto = settings.moderation.autoApproveSellers;
  const values = { ...profile, ...payout, applicationNote: note, status: (auto ? "active" : "pending") as s.SellerStatus, rejectReason: null, updatedAt: new Date(), reviewedAt: auto ? new Date() : null };
  if (viewer.seller) await db.update(s.sellers).set(values).where(eq(s.sellers.id, viewer.seller.id));
  else await db.insert(s.sellers).values({ ...values, userId: viewer.user.id });
  if (auto && viewer.user.role === "buyer") await db.update(s.users).set({ role: "seller" }).where(eq(s.users.id, viewer.user.id));
  return auto ? "active" : "pending";
}

export async function updateSellerProfile(db: DB, sellerId: string, raw: Record<string, unknown>) {
  const profile = sellerProfileInput.parse(raw);
  await assertSlugFree(db, profile.slug, sellerId);
  await db.update(s.sellers).set({ ...profile, updatedAt: new Date() }).where(eq(s.sellers.id, sellerId));
}

export async function updatePayout(db: DB, sellerId: string, raw: Record<string, unknown>) {
  const payout = payoutInput.parse(raw);
  await db.update(s.sellers).set({ ...payout, updatedAt: new Date() }).where(eq(s.sellers.id, sellerId));
}

export async function reviewSeller(db: DB, viewer: Viewer, sellerId: string, decision: "approve" | "reject", reason?: string) {
  if (viewer.user.role !== "admin") throw new CommerceError("forbidden");
  const [row] = await db.select({ seller: s.sellers, user: s.users }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(eq(s.sellers.id, sellerId));
  if (!row || row.seller.status !== "pending") throw new CommerceError("invalid_state");
  if (decision === "reject" && !reason?.trim()) throw new CommerceError("reason_required");
  await db.update(s.sellers).set({ status: decision === "approve" ? "active" : "rejected", rejectReason: decision === "reject" ? reason!.trim() : null, reviewedBy: viewer.user.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(s.sellers.id, sellerId));
  if (decision === "approve" && row.user.role === "buyer") await db.update(s.users).set({ role: "seller" }).where(eq(s.users.id, row.user.id));
  await sendMail(db, row.user.email, decision === "approve" ? "Welcome to Ringo sellers" : "Your Ringo seller application", decision === "approve" ? `Your store "${row.seller.displayName}" is approved. Open the seller center: ${process.env.APP_URL || ""}/seller` : `We could not approve your application.\nReason: ${reason}\nYou can update and re-apply at ${process.env.APP_URL || ""}/sell`, "seller_review");
}

export async function setSellerStatus(db: DB, viewer: Viewer, sellerId: string, status: "active" | "suspended", reason?: string) {
  if (viewer.user.role !== "admin") throw new CommerceError("forbidden");
  const [row] = await db.select().from(s.sellers).where(eq(s.sellers.id, sellerId));
  if (!row || !["active", "suspended"].includes(row.status)) throw new CommerceError("invalid_state");
  await db.update(s.sellers).set({ status, adminMemo: reason ? `${new Date().toISOString().slice(0, 10)} ${status}: ${reason}\n${row.adminMemo ?? ""}`.slice(0, 4000) : row.adminMemo, updatedAt: new Date() }).where(eq(s.sellers.id, sellerId));
}
