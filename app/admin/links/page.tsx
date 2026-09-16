import Link from "next/link";
import { and, count, desc, eq, gt, ilike, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { linkState, linkStats } from "@/lib/server/links";
import { appOrigin } from "@/lib/server/request";
import { getSettings } from "@/lib/server/settings";
import { isUuid } from "@/lib/server/admin-catalog";
import { formatDate, formatMoney } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, Badge, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { ActionButton } from "@/components/common/action-form";
import { CopyButton } from "@/components/console/copy-button";
import { adminToggleLink } from "./actions";

export const metadata = { title: "Deep links" };

export default async function AdminLinks({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const origin = await appOrigin();
  const now = new Date();

  const where: (SQL | undefined)[] = [periodWhere(s.deepLinks.createdAt, sp)];
  if (q) where.push(or(ilike(s.deepLinks.name, likeQ(q)), ilike(s.deepLinks.code, likeQ(q)), ilike(s.deepLinks.campaign, likeQ(q)), ilike(s.products.titleEn, likeQ(q)), ilike(s.products.titleKo, likeQ(q))));
  const state = one(sp, "state");
  if (state === "paused") where.push(eq(s.deepLinks.status, "paused"));
  if (state === "active") where.push(eq(s.deepLinks.status, "active"), or(isNull(s.deepLinks.expiresAt), gt(s.deepLinks.expiresAt, now)));
  if (state === "expired") where.push(eq(s.deepLinks.status, "active"), lte(s.deepLinks.expiresAt, now));
  if (isUuid(one(sp, "seller"))) where.push(eq(s.deepLinks.sellerId, one(sp, "seller")));
  if (one(sp, "source")) where.push(eq(s.deepLinks.source, one(sp, "source")));
  const cond = and(...where);

  const [rows, [{ total }], sellers, sources, [totals], currency] = await Promise.all([
    db
      .select({ l: s.deepLinks, titleEn: s.products.titleEn, titleKo: s.products.titleKo, productStatus: s.products.status, seller: s.sellers.displayName })
      .from(s.deepLinks)
      .innerJoin(s.products, eq(s.products.id, s.deepLinks.productId))
      .innerJoin(s.sellers, eq(s.sellers.id, s.deepLinks.sellerId))
      .where(cond)
      .orderBy(desc(s.deepLinks.clicks), desc(s.deepLinks.createdAt))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.deepLinks).innerJoin(s.products, eq(s.products.id, s.deepLinks.productId)).where(cond),
    db.select({ id: s.sellers.id, name: s.sellers.displayName }).from(s.sellers).orderBy(s.sellers.displayName),
    db.selectDistinct({ source: s.deepLinks.source }).from(s.deepLinks).orderBy(s.deepLinks.source),
    db
      .select({
        links: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${s.deepLinks.status} = 'active' and (${s.deepLinks.expiresAt} is null or ${s.deepLinks.expiresAt} > now()))::int`,
        clicks: sql<number>`coalesce(sum(${s.deepLinks.clicks}),0)::int`,
        orders: sql<number>`(select count(*) from ${s.orders} where ${isNotNull(s.orders.linkId)} and ${s.orders.status} = 'paid')::int`,
        cents: sql<number>`(select coalesce(sum(${s.orders.totalCents}),0) from ${s.orders} where ${isNotNull(s.orders.linkId)} and ${s.orders.status} = 'paid')::int`,
      })
      .from(s.deepLinks),
    getSettings(db).then((x) => x.site.currency),
  ]);
  const stats = await linkStats(db, rows.map((r) => r.l.id));
  const stateTone = { active: "green", paused: "gray", expired: "amber" } as const;
  const stateLabel = { active: t("Active", "활성"), paused: t("Paused", "일시중지"), expired: t("Expired", "만료") };
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

  return (
    <>
      <PageHeader title={t("Deep links", "딥링크 현황")} description={t("Trackable selling links created by sellers. Clicks, paid orders and revenue per link.", "판매자가 만든 추적 링크 전체 현황입니다. 링크별 클릭, 결제 주문, 매출을 확인합니다.")} actions={<Link href="/admin/analytics/traffic" className="rc-btn rc-btn-outline">{t("Traffic report", "유입 경로 통계")}</Link>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Links", "링크 수")} value={totals.links} hint={t(`${totals.active} active`, `활성 ${totals.active}`)} />
        <StatCard label={t("Total clicks", "총 클릭")} value={totals.clicks.toLocaleString()} />
        <StatCard label={t("Paid orders via links", "링크 경유 결제")} value={totals.orders} hint={t(`Conversion ${pct(totals.orders, totals.clicks)}`, `전환율 ${pct(totals.orders, totals.clicks)}`)} />
        <StatCard label={t("Revenue via links", "링크 경유 매출")} value={formatMoney(totals.cents, currency, lang)} tone="good" />
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Link name, code, campaign or product", "링크 이름, 코드, 캠페인, 상품명"] },
          { type: "select", name: "seller", label: ["Seller", "판매자"], options: sellers.map((x) => ({ value: x.id, en: x.name, ko: x.name })) },
          { type: "select", name: "state", label: ["State", "상태"], options: [{ value: "active", en: "Active", ko: "활성" }, { value: "paused", en: "Paused", ko: "일시중지" }, { value: "expired", en: "Expired", ko: "만료" }] },
          { type: "select", name: "source", label: ["Source", "유입 소스"], options: sources.map((x) => ({ value: x.source, en: x.source, ko: x.source })) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Links", "링크")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} description={t("Sorted by clicks", "클릭 많은 순")} bodyClass="p-0">
        <DataTable
          head={[t("Link", "링크"), t("Seller · product", "판매자 · 상품"), t("Tracking", "유입 추적"), t("State", "상태"), t("Clicks", "클릭"), t("Paid orders", "결제"), t("Conversion", "전환율"), t("Revenue", "매출"), t("Created", "생성일"), ""]}
          empty={<EmptyState title={t("No deep links match these filters", "조건에 맞는 딥링크가 없습니다")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ l, titleEn, titleKo, productStatus, seller }) => {
            const url = `${origin}/l/${l.code}`;
            const st = linkState(l);
            const stat = stats.get(l.id) ?? { orders: 0, cents: 0 };
            return (
              <tr key={l.id}>
                <td>
                  <div className="max-w-[220px] truncate font-semibold">{l.name}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <code className="max-w-[200px] truncate rounded bg-[#f3f4f7] px-1.5 py-0.5 text-[11px] text-[#3b3d46]">{url}</code>
                    <CopyButton value={url} className="!h-6 !px-1.5" />
                  </div>
                </td>
                <td className="max-w-[200px]">
                  <Link href={`/admin/sellers/${l.sellerId}`} className="block truncate text-xs font-medium hover:underline">{seller}</Link>
                  <Link href={`/admin/products/${l.productId}`} className="block truncate text-[11px] text-[#6b6e78] hover:underline">{lang === "ko" ? titleKo : titleEn}</Link>
                  {productStatus !== "published" && <Badge tone="amber">{t("Product not on sale", "상품 판매중 아님")}</Badge>}
                </td>
                <td className="text-xs"><div>{l.source} / {l.medium}</div><div className="text-[#8a8d96]">{l.campaign ?? "—"}{l.couponCode ? ` · ${l.couponCode}` : ""}</div></td>
                <td><Badge tone={stateTone[st]}>{stateLabel[st]}</Badge>{l.expiresAt && <div className="mt-0.5 text-[10px] text-[#8a8d96]">~{formatDate(l.expiresAt, lang)}</div>}</td>
                <td className="font-medium">{l.clicks.toLocaleString()}</td>
                <td>{stat.orders}</td>
                <td className="text-xs">{pct(stat.orders, l.clicks)}</td>
                <td className="whitespace-nowrap font-medium">{formatMoney(stat.cents, currency, lang)}</td>
                <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(l.createdAt, lang)}</td>
                <td className="text-right">
                  <ActionButton action={adminToggleLink.bind(null, l.id)} confirm={l.status === "active" ? t("Pause this link?", "이 링크를 일시중지할까요?") : undefined}>{l.status === "active" ? t("Pause", "중지") : t("Resume", "재개")}</ActionButton>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
