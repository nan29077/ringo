import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { listParams, type SP } from "@/lib/server/list";
import { orderProviderSql } from "@/lib/server/admin-ops";
import { PageHeader, Panel, Notice } from "@/components/console/ui";
import { Pagination } from "@/components/console/filters";
import { AdminOrderTable } from "../admin-order-table";

export const metadata = { title: "Refund requests" };

export default async function AdminRefunds({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const settings = await getSettings(db);
  const open = and(eq(s.orders.status, "paid"), eq(s.orders.refundStatus, "requested"));
  const done = inArray(s.orders.refundStatus, ["refunded", "rejected"]);
  // The reason an admin typed lives on the refund row, not on the order, so it is pulled in here.
  const refundReasonSql = sql<string | null>`(select r.reason from ${s.refunds} r where r.order_id = ${s.orders.id} and r.status = 'succeeded' order by r.created_at desc limit 1)`;
  const select = () => db.select({ o: s.orders, seller: s.sellers.displayName, provider: orderProviderSql, processedReason: refundReasonSql }).from(s.orders).innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId));
  const [requested, recent, [{ total }]] = await Promise.all([
    select().where(open).orderBy(asc(s.orders.updatedAt)).limit(200),
    select().where(done).orderBy(desc(s.orders.updatedAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.orders).where(done),
  ]);
  return (
    <>
      <PageHeader title={t("Refund requests", "환불 요청")} description={t("Buyer refund requests across all sellers, oldest first, followed by recently processed refunds.", "전체 판매자의 환불 요청(오래된 순)과 최근 처리된 환불 내역입니다.")} />
      <div className="mb-4">
        <Notice>{t(`Buyers can request a refund within ${settings.commerce.refundWindowDays} days of payment. Open requests hold the order from settlement. Open an order to approve, reject, force a refund or record a manual PG refund.`, `구매자는 결제 후 ${settings.commerce.refundWindowDays}일 이내에 환불을 요청할 수 있으며, 요청이 열려 있는 주문은 정산에서 보류됩니다. 주문 상세에서 승인·거절·강제 환불·수동 환불 기록을 처리하세요.`)}</Notice>
      </div>
      <Panel className="mb-4" title={<>{t("Waiting for a decision", "처리 대기")} <span className="ml-1 text-[#ed4b2e]">{requested.length}</span></>} bodyClass="p-0">
        <AdminOrderTable mode="refunds" rows={requested} t={t} lang={lang} empty={t("No open refund requests.", "처리 대기 중인 환불 요청이 없습니다.")} />
      </Panel>
      <Panel title={<>{t("Recently processed", "최근 처리 내역")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <AdminOrderTable mode="refunds" rows={recent} t={t} lang={lang} empty={t("No processed refunds yet.", "처리된 환불이 없습니다.")} footer={<Pagination total={total} page={page} size={size} />} />
      </Panel>
    </>
  );
}
