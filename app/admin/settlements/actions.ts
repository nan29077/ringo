"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseZonedInput } from "@/lib/time";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { cancelSettlement, createSettlement, markSettlementPaid } from "@/lib/server/commerce";
import { formatMoney } from "@/lib/i18n";

const uuid = z.string().uuid();

export async function createPayoutBatch(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z
      .object({ sellerId: uuid, until: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/), memo: z.string().trim().max(500) })
      .parse(Object.fromEntries(fd));
    const [seller] = await db.select().from(s.sellers).where(eq(s.sellers.id, input.sellerId));
    if (!seller) throw new ActionError("not_found");
    // Cut-off date is inclusive (end of that day, server time). Blank = now; commerce still applies the refund window.
    const until = input.until ? parseZonedInput(input.until, { endOfDay: true }) : new Date();
    if (!until) throw new ActionError(t("Invalid cut-off date.", "기준일이 올바르지 않습니다."));
    const settlement = await createSettlement(db, viewer, seller.id, new Date(Math.min(until.getTime(), Date.now())), input.memo || undefined);
    await audit(db, viewer, "settlement.create", "settlement", settlement.id, { sellerId: seller.id, until: input.until || null, orders: settlement.orderCount, netCents: settlement.netCents, memo: input.memo || null });
    revalidatePath("/admin/settlements");
    return {
      ok: true,
      message: t(`Payout batch created: ${settlement.orderCount} orders · ${formatMoney(settlement.netCents, settlement.currency)}.`, `정산서를 생성했습니다: 주문 ${settlement.orderCount}건 · ${formatMoney(settlement.netCents, settlement.currency)}`),
      redirect: `/admin/settlements/${settlement.id}`,
    };
  }, "ko");
}

export async function markPayoutPaid(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z.object({ settlementId: uuid, reference: z.string().trim().min(1).max(200) }).parse(Object.fromEntries(fd));
    await markSettlementPaid(db, viewer, input.settlementId, input.reference);
    await audit(db, viewer, "settlement.paid", "settlement", input.settlementId, { reference: input.reference });
    return { ok: true, message: t("Marked as paid. The seller was notified.", "지급 완료로 처리하고 판매자에게 알렸습니다.") };
  }, "ko");
}

export async function cancelPayoutBatch(settlementId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(settlementId);
    await cancelSettlement(db, id);
    await audit(db, viewer, "settlement.cancel", "settlement", id);
    return { ok: true, message: t("Settlement cancelled. Its orders are unsettled again.", "정산서를 취소했습니다. 포함된 주문은 미정산 상태로 돌아갑니다.") };
  }, "ko");
}
