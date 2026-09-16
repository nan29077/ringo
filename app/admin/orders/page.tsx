import { and, count, desc, eq, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { adminOrderWhere, enumOpts, knownProviders, orderProviderSql } from "@/lib/server/admin-ops";
import { formatMoney } from "@/lib/i18n";
import { getSettings } from "@/lib/server/settings";
import { fulfillmentStatus, orderStatus, refundStatus } from "@/lib/status";
import { PageHeader, Panel, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { AdminOrderTable } from "./admin-order-table";

export const metadata = { title: "Orders" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const cond = adminOrderWhere(sp);
  const [settings, sellerRows, providers, rows, [agg]] = await Promise.all([
    getSettings(db),
    db.select({ id: s.sellers.id, name: s.sellers.displayName }).from(s.sellers).orderBy(s.sellers.displayName),
    knownProviders(db),
    db
      .select({ o: s.orders, seller: s.sellers.displayName, provider: orderProviderSql })
      .from(s.orders)
      .innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId))
      .where(cond)
      .orderBy(desc(s.orders.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({
        total: count(),
        paidN: sql<number>`count(*) filter (where ${s.orders.status} = 'paid')::int`,
        paidCents: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.status} = 'paid'),0)::int`,
        commission: sql<number>`coalesce(sum(${s.orders.commissionCents}) filter (where ${s.orders.status} = 'paid'),0)::int`,
        refundedCents: sql<number>`coalesce(sum(${s.orders.refundedCents}),0)::int`,
        refundedN: sql<number>`count(*) filter (where ${s.orders.status} = 'refunded')::int`,
      })
      .from(s.orders)
      .innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId))
      .where(and(cond)),
  ]);
  const total = agg?.total ?? 0;
  const cur = settings.site.currency;

  return (
    <>
      <PageHeader title={t("All orders", "전체 주문")} description={t("Every marketplace order with payment, production, refund and attribution details.", "마켓 전체 주문의 결제·제작·환불·유입 정보를 조회하고 처리하세요.")} />
      <FilterBar
        exportHref="/admin/orders/export"
        fields={[
          { type: "search", name: "q", placeholder: ["Order no., buyer name/email, product or seller", "주문번호, 구매자 이름/이메일, 상품명, 판매자"] },
          { type: "select", name: "status", label: ["Order status", "주문상태"], options: enumOpts(orderStatus) },
          { type: "select", name: "fulfillment", label: ["Fulfillment", "제작상태"], options: enumOpts(fulfillmentStatus) },
          { type: "select", name: "refund", label: ["Refund", "환불상태"], options: [{ value: "none", en: "None", ko: "없음" }, ...enumOpts(refundStatus, ["none"])] },
          { type: "select", name: "provider", label: ["Payment", "결제수단"], options: providers.map((p) => ({ value: p, en: p, ko: p })) },
          { type: "select", name: "seller", label: ["Seller", "판매자"], options: sellerRows.map((x) => ({ value: x.id, en: x.name, ko: x.name })) },
          { type: "select", name: "basis", label: ["Date basis", "기간 기준"], options: [{ value: "created", en: "Order date", ko: "주문일" }, { value: "paid", en: "Payment date", ko: "결제일" }] },
          { type: "period" },
        ]}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Orders found", "검색된 주문")} value={total.toLocaleString()} />
        <StatCard label={t("Paid sales", "결제 완료 금액")} value={formatMoney(agg?.paidCents, cur, lang)} hint={t(`${agg?.paidN ?? 0} paid orders`, `결제 완료 ${agg?.paidN ?? 0}건`)} />
        <StatCard label={t("Commission", "플랫폼 수수료")} value={formatMoney(agg?.commission, cur, lang)} tone="good" hint={t("Paid orders only", "결제 완료 주문 기준")} />
        <StatCard label={t("Refunded", "환불 금액")} value={formatMoney(agg?.refundedCents, cur, lang)} hint={t(`${agg?.refundedN ?? 0} refunded orders`, `환불 ${agg?.refundedN ?? 0}건`)} tone={agg?.refundedN ? "warn" : "default"} />
      </div>
      <Panel title={<>{t("Orders", "주문")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <AdminOrderTable rows={rows} t={t} lang={lang} empty={t("No orders match these filters.", "조건에 맞는 주문이 없습니다.")} footer={<Pagination total={total} page={page} size={size} />} />
      </Panel>
    </>
  );
}
