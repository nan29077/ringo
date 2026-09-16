"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { hashPassword, passwordProblems } from "@/lib/server/password";
import { activeAdminCount } from "@/lib/server/admin-ops";

const email = z.string().trim().toLowerCase().email().max(200);

export async function promoteOperator(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z.object({ email }).parse(Object.fromEntries(fd));
    const [user] = await db.select().from(s.users).where(eq(s.users.email, input.email));
    if (!user) return { ok: false, error: t("No member with this email. Create a new operator account instead.", "해당 이메일의 회원이 없습니다. 새 운영자 계정을 생성하세요.") };
    if (user.role === "admin") return { ok: false, error: t("This member is already an operator.", "이미 운영자인 회원입니다.") };
    if (user.status !== "active") return { ok: false, error: t("Suspended members cannot be promoted.", "정지된 회원은 운영자로 지정할 수 없습니다.") };
    await db.update(s.users).set({ role: "admin", updatedAt: new Date() }).where(eq(s.users.id, user.id));
    await audit(db, viewer, "operator.promote", "user", user.id, { email: user.email, previousRole: user.role });
    return { ok: true, message: t(`${user.email} is now an operator.`, `${user.email} 회원을 운영자로 지정했습니다.`) };
  }, "ko");
}

export async function createOperator(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z.object({ name: z.string().trim().min(1).max(80), email, password: z.string().max(128) }).parse(Object.fromEntries(fd));
    if (passwordProblems(input.password)) throw new ActionError("weak_password");
    const [exists] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, input.email));
    if (exists) throw new ActionError("email_taken");
    const [user] = await db
      .insert(s.users)
      .values({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "admin", locale: "ko", adminMemo: `Operator account created by ${viewer.user.email} with a temporary password.` })
      .returning();
    await audit(db, viewer, "operator.create", "user", user.id, { email: user.email });
    return { ok: true, message: t("Operator account created. Share the temporary password through a secure channel and ask them to change it.", "운영자 계정을 생성했습니다. 임시 비밀번호는 안전한 경로로 전달하고 변경하도록 안내하세요.") };
  }, "ko");
}

export async function demoteOperator(userId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = z.string().uuid().parse(userId);
    if (id === viewer.user.id) return { ok: false, error: t("You cannot remove your own operator access.", "본인의 운영자 권한은 해제할 수 없습니다.") };
    const [user] = await db.select().from(s.users).where(eq(s.users.id, id));
    if (!user || user.role !== "admin") throw new ActionError("invalid_state");
    if (user.status === "active" && (await activeAdminCount(db, user.id)) < 1) return { ok: false, error: t("At least one active admin is required.", "활성 관리자가 최소 1명 필요합니다.") };
    const [seller] = await db.select({ status: s.sellers.status }).from(s.sellers).where(eq(s.sellers.userId, user.id));
    // A member with an approved store keeps seller access; everyone else becomes a buyer.
    const role: s.UserRole = seller && (seller.status === "active" || seller.status === "suspended") ? "seller" : "buyer";
    await db.transaction(async (tx) => {
      await tx.update(s.users).set({ role, updatedAt: new Date() }).where(eq(s.users.id, user.id));
      // Drop existing sessions so admin pages opened elsewhere stop working immediately.
      await tx.delete(s.sessions).where(eq(s.sessions.userId, user.id));
    });
    await audit(db, viewer, "operator.demote", "user", user.id, { email: user.email, newRole: role });
    return { ok: true, message: t(`Operator access removed (now ${role}).`, `운영자 권한을 해제했습니다 (${role === "seller" ? "판매자" : "구매자"}로 변경).`) };
  }, "ko");
}
