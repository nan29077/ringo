import Link from "next/link";
import { desc, eq, gte, and, isNotNull, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { dailySales, salesSummary, TZ } from "@/lib/server/analytics";
import { analyticsRange } from "@/lib/server/admin-catalog";
import type { SP } from "@/lib/server/list";
import { formatMoney } from "@/lib/i18n";
import { PageHeader, Panel, StatCard, DataTable, EmptyState } from "@/components/console/ui";
import { SalesChart } from "@/components/console/sales-chart";
import { AnalyticsNav, ShareBar } from "./range-tabs";

export const metadata = { title: "Sales analytics" };

export default async function AdminSalesAnalytics({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { days, from } = analyticsRange(sp);
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const cur = (await getSettings(db)).site.currency;
  const paidInRange = and(isNotNull(s.orders.paidAt), gte(s.orders.paidAt, from));
  const agg = {
    gross: sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int`,
    orders: sql<number>`count(*)::int`,
    commission: sql<number>`coalesce(sum(${s.orders.commissionCents}) filter (where ${s.orders.status} <> 'refunded'),0)::int`,
    refunds: sql<number>`coalesce(sum(${s.orders.refundedCents}),0)::int`,
    refundCount: sql<number>`count(*) filter (where ${s.orders.status} = 'refunded')::int`,
  };

  const [series, summary, byCategory, bySeller] = await Promise.all([
    dailySales(db, days),
    salesSummary(db, from),
    db.select({ id: s.categories.id, nameEn: s.categories.nameEn, nameKo: s.categories.nameKo, ...agg }).from(s.orders).innerJoin(s.products, eq(s.products.id, s.orders.productId)).innerJoin(s.categories, eq(s.categories.id, s.products.categoryId)).where(paidInRange).groupBy(s.categories.id).orderBy(desc(agg.gross)),
    db.select({ id: s.sellers.id, name: s.sellers.displayName, ...agg }).from(s.orders).innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId)).where(paidInRange).groupBy(s.sellers.id).orderBy(desc(agg.gross)),
  ]);

  const aov = summary.orders ? Math.round(summary.gross / summary.orders) : 0;
  // Table: daily for ≤ 90 days, monthly for a year.
  const table = days > 90
    ? Object.values(series.reduce<Record<string, { date: string; cents: number; net: number; orders: number }>>((acc, d) => {
        const k = d.date.slice(0, 7);
        acc[k] ??= { date: k, cents: 0, net: 0, orders: 0 };
        acc[k].cents += d.cents; acc[k].net += d.net; acc[k].orders += d.orders;
        return acc;
      }, {})).reverse()
    : [...series].reverse();
  const catMax = Math.max(0, ...byCategory.map((r) => r.gross));
  const sellerMax = Math.max(0, ...bySeller.map((r) => r.gross));
  const breakdownHead = (first: string) => [first, t("Gross sales", "총 매출"), t("Share", "비중"), t("Orders", "주문"), t("Commission", "수수료"), t("Refunds", "환불")];

  return (
    <>
      <PageHeader title={t("Sales analytics", "매출 통계")} description={t(`Paid orders by payment time (${TZ}). Refunded orders stay in gross sales; refunds are shown separately.`, `결제 완료 시점 기준 (${TZ}). 환불된 주문도 총 매출에 포함되며 환불액은 별도로 표시합니다.`)} />
      <AnalyticsNav path="/admin/analytics" days={days} t={t} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Gross sales", "총 매출")} value={formatMoney(summary.gross, cur, lang)} hint={t(`${summary.orders} paid orders · avg ${formatMoney(aov, cur, lang)}`, `결제 ${summary.orders}건 · 객단가 ${formatMoney(aov, cur, lang)}`)} />
        <StatCard label={t("Revenue after refunds", "환불 반영 매출")} value={formatMoney(summary.revenueAfterRefunds, cur, lang)} hint={t(`Refunds ${formatMoney(summary.refundCents, cur, lang)} · ${summary.refundCount} orders`, `환불 ${formatMoney(summary.refundCents, cur, lang)} · ${summary.refundCount}건`)} />
        <StatCard label={t("Platform commission", "플랫폼 수수료")} value={formatMoney(summary.commissionAfterRefunds, cur, lang)} hint={t("After refunds", "환불 반영")} tone="good" />
        <StatCard label={t("Seller net / discounts", "판매자 정산액 / 할인")} value={formatMoney(summary.netAfterRefunds, cur, lang)} hint={t(`Coupon discounts ${formatMoney(summary.discount, cur, lang)}`, `쿠폰 할인 ${formatMoney(summary.discount, cur, lang)}`)} />
      </div>

      <Panel title={t(`Daily sales · last ${days} days`, `일별 매출 · 최근 ${days}일`)} className="mb-4">
        <SalesChart data={series} currency={cur} height={260} />
      </Panel>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Panel title={t("By category", "카테고리별")} bodyClass="p-0">
          <DataTable head={breakdownHead(t("Category", "카테고리"))} empty={<EmptyState title={t("No sales in this period", "기간 내 매출이 없습니다")} />}>
            {byCategory.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap font-medium"><Link href={`/admin/products?category=${r.id}`} className="hover:underline">{lang === "ko" ? r.nameKo : r.nameEn}</Link></td>
                <td className="whitespace-nowrap font-semibold">{formatMoney(r.gross, cur, lang)}</td>
                <td className="w-[120px]"><ShareBar value={r.gross} max={catMax} /><div className="mt-0.5 text-[10px] text-[#8a8d96]">{summary.gross ? ((r.gross / summary.gross) * 100).toFixed(1) : 0}%</div></td>
                <td>{r.orders}</td>
                <td className="whitespace-nowrap">{formatMoney(r.commission, cur, lang)}</td>
                <td className="whitespace-nowrap text-[#c0362c]">{r.refunds ? `-${formatMoney(r.refunds, cur, lang)}` : "—"}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title={t("By seller", "판매자별")} bodyClass="p-0">
          <DataTable head={breakdownHead(t("Seller", "판매자"))} empty={<EmptyState title={t("No sales in this period", "기간 내 매출이 없습니다")} />}>
            {bySeller.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap font-medium"><Link href={`/admin/sellers/${r.id}`} className="hover:underline">{r.name}</Link></td>
                <td className="whitespace-nowrap font-semibold">{formatMoney(r.gross, cur, lang)}</td>
                <td className="w-[120px]"><ShareBar value={r.gross} max={sellerMax} /><div className="mt-0.5 text-[10px] text-[#8a8d96]">{summary.gross ? ((r.gross / summary.gross) * 100).toFixed(1) : 0}%</div></td>
                <td>{r.orders}</td>
                <td className="whitespace-nowrap">{formatMoney(r.commission, cur, lang)}</td>
                <td className="whitespace-nowrap text-[#c0362c]">{r.refunds ? `-${formatMoney(r.refunds, cur, lang)}` : "—"}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>

      <Panel title={days > 90 ? t("Sales by month", "월별 매출") : t("Sales by day", "일별 매출")} bodyClass="p-0">
        <DataTable head={[days > 90 ? t("Month", "월") : t("Date", "날짜"), t("Paid orders", "결제 건수"), t("Gross sales", "총 매출"), t("Seller net", "판매자 정산액"), t("Commission (before refunds)", "수수료 (환불 반영 전)")]}>
          {table.map((d) => (
            <tr key={d.date} className={d.orders ? "" : "text-[#b3b5bc]"}>
              <td className="whitespace-nowrap font-mono text-xs">{d.date}</td>
              <td>{d.orders}</td>
              <td className="whitespace-nowrap font-medium">{formatMoney(d.cents, cur, lang)}</td>
              <td className="whitespace-nowrap">{formatMoney(d.net, cur, lang)}</td>
              <td className="whitespace-nowrap">{formatMoney(d.cents - d.net, cur, lang)}</td>
            </tr>
          ))}
          <tr className="[&>td]:!bg-[#f8f9fb] font-semibold">
            <td>{t("Total", "합계")}</td>
            <td>{series.reduce((a, d) => a + d.orders, 0)}</td>
            <td className="whitespace-nowrap">{formatMoney(series.reduce((a, d) => a + d.cents, 0), cur, lang)}</td>
            <td className="whitespace-nowrap">{formatMoney(series.reduce((a, d) => a + d.net, 0), cur, lang)}</td>
            <td className="whitespace-nowrap">{formatMoney(series.reduce((a, d) => a + d.cents - d.net, 0), cur, lang)}</td>
          </tr>
        </DataTable>
      </Panel>
    </>
  );
}
