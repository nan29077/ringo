import { and, asc, count, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { listParams, type SP } from "@/lib/server/list";
import { PageHeader, Panel, Notice } from "@/components/console/ui";
import { Pagination } from "@/components/console/filters";
import { OrderTable } from "../order-table";

export const metadata = { title: "Refund requests" };

export default async function SellerRefunds({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const settings = await getSettings(db);
  const base = and(eq(s.orders.sellerId, viewer.seller.id), eq(s.orders.status, "paid"), eq(s.orders.refundStatus, "requested"));
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(s.orders).where(base).orderBy(asc(s.orders.updatedAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.orders).where(base),
  ]);
  return (
    <>
      <PageHeader title={t("Refund requests", "환불 요청")} description={t("Review buyer refund requests. Approving refunds the full amount through the payment provider and removes access.", "구매자 환불 요청을 검토하세요. 승인하면 결제사를 통해 전액 환불되고 이용 권한이 회수됩니다.")} />
      <div className="mb-4">
        <Notice>{t(`Buyers can request a refund within ${settings.commerce.refundWindowDays} days of payment. Orders with an open request are held from settlement until you decide.`, `구매자는 결제 후 ${settings.commerce.refundWindowDays}일 이내에 환불을 요청할 수 있습니다. 요청이 처리될 때까지 해당 주문은 정산에서 보류됩니다.`)}</Notice>
      </div>
      <Panel title={<>{t("Waiting for a decision", "처리 대기")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <OrderTable mode="refunds" rows={rows} t={t} lang={lang} empty={t("No refund requests.", "환불 요청이 없습니다.")} footer={total > size ? <Pagination total={total} page={page} size={size} /> : undefined} />
      </Panel>
    </>
  );
}
