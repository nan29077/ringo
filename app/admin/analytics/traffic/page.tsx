import Link from "next/link";
import { and, desc, eq, gte, isNotNull, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { analyticsRange } from "@/lib/server/admin-catalog";
import type { SP } from "@/lib/server/list";
import { formatMoney } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, StatCard } from "@/components/console/ui";
import { AnalyticsNav, ShareBar } from "../range-tabs";

export const metadata = { title: "Traffic sources" };

export default async function AdminTrafficAnalytics({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { days, from } = analyticsRange(sp);
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const cur = (await getSettings(db)).site.currency;
  const paid = and(isNotNull(s.orders.paidAt), gte(s.orders.paidAt, from));
  const orders = sql<number>`count(*)::int`;
  const revenue = sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int`;
  const byDim = (col: SQL) =>
    db.select({ key: sql<string>`${col}`, orders, revenue, viaLink: sql<number>`count(*) filter (where ${s.orders.linkId} is not null)::int` }).from(s.orders).where(paid).groupBy(sql`1`).orderBy(desc(revenue)).limit(30);

  const [sources, mediums, campaigns, clicksBySource, topLinks, [clickTotals]] = await Promise.all([
    byDim(sql`coalesce(nullif(${s.orders.source}, ''), '(direct)')`),
    byDim(sql`coalesce(nullif(${s.orders.medium}, ''), '(none)')`),
    byDim(sql`coalesce(nullif(${s.orders.campaign}, ''), '(none)')`),
    db
      .select({
        source: s.deepLinks.source,
        links: sql<number>`count(distinct ${s.deepLinks.id})::int`,
        clicks: sql<number>`count(${s.linkClicks.id})::int`,
        visitors: sql<number>`count(distinct ${s.linkClicks.visitorHash})::int`,
      })
      .from(s.deepLinks)
      .leftJoin(s.linkClicks, and(eq(s.linkClicks.linkId, s.deepLinks.id), gte(s.linkClicks.createdAt, from)))
      .groupBy(s.deepLinks.source)
      .orderBy(desc(sql`3`)),
    db
      .select({ id: s.deepLinks.id, name: s.deepLinks.name, code: s.deepLinks.code, source: s.deepLinks.source, seller: s.sellers.displayName, lifetimeClicks: s.deepLinks.clicks, orders, revenue })
      .from(s.orders)
      .innerJoin(s.deepLinks, eq(s.deepLinks.id, s.orders.linkId))
      .innerJoin(s.sellers, eq(s.sellers.id, s.deepLinks.sellerId))
      .where(paid)
      .groupBy(s.deepLinks.id, s.sellers.displayName)
      .orderBy(desc(revenue))
      .limit(10),
    db.select({ clicks: sql<number>`count(*)::int`, visitors: sql<number>`count(distinct ${s.linkClicks.visitorHash})::int` }).from(s.linkClicks).where(gte(s.linkClicks.createdAt, from)),
  ]);
  const totalOrders = sources.reduce((a, r) => a + r.orders, 0);
  const totalRevenue = sources.reduce((a, r) => a + r.revenue, 0);
  const linkOrders = sources.reduce((a, r) => a + r.viaLink, 0);
  const linkRevenue = topLinks.reduce((a, r) => a + r.revenue, 0);

  const dimTable = (title: string, first: string, rows: typeof sources) => {
    const max = Math.max(0, ...rows.map((r) => r.revenue));
    return (
      <Panel title={title} bodyClass="p-0">
        <DataTable head={[first, t("Paid orders", "결제"), t("Revenue", "매출"), t("Share", "비중"), t("Via deep link", "딥링크 경유")]} empty={<EmptyState title={t("No paid orders in this period", "기간 내 결제가 없습니다")} />}>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="max-w-[180px] truncate font-medium"><code className="text-xs">{r.key}</code></td>
              <td>{r.orders}</td>
              <td className="whitespace-nowrap font-semibold">{formatMoney(r.revenue, cur, lang)}</td>
              <td className="w-[110px]"><ShareBar value={r.revenue} max={max} /><div className="mt-0.5 text-[10px] text-[#8a8d96]">{totalRevenue ? ((r.revenue / totalRevenue) * 100).toFixed(1) : 0}%</div></td>
              <td className="text-xs">{r.viaLink || "—"}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    );
  };

  return (
    <>
      <PageHeader title={t("Traffic sources", "유입 경로")} description={t("Where paying customers came from, based on the attribution saved at checkout (deep link or UTM-style source/medium/campaign).", "결제 시 저장된 유입 정보(딥링크 또는 source/medium/campaign) 기준으로 구매 고객의 유입 경로를 봅니다.")} />
      <AnalyticsNav path="/admin/analytics/traffic" days={days} t={t} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Paid orders", "결제 주문")} value={totalOrders} hint={formatMoney(totalRevenue, cur, lang)} />
        <StatCard label={t("Orders via deep links", "딥링크 경유 결제")} value={linkOrders} hint={t(`${totalOrders ? ((linkOrders / totalOrders) * 100).toFixed(1) : 0}% of orders · ${formatMoney(linkRevenue, cur, lang)}`, `전체의 ${totalOrders ? ((linkOrders / totalOrders) * 100).toFixed(1) : 0}% · ${formatMoney(linkRevenue, cur, lang)}`)} tone="good" />
        <StatCard label={t("Deep-link clicks", "딥링크 클릭")} value={clickTotals.clicks.toLocaleString()} hint={t(`${clickTotals.visitors} unique visitors/day`, `일별 순방문 ${clickTotals.visitors}`)} />
        <StatCard label={t("Click → order", "클릭 → 결제 전환")} value={clickTotals.clicks ? `${((linkOrders / clickTotals.clicks) * 100).toFixed(1)}%` : "—"} hint={t("Clicks recorded in this period", "기간 내 기록된 클릭 기준")} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {dimTable(t("By source", "소스별"), "source", sources)}
        {dimTable(t("By medium", "매체별"), "medium", mediums)}
        {dimTable(t("By campaign", "캠페인별"), "campaign", campaigns)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel title={t("Deep-link clicks by source", "소스별 딥링크 클릭")} description={t("Clicks recorded in the period. Unique visitors are counted per day.", "기간 내 기록된 클릭입니다. 순방문자는 일 단위로 집계됩니다.")} bodyClass="p-0">
          <DataTable head={[t("Source", "소스"), t("Links", "링크"), t("Clicks", "클릭"), t("Unique visitors", "순방문")]} empty={<EmptyState title={t("No deep links", "딥링크가 없습니다")} />}>
            {clicksBySource.map((r) => (
              <tr key={r.source}>
                <td><Link href={`/admin/links?source=${encodeURIComponent(r.source)}`} className="font-medium hover:underline"><code className="text-xs">{r.source}</code></Link></td>
                <td>{r.links}</td>
                <td className="font-semibold">{r.clicks}</td>
                <td>{r.visitors}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title={t("Top deep links by revenue", "매출 상위 딥링크")} bodyClass="p-0" actions={<Link href="/admin/links" className="rc-btn rc-btn-outline rc-btn-sm">{t("All links", "전체 링크")}</Link>}>
          <DataTable head={[t("Link", "링크"), t("Seller", "판매자"), t("Paid orders", "결제"), t("Revenue", "매출"), t("Lifetime clicks", "누적 클릭")]} empty={<EmptyState title={t("No orders via deep links in this period", "기간 내 딥링크 경유 결제가 없습니다")} />}>
            {topLinks.map((l) => (
              <tr key={l.id}>
                <td className="max-w-[240px]"><div className="truncate font-medium">{l.name}</div><div className="text-[11px] text-[#8a8d96]">/l/{l.code} · {l.source}</div></td>
                <td className="whitespace-nowrap text-xs">{l.seller}</td>
                <td>{l.orders}</td>
                <td className="whitespace-nowrap font-semibold">{formatMoney(l.revenue, cur, lang)}</td>
                <td>{l.lifetimeClicks.toLocaleString()}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </>
  );
}
