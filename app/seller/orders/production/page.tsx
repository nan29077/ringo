import { and, asc, count, eq, inArray, lt, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { PageHeader, Panel, StatCard } from "@/components/console/ui";
import { Pagination } from "@/components/console/filters";
import { OrderTable } from "../order-table";

export const metadata = { title: "Orders to make" };

export default async function SellerProduction({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp, 50);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const base = and(eq(s.orders.sellerId, viewer.seller.id), eq(s.orders.status, "paid"), inArray(s.orders.fulfillmentStatus, ["pending", "in_progress"]));
  const [rows, [{ total }], [{ overdue }], [{ waiting }]] = await Promise.all([
    db.select().from(s.orders).where(base).orderBy(sql`${s.orders.dueAt} asc nulls last`, asc(s.orders.paidAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.orders).where(base),
    db.select({ overdue: count() }).from(s.orders).where(and(base, lt(s.orders.dueAt, new Date()))),
    db.select({ waiting: count() }).from(s.orders).where(and(base, eq(s.orders.fulfillmentStatus, "pending"))),
  ]);
  return (
    <>
      <PageHeader title={t("Orders to make", "제작할 주문")} description={t("Paid service orders that still need delivery, earliest due date first.", "납품이 필요한 결제 완료 제작 주문입니다. 납기일이 빠른 순으로 표시됩니다.")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Open service orders", "진행할 제작 주문")} value={total} />
        <StatCard label={t("Not started", "제작 대기")} value={waiting} />
        <StatCard label={t("Overdue", "납기 지연")} value={overdue} tone={overdue ? "warn" : "default"} />
      </div>
      <Panel title={t("Orders to deliver", "납품할 주문")} bodyClass="p-0">
        <OrderTable mode="production" rows={rows} t={t} lang={lang} empty={t("Nothing to produce right now.", "지금 제작할 주문이 없습니다.")} footer={total > size ? <Pagination total={total} page={page} size={size} /> : undefined} />
      </Panel>
    </>
  );
}
