"use server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { destroyOtherSessions, requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError, requestRefund } from "@/lib/server/commerce";
import { closeInquiry, createInquiry, getInquiryThread, replyInquiry } from "@/lib/server/inquiries";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/server/password";
import { rateLimit } from "@/lib/server/request";
import { activeEntitlement, isUuid, recomputeRating } from "@/lib/server/storefront";
import { audit } from "@/lib/server/audit";
import { LANG_COOKIE } from "@/lib/i18n";

const uuid = z.string().uuid();

/* ------------------------------------------------------------------ library */

export async function setLessonDone(productId: string, lessonIndex: number, done: boolean): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/account/library");
    if (!isUuid(productId) || !Number.isInteger(lessonIndex) || lessonIndex < 0) throw new CommerceError("not_found");
    const db = await getDb();
    if (!(await activeEntitlement(db, viewer.user.id, productId))) throw new CommerceError("not_found");
    const [product] = await db.select({ lessons: s.products.lessons }).from(s.products).where(eq(s.products.id, productId));
    if (!product || lessonIndex >= (product.lessons?.length ?? 0)) throw new CommerceError("not_found");
    const key = and(eq(s.lessonProgress.userId, viewer.user.id), eq(s.lessonProgress.productId, productId), eq(s.lessonProgress.lessonIndex, lessonIndex));
    if (done) await db.insert(s.lessonProgress).values({ userId: viewer.user.id, productId, lessonIndex }).onConflictDoNothing();
    else await db.delete(s.lessonProgress).where(key);
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ orders */

async function ownOrder(orderId: string) {
  const viewer = await requireViewer("/account/orders");
  if (!isUuid(orderId)) throw new CommerceError("not_found");
  const db = await getDb();
  const [order] = await db.select().from(s.orders).where(and(eq(s.orders.id, orderId), eq(s.orders.buyerId, viewer.user.id)));
  if (!order) throw new CommerceError("not_found");
  return { viewer, db, order };
}

export async function submitRefundRequest(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ orderId: uuid, reason: z.string().trim().min(5).max(2000) }).parse(Object.fromEntries(fd));
    const { viewer, db, order } = await ownOrder(input.orderId);
    await requestRefund(db, viewer, order.id, input.reason);
    const { t } = await getT();
    return { ok: true, message: t("Refund request sent. We’ll email you when it’s reviewed.", "환불 요청을 접수했습니다. 검토 결과는 이메일로 안내드립니다.") };
  });
}

export async function submitReview(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ orderId: uuid, rating: z.coerce.number().int().min(1).max(5), body: z.string().trim().max(2000).optional() }).parse(Object.fromEntries(fd));
    const { viewer, db, order } = await ownOrder(input.orderId);
    const { t } = await getT();
    const [product] = await db.select({ id: s.products.id, deliveryType: s.products.deliveryType }).from(s.products).where(eq(s.products.id, order.productId));
    if (!product || order.status !== "paid") throw new ActionError(t("You can review a product after a completed purchase.", "결제가 완료된 주문만 리뷰를 작성할 수 있습니다."));
    if (product.deliveryType === "service" && order.fulfillmentStatus !== "delivered") throw new ActionError(t("You can review this service after it has been delivered.", "제작 서비스는 납품 완료 후 리뷰를 작성할 수 있습니다."));
    const [inserted] = await db.insert(s.productReviews).values({ productId: product.id, userId: viewer.user.id, orderId: order.id, rating: input.rating, body: input.body || null }).onConflictDoNothing().returning();
    if (!inserted) throw new ActionError(t("You already reviewed this order.", "이미 리뷰를 작성한 주문입니다."));
    await recomputeRating(db, product.id);
    return { ok: true, message: t("Thanks for your review!", "리뷰를 남겨주셔서 감사합니다!") };
  });
}

/* ------------------------------------------------------------------ inquiries */

export async function submitInquiry(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/account/inquiries");
    if (!rateLimit(`inquiry:${viewer.user.id}`, 10, 60 * 60000)) throw new ActionError("too_many_attempts");
    const db = await getDb();
    const raw = Object.fromEntries(fd);
    const inquiry = await createInquiry(db, viewer, raw);
    const { t } = await getT();
    return { ok: true, message: t("Inquiry sent.", "문의를 등록했습니다."), redirect: `/account/inquiries/${inquiry.id}` };
  });
}

async function ownThread(inquiryId: string) {
  const viewer = await requireViewer("/account/inquiries");
  if (!isUuid(inquiryId)) throw new CommerceError("not_found");
  const db = await getDb();
  const thread = await getInquiryThread(db, viewer, inquiryId);
  if (thread.inquiry.userId !== viewer.user.id) throw new CommerceError("not_found");
  return { viewer, db, thread };
}

export async function replyToInquiry(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = z.object({ inquiryId: uuid, body: z.string().trim().min(1).max(5000) }).parse(Object.fromEntries(fd));
    const { viewer, db, thread } = await ownThread(input.inquiryId);
    const { t } = await getT();
    if (thread.inquiry.status === "closed") throw new ActionError(t("This inquiry is closed. Start a new one if you need more help.", "종료된 문의입니다. 추가 문의는 새로 등록해 주세요."));
    if (!rateLimit(`inquiry-reply:${viewer.user.id}`, 30, 60 * 60000)) throw new ActionError("too_many_attempts");
    await replyInquiry(db, viewer, thread.inquiry.id, input.body);
    return { ok: true, message: t("Message sent.", "메시지를 보냈습니다.") };
  });
}

export async function closeMyInquiry(inquiryId: string): Promise<ActionResult> {
  return run(async () => {
    const { viewer, db, thread } = await ownThread(inquiryId);
    if (thread.inquiry.status === "closed") throw new CommerceError("invalid_state");
    await closeInquiry(db, viewer, thread.inquiry.id);
    const { t } = await getT();
    return { ok: true, message: t("Inquiry closed.", "문의를 종료했습니다.") };
  });
}

/* ------------------------------------------------------------------ profile */

export async function updateProfile(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/account/profile");
    const input = z.object({ name: z.string().trim().min(1).max(80), locale: z.enum(["en", "ko"]), marketing: z.string().optional() }).parse(Object.fromEntries(fd));
    const db = await getDb();
    await db.update(s.users).set({ name: input.name, locale: input.locale, marketingOptIn: input.marketing === "on", updatedAt: new Date() }).where(eq(s.users.id, viewer.user.id));
    (await cookies()).set(LANG_COOKIE, input.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    const message = input.locale === "ko" ? "프로필을 저장했습니다." : "Profile saved.";
    return { ok: true, message };
  });
}

export async function changePassword(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/account/profile");
    const { t } = await getT();
    const input = z.object({ current: z.string().min(1).max(200), password: z.string().max(200), confirm: z.string().max(200) }).parse(Object.fromEntries(fd));
    if (!rateLimit(`pw-change:${viewer.user.id}`, 5, 15 * 60000)) throw new ActionError("too_many_attempts");
    const db = await getDb();
    const [user] = await db.select({ passwordHash: s.users.passwordHash }).from(s.users).where(eq(s.users.id, viewer.user.id));
    if (!(await verifyPassword(input.current, user?.passwordHash))) throw new ActionError(t("Your current password is incorrect.", "현재 비밀번호가 올바르지 않습니다."));
    if (input.password !== input.confirm) throw new ActionError(t("The new passwords do not match.", "새 비밀번호가 서로 일치하지 않습니다."));
    if (passwordProblems(input.password)) throw new ActionError("weak_password");
    if (input.password === input.current) throw new ActionError(t("Choose a password different from your current one.", "현재 비밀번호와 다른 비밀번호를 사용하세요."));
    await db.update(s.users).set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() }).where(eq(s.users.id, viewer.user.id));
    await destroyOtherSessions(viewer.user.id, viewer.sessionId);
    await audit(db, viewer, "user.password_change", "user", viewer.user.id);
    return { ok: true, message: t("Password changed. Other devices have been signed out.", "비밀번호를 변경했고 다른 기기에서 로그아웃했습니다.") };
  });
}

export async function signOutOtherDevices(): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/account/profile");
    await destroyOtherSessions(viewer.user.id, viewer.sessionId);
    const { t } = await getT();
    return { ok: true, message: t("Signed out of all other devices.", "다른 모든 기기에서 로그아웃했습니다.") };
  });
}
