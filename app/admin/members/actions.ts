"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { sendTemplateMail } from "@/lib/server/mail";
import { randomToken, sha256 } from "@/lib/server/password";
import { appOrigin, rateLimit } from "@/lib/server/request";
import { activeAdminCount, grantEntitlement, revokeEntitlement } from "@/lib/server/admin-ops";

const uuid = z.string().uuid();

async function loadUser(id: string) {
  const db = await getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, uuid.parse(id)));
  if (!user) throw new ActionError("not_found");
  return { db, user };
}

export async function setMemberStatus(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const { t } = await getT("ko");
    const input = z.object({ userId: uuid, status: z.enum(["active", "suspended"]), reason: z.string().trim().max(500).optional() }).parse(Object.fromEntries(fd));
    const { db, user } = await loadUser(input.userId);
    if (user.id === viewer.user.id) return { ok: false, error: t("You cannot change the status of your own account.", "본인 계정의 상태는 변경할 수 없습니다.") };
    if (user.status === input.status) throw new ActionError("invalid_state");
    if (input.status === "suspended") {
      if (!input.reason) throw new ActionError("reason_required");
      if (user.role === "admin" && (await activeAdminCount(db, user.id)) < 1) return { ok: false, error: t("At least one active admin is required.", "활성 관리자가 최소 1명 필요합니다.") };
    }
    const memo = input.reason ? `${new Date().toISOString().slice(0, 10)} ${input.status} by ${viewer.user.email}: ${input.reason}\n${user.adminMemo ?? ""}`.slice(0, 4000) : user.adminMemo;
    await db.transaction(async (tx) => {
      await tx.update(s.users).set({ status: input.status, adminMemo: memo, updatedAt: new Date() }).where(eq(s.users.id, user.id));
      if (input.status === "suspended") await tx.delete(s.sessions).where(eq(s.sessions.userId, user.id));
    });
    await audit(db, viewer, input.status === "suspended" ? "member.suspend" : "member.reactivate", "user", user.id, { reason: input.reason ?? null });
    return { ok: true, message: input.status === "suspended" ? t("Member suspended and signed out everywhere.", "회원을 정지하고 모든 기기에서 로그아웃시켰습니다.") : t("Member reactivated.", "회원 이용을 재개했습니다.") };
  }, "ko");
}

export async function sendMemberPasswordReset(userId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const { t } = await getT("ko");
    const { db, user } = await loadUser(userId);
    if (user.status !== "active") return { ok: false, error: t("Reactivate the account before sending a reset link.", "정지된 계정입니다. 이용 재개 후 발송하세요.") };
    if (!rateLimit(`admin-reset:${user.id}`, 5, 60 * 60000)) throw new ActionError("too_many_attempts");
    const token = randomToken();
    await db.insert(s.authTokens).values({ userId: user.id, type: "reset_password", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600000) });
    const origin = await appOrigin();
    await sendTemplateMail(db, user.email, "reset_password", user.locale, { name: user.name, url: `${origin}/reset-password?token=${token}`, byOperator: true });
    await audit(db, viewer, "member.password_reset_sent", "user", user.id);
    return { ok: true, message: t(`Reset link sent to ${user.email}.`, `${user.email}로 비밀번호 재설정 링크를 보냈습니다.`) };
  }, "ko");
}

export async function forceSignOut(userId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const { t } = await getT("ko");
    const { db, user } = await loadUser(userId);
    const rows = await db.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.userId, user.id));
    const targets = rows.filter((r) => r.id !== viewer.sessionId);
    for (const r of targets) await db.delete(s.sessions).where(eq(s.sessions.id, r.id));
    await audit(db, viewer, "member.sign_out_all", "user", user.id, { sessions: targets.length });
    return { ok: true, message: user.id === viewer.user.id ? t(`Signed out ${targets.length} other session(s). Your current session was kept.`, `다른 세션 ${targets.length}개를 로그아웃했습니다. 현재 세션은 유지됩니다.`) : t(`Signed out ${targets.length} session(s).`, `${targets.length}개 세션을 로그아웃시켰습니다.`) };
  }, "ko");
}

export async function markEmailVerified(userId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const { t } = await getT("ko");
    const { db, user } = await loadUser(userId);
    if (user.emailVerifiedAt) throw new ActionError("invalid_state");
    await db.update(s.users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(s.users.id, user.id));
    await audit(db, viewer, "member.email_verify", "user", user.id);
    return { ok: true, message: t("Email marked as verified.", "이메일 인증 완료로 처리했습니다.") };
  }, "ko");
}

export async function saveMemberMemo(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const { t } = await getT("ko");
    const input = z.object({ userId: uuid, memo: z.string().max(4000) }).parse(Object.fromEntries(fd));
    const { db, user } = await loadUser(input.userId);
    await db.update(s.users).set({ adminMemo: input.memo.trim() || null, updatedAt: new Date() }).where(eq(s.users.id, user.id));
    await audit(db, viewer, "member.memo", "user", user.id, { length: input.memo.trim().length });
    return { ok: true, message: t("Memo saved.", "메모를 저장했습니다.") };
  }, "ko");
}

export async function grantMemberEntitlement(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const { t } = await getT("ko");
    const input = z.object({ userId: uuid, productId: uuid, reason: z.string().trim().min(1).max(500) }).parse(Object.fromEntries(fd));
    const db = await getDb();
    const order = await grantEntitlement(db, viewer, input.userId, input.productId, input.reason);
    await audit(db, viewer, "member.entitlement_grant", "user", input.userId, { productId: input.productId, orderId: order.id, reason: input.reason });
    return { ok: true, message: t(`Access granted (order ${order.orderNo}).`, `이용 권한을 지급했습니다 (주문 ${order.orderNo}).`) };
  }, "ko");
}

export async function revokeMemberEntitlement(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const { t } = await getT("ko");
    const input = z.object({ entitlementId: uuid, reason: z.string().trim().min(1).max(500) }).parse(Object.fromEntries(fd));
    const db = await getDb();
    const ent = await revokeEntitlement(db, viewer, input.entitlementId, input.reason);
    await audit(db, viewer, "member.entitlement_revoke", "user", ent.userId, { entitlementId: ent.id, productId: ent.productId, orderId: ent.orderId, reason: input.reason });
    return { ok: true, message: t("Access revoked.", "이용 권한을 회수했습니다.") };
  }, "ko");
}
