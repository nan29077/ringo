import { and, count, eq, inArray, lt, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, one, type SP } from "@/lib/server/list";
import { orderProviderSql } from "@/lib/server/admin-ops";
import { PageHeader, Panel, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { AdminOrderTable } from "../admin-order-table";

export const metadata = { title: "Service production" };

export default async function AdminFulfillment({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp, 50);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const sellerRows = await db.select({ id: s.sellers.id, name: s.sellers.displayName }).from(s.sellers).where(eq(s.sellers.status, "active")).orderBy(s.sellers.displayName);
  const stage = one(sp, "stage");
  const seller = one(sp, "seller");
  const base = and(eq(s.orders.status, "paid"), inArray(s.orders.fulfillmentStatus, ["pending", "in_progress"]));
  const cond = and(
    base,
    stage === "pending" || stage === "in_progress" ? eq(s.orders.fulfillmentStatus, stage) : undefined,
    stage === "overdue" ? lt(s.orders.dueAt, new Date()) : undefined,
    sellerRows.some((x) => x.id === seller) ? eq(s.orders.sellerId, seller) : undefined,
  );
  const [rows, [{ total }], [stats]] = await Promise.all([
    db
      .select({ o: s.orders, seller: s.sellers.displayName, provider: orderProviderSql })
      .from(s.orders)
      .innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId))
      .where(cond)
      // overdue first, then earliest due date
      .orderBy(sql`(${s.orders.dueAt} < now()) desc`, sql`${s.orders.dueAt} asc nulls last`, s.orders.paidAt)
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.orders).where(cond),
    db
      .select({
        open: count(),
        waiting: sql<number>`count(*) filter (where ${s.orders.fulfillmentStatus} = 'pending')::int`,
        inProgress: sql<number>`count(*) filter (where ${s.orders.fulfillmentStatus} = 'in_progress')::int`,
        overdue: sql<number>`count(*) filter (where ${s.orders.dueAt} < now())::int`,
      })
      .from(s.orders)
      .where(base),
  ]);
  return (
    <>
      <PageHeader title={t("Service production", "제작 주문 관리")} description={t("Paid made-to-order service orders across all sellers. Overdue orders are listed first.", "전체 판매자의 결제 완료 제작 주문입니다. 납기가 지난 주문이 먼저 표시됩니다.")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Open service orders", "진행 중인 제작 주문")} value={stats.open} />
        <StatCard label={t("Not started", "제작 대기")} value={stats.waiting} />
        <StatCard label={t("In production", "제작 중")} value={stats.inProgress} tone="info" />
        <StatCard label={t("Overdue", "납기 지연")} value={stats.overdue} tone={stats.overdue ? "warn" : "default"} />
      </div>
      <FilterBar
        fields={[
          { type: "select", name: "stage", label: ["Stage", "진행단계"], options: [{ value: "pending", en: "Awaiting production", ko: "제작 대기" }, { value: "in_progress", en: "In production", ko: "제작 중" }, { value: "overdue", en: "Overdue", ko: "납기 지연" }] },
          { type: "select", name: "seller", label: ["Seller", "판매자"], options: sellerRows.map((x) => ({ value: x.id, en: x.name, ko: x.name })) },
        ]}
      />
      <Panel title={<>{t("Orders to deliver", "납품 대기 주문")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <AdminOrderTable mode="production" rows={rows} t={t} lang={lang} empty={t("No open service orders.", "진행 중인 제작 주문이 없습니다.")} footer={<Pagination total={total} page={page} size={size} />} />
      </Panel>
    </>
  );
}
