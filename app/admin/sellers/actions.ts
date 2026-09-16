"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { reviewSeller, setSellerStatus } from "@/lib/server/sellers";

const uuid = z.string().uuid();

export async function approveSeller(sellerId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(sellerId);
    await reviewSeller(db, viewer, id, "approve");
    await audit(db, viewer, "seller.approve", "seller", id);
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Store approved. The applicant was notified.", "입점을 승인하고 신청자에게 알렸습니다.") };
  }, "ko");
}

export async function rejectSeller(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z.object({ sellerId: uuid, reason: z.string().trim().max(2000) }).parse(Object.fromEntries(fd));
    await reviewSeller(db, viewer, input.sellerId, "reject", input.reason);
    await audit(db, viewer, "seller.reject", "seller", input.sellerId, { reason: input.reason });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Application rejected. The applicant was notified.", "입점 신청을 반려하고 신청자에게 알렸습니다.") };
  }, "ko");
}

export async function changeSellerStatus(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z.object({ sellerId: uuid, status: z.enum(["active", "suspended"]), reason: z.string().trim().max(500) }).parse(Object.fromEntries(fd));
    if (input.status === "suspended" && !input.reason) throw new ActionError("reason_required");
    const [before] = await db.select({ status: s.sellers.status }).from(s.sellers).where(eq(s.sellers.id, input.sellerId));
    if (!before || before.status === input.status) throw new ActionError("invalid_state");
    await setSellerStatus(db, viewer, input.sellerId, input.status, input.reason || undefined);
    await audit(db, viewer, input.status === "suspended" ? "seller.suspend" : "seller.reactivate", "seller", input.sellerId, { reason: input.reason || null });
    return { ok: true, message: input.status === "suspended" ? t("Store suspended. Its products can no longer be purchased.", "스토어를 정지했습니다. 상품 구매가 차단됩니다.") : t("Store reactivated.", "스토어 운영을 재개했습니다.") };
  }, "ko");
}

export async function saveSellerCommission(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z
      .object({ sellerId: uuid, percent: z.string().trim().regex(/^$|^\d{1,2}(\.\d{1,2})?$|^100(\.0{1,2})?$/, "0–100, up to 2 decimals") })
      .parse(Object.fromEntries(fd));
    const bps = input.percent === "" ? null : Math.round(Number(input.percent) * 100);
    if (bps != null && (bps < 0 || bps > 10000)) throw new ActionError(t("Commission must be between 0 and 100%.", "수수료는 0~100% 사이여야 합니다."));
    const [before] = await db.select({ bps: s.sellers.commissionBps }).from(s.sellers).where(eq(s.sellers.id, input.sellerId));
    if (!before) throw new ActionError("not_found");
    await db.update(s.sellers).set({ commissionBps: bps, updatedAt: new Date() }).where(eq(s.sellers.id, input.sellerId));
    await audit(db, viewer, "seller.commission", "seller", input.sellerId, { from: before.bps, to: bps });
    return { ok: true, message: bps == null ? t("Commission reset to the marketplace default. Applies to new orders.", "기본 수수료로 되돌렸습니다. 신규 주문부터 적용됩니다.") : t(`Commission set to ${(bps / 100).toFixed(2)}%. Applies to new orders.`, `수수료를 ${(bps / 100).toFixed(2)}%로 변경했습니다. 신규 주문부터 적용됩니다.`) };
  }, "ko");
}

export async function saveSellerMemo(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z.object({ sellerId: uuid, memo: z.string().max(4000) }).parse(Object.fromEntries(fd));
    const res = await db.update(s.sellers).set({ adminMemo: input.memo.trim() || null, updatedAt: new Date() }).where(eq(s.sellers.id, input.sellerId)).returning({ id: s.sellers.id });
    if (!res.length) throw new ActionError("not_found");
    await audit(db, viewer, "seller.memo", "seller", input.sellerId, { length: input.memo.trim().length });
    return { ok: true, message: t("Memo saved.", "메모를 저장했습니다.") };
  }, "ko");
}
