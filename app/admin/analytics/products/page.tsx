import Link from "next/link";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { daysAgo } from "@/lib/server/analytics";
import { analyticsRange } from "@/lib/server/admin-catalog";
import { mediaUrl } from "@/lib/server/storage";
import { one, type SP } from "@/lib/server/list";
import { formatDate, formatMoney } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, StatCard } from "@/components/console/ui";
import { AnalyticsNav, ShareBar } from "../range-tabs";

export const metadata = { title: "Product report" };

export default async function AdminProductAnalytics({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { days, from } = analyticsRange(sp);
  const deadDays = one(sp, "dead") === "90" ? 90 : 30;
  const sort = one(sp, "sort") === "units" ? "units" : "revenue";
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const cur = (await getSettings(db)).site.currency;

  const units = sql<number>`count(*)::int`;
  const revenue = sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int`;
  const top = await db
    .select({
      id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo, cover: s.products.coverKey, seller: s.sellers.displayName, price: s.products.priceCents,
      units, revenue,
      refunds: sql<number>`count(*) filter (where ${s.orders.status} = 'refunded')::int`,
      linkOrders: sql<number>`count(*) filter (where ${s.orders.linkId} is not null)::int`,
    })
    .from(s.orders)
    .innerJoin(s.products, eq(s.products.id, s.orders.productId))
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .where(and(isNotNull(s.orders.paidAt), gte(s.orders.paidAt, from)))
    .groupBy(s.products.id, s.sellers.displayName)
    .orderBy(sort === "units" ? desc(units) : desc(revenue), desc(revenue))
    .limit(50);

  const ids = top.map((p) => p.id);
  const recentFrom = daysAgo(deadDays);
  const [lifetimeClicks, rangeClicks, dead, [published], [sold]] = await Promise.all([
    ids.length
      ? db.select({ productId: s.deepLinks.productId, clicks: sql<number>`coalesce(sum(${s.deepLinks.clicks}),0)::int` }).from(s.deepLinks).where(inArray(s.deepLinks.productId, ids)).groupBy(s.deepLinks.productId)
      : Promise.resolve([]),
    ids.length
      ? db.select({ productId: s.deepLinks.productId, clicks: sql<number>`count(*)::int` }).from(s.linkClicks).innerJoin(s.deepLinks, eq(s.deepLinks.id, s.linkClicks.linkId)).where(and(inArray(s.deepLinks.productId, ids), gte(s.linkClicks.createdAt, from))).groupBy(s.deepLinks.productId)
      : Promise.resolve([]),
    db
      .select({
        id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo, cover: s.products.coverKey, seller: s.sellers.displayName, price: s.products.priceCents, publishedAt: s.products.publishedAt,
        lastSale: sql<string | null>`max(${s.orders.paidAt})`,
        lifetime: s.products.salesCount,
      })
      .from(s.products)
      .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
      .leftJoin(s.orders, and(eq(s.orders.productId, s.products.id), isNotNull(s.orders.paidAt)))
      .where(eq(s.products.status, "published"))
      .groupBy(s.products.id, s.sellers.displayName)
      .having(sql`max(${s.orders.paidAt}) is null or max(${s.orders.paidAt}) < ${recentFrom.toISOString()}::timestamptz`)
      .orderBy(s.products.publishedAt)
      .limit(100),
    db.select({ n: sql<number>`count(*)::int` }).from(s.products).where(eq(s.products.status, "published")),
    db.select({ n: sql<number>`count(distinct ${s.orders.productId})::int` }).from(s.orders).where(and(isNotNull(s.orders.paidAt), gte(s.orders.paidAt, from))),
  ]);
  const totals = { published: published.n, sold: sold.n };
  const rangeMap = new Map(rangeClicks.map((c) => [c.productId, c.clicks]));
  const clicks = lifetimeClicks.map((c) => ({ productId: c.productId, clicks: c.clicks, rangeClicks: rangeMap.get(c.productId) ?? 0 }));
  const clickMap = new Map(clicks.map((c) => [c.productId, c]));
  const maxVal = Math.max(0, ...top.map((p) => (sort === "units" ? p.units : p.revenue)));
  const unitsTotal = top.reduce((a, p) => a + p.units, 0);
  const revenueTotal = top.reduce((a, p) => a + p.revenue, 0);
  const qs = (patch: Record<string, string>) => "?" + new URLSearchParams({ range: String(days), sort, dead: String(deadDays), ...patch }).toString();

  return (
    <>
      <PageHeader title={t("Product report", "상품 통계")} description={t("Best sellers for the period, sales-link conversion and products that stopped selling.", "기간 내 잘 팔린 상품, 판매 링크 전환, 판매가 멈춘 상품을 확인합니다.")} />
      <AnalyticsNav path="/admin/analytics/products" days={days} t={t} extra={`&sort=${sort}&dead=${deadDays}`} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Products on sale", "판매중 상품")} value={totals.published} />
        <StatCard label={t("Products with sales", "판매 발생 상품")} value={totals.sold} hint={t(`Last ${days} days`, `최근 ${days}일`)} />
        <StatCard label={t("Units sold (top 50)", "판매 수량 (상위 50)")} value={unitsTotal} hint={formatMoney(revenueTotal, cur, lang)} />
        <StatCard label={t(`No sales in ${deadDays} days`, `${deadDays}일간 판매 없음`)} value={dead.length >= 100 ? "100+" : dead.length} tone={dead.length ? "warn" : "default"} />
      </div>

      <Panel
        title={t(`Top products · last ${days} days`, `상위 상품 · 최근 ${days}일`)}
        description={t("Paid orders (incl. later refunded). Link clicks: in period / lifetime.", "결제 완료 주문 기준 (이후 환불 포함). 링크 클릭: 기간 내 / 누적.")}
        className="mb-4"
        bodyClass="p-0"
        actions={
          <div className="rc-segment">
            <Link href={qs({ sort: "revenue" })} className={`inline-block px-3 py-1.5 text-xs ${sort === "revenue" ? "bg-[#1c1d22] text-white" : "text-[#5b5e68]"}`}>{t("By revenue", "매출순")}</Link>
            <Link href={qs({ sort: "units" })} className={`inline-block px-3 py-1.5 text-xs ${sort === "units" ? "bg-[#1c1d22] text-white" : "text-[#5b5e68]"}`}>{t("By units", "수량순")}</Link>
          </div>
        }
      >
        <DataTable head={["#", t("Product", "상품"), sort === "units" ? t("Units", "판매 수량") : t("Revenue", "매출"), "", sort === "units" ? t("Revenue", "매출") : t("Units", "판매 수량"), t("Refunded", "환불"), t("Link clicks", "링크 클릭"), t("Link orders", "링크 결제"), t("Link conversion", "링크 전환율")]} empty={<EmptyState title={t("No sales in this period", "기간 내 판매가 없습니다")} />}>
          {top.map((p, i) => {
            const c = clickMap.get(p.id);
            const primary = sort === "units" ? p.units : p.revenue;
            return (
              <tr key={p.id}>
                <td className="text-xs font-bold text-[#b3b5bc]">{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <div className="flex items-center gap-3">
                    <img src={mediaUrl(p.cover)} alt="" className="rc-thumb !size-9" />
                    <div className="min-w-0"><Link href={`/admin/products/${p.id}`} className="block max-w-[260px] truncate font-medium hover:underline">{lang === "ko" ? p.titleKo : p.titleEn}</Link><div className="text-[11px] text-[#8a8d96]">{p.seller} · {formatMoney(p.price, cur, lang)}</div></div>
                  </div>
                </td>
                <td className="whitespace-nowrap font-semibold">{sort === "units" ? p.units : formatMoney(p.revenue, cur, lang)}</td>
                <td className="w-[140px]"><ShareBar value={primary} max={maxVal} /></td>
                <td className="whitespace-nowrap">{sort === "units" ? formatMoney(p.revenue, cur, lang) : p.units}</td>
                <td>{p.refunds || "—"}</td>
                <td className="whitespace-nowrap text-xs">{c ? `${c.rangeClicks} / ${c.clicks}` : "—"}</td>
                <td>{p.linkOrders || "—"}</td>
                <td className="text-xs">{c && c.clicks ? `${((p.linkOrders / c.clicks) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>

      <Panel
        title={t("Dead stock", "판매 부진 상품")}
        description={t(`On sale but no paid orders in the last ${deadDays} days (oldest listing first).`, `판매중이지만 최근 ${deadDays}일간 결제가 없는 상품입니다 (오래 등록된 순).`)}
        bodyClass="p-0"
        actions={
          <div className="rc-segment">
            {[30, 90].map((d) => <Link key={d} href={qs({ dead: String(d) })} className={`inline-block px-3 py-1.5 text-xs ${deadDays === d ? "bg-[#1c1d22] text-white" : "text-[#5b5e68]"}`}>{t(`${d} days`, `${d}일`)}</Link>)}
          </div>
        }
      >
        <DataTable head={[t("Product", "상품"), t("Price", "판매가"), t("On sale since", "판매 시작일"), t("Last sale", "최근 판매일"), t("Lifetime sales", "누적 판매")]} empty={<EmptyState title={t("Every product on sale has recent orders", "모든 판매중 상품에 최근 주문이 있습니다")} />}>
          {dead.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="flex items-center gap-3">
                  <img src={mediaUrl(p.cover)} alt="" className="rc-thumb !size-9" />
                  <div className="min-w-0"><Link href={`/admin/products/${p.id}`} className="block max-w-[320px] truncate font-medium hover:underline">{lang === "ko" ? p.titleKo : p.titleEn}</Link><div className="text-[11px] text-[#8a8d96]">{p.seller}</div></div>
                </div>
              </td>
              <td className="whitespace-nowrap">{formatMoney(p.price, cur, lang)}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(p.publishedAt, lang)}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{p.lastSale ? formatDate(p.lastSale, lang) : t("Never", "판매 없음")}</td>
              <td>{p.lifetime}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
