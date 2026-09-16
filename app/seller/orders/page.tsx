import { count, desc } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { fulfillmentStatus, orderStatus, refundStatus } from "@/lib/status";
import { PageHeader, Panel } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { sellerOrderWhere } from "./query";
import { OrderTable } from "./order-table";

export const metadata = { title: "Orders" };

const opts = (m: Record<string, { en: string; ko: string }>, skip: string[] = []) => Object.entries(m).filter(([k]) => !skip.includes(k)).map(([value, v]) => ({ value, en: v.en, ko: v.ko }));

export default async function SellerOrders({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const cond = sellerOrderWhere(viewer.seller.id, sp);
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(s.orders).where(cond).orderBy(desc(s.orders.createdAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.orders).where(cond),
  ]);
  return (
    <>
      <PageHeader title={t("All orders", "전체 주문")} description={t("Every order for your products, including payment, production and refund status.", "내 상품의 모든 주문과 결제·제작·환불 상태를 확인하세요.")} />
      <FilterBar
        exportHref="/seller/orders/export"
        fields={[
          { type: "search", name: "q", placeholder: ["Order no., buyer name/email or product", "주문번호, 구매자 이름/이메일, 상품명"] },
          { type: "select", name: "status", label: ["Order status", "주문상태"], options: opts(orderStatus) },
          { type: "select", name: "fulfillment", label: ["Fulfillment", "제작상태"], options: opts(fulfillmentStatus) },
          { type: "select", name: "refund", label: ["Refund", "환불상태"], options: [{ value: "none", en: "None", ko: "없음" }, ...opts(refundStatus, ["none"])] },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Orders", "주문")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <OrderTable rows={rows} t={t} lang={lang} empty={t("No orders match these filters.", "조건에 맞는 주문이 없습니다.")} footer={<Pagination total={total} page={page} size={size} />} />
      </Panel>
    </>
  );
}
