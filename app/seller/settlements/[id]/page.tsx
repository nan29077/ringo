import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { isUuid } from "@/lib/server/seller-center";
import { formatDate, formatMoney } from "@/lib/i18n";
import { settlementStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, DetailList, StatCard } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";

export const metadata = { title: "Settlement" };

export default async function SellerSettlementDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSeller();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [row] = await db.select().from(s.settlements).where(and(eq(s.settlements.id, id), eq(s.settlements.sellerId, viewer.seller.id)));
  if (!row) notFound();
  const orders = await db.select().from(s.orders).where(and(eq(s.orders.settlementId, id), eq(s.orders.sellerId, viewer.seller.id))).orderBy(asc(s.orders.paidAt));
  const m = (c: number) => formatMoney(c, row.currency, lang);
  const title = `${formatDate(row.periodStart, lang)} ~ ${formatDate(row.periodEnd, lang)}`;
  return (
    <>
      <PageHeader title={t("Settlement details", "정산 상세")} description={title} crumbs={[{ href: "/seller/settlements", label: t("Settlements", "정산") }, { label: title }]} actions={<StatusBadge map={settlementStatus} value={row.status} lang={lang} />} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Gross sales", "판매액")} value={m(row.grossCents)} hint={t(`${row.orderCount} orders`, `주문 ${row.orderCount}건`)} />
        <StatCard label={t("Commission", "수수료")} value={`-${m(row.commissionCents)}`} />
        <StatCard label={t("Net payout", "지급액")} value={m(row.netCents)} tone="good" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel title={t("Included orders", "포함된 주문")} bodyClass="p-0">
          <DataTable head={[t("Order", "주문번호"), t("Product", "상품"), t("Paid", "결제일"), t("Total", "결제금액"), t("Commission", "수수료"), t("Net", "정산액")]} empty={<EmptyState title={t("No orders", "주문이 없습니다")} />}>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="whitespace-nowrap"><Link href={`/seller/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link></td>
                <td className="max-w-[240px] truncate">{o.productTitle}</td>
                <td className="whitespace-nowrap text-xs">{formatDate(o.paidAt, lang)}</td>
                <td className="whitespace-nowrap">{m(o.totalCents)}</td>
                <td className="whitespace-nowrap text-[#6b6e78]">-{m(o.commissionCents)}</td>
                <td className="whitespace-nowrap font-medium">{m(o.sellerNetCents)}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title={t("Payout", "지급 정보")} className="self-start">
          <DetailList
            items={[
              [t("Status", "상태"), <StatusBadge key="s" map={settlementStatus} value={row.status} lang={lang} />],
              [t("Created", "생성일"), formatDate(row.createdAt, lang, true)],
              [t("Paid at", "지급일"), formatDate(row.paidAt, lang, true)],
              [t("Reference", "송금 참조"), row.reference ?? "—"],
              [t("Memo", "메모"), row.memo ?? "—"],
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
