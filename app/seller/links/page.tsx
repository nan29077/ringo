import Link from "next/link";
import { and, count, desc, eq, gt, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { isUuid } from "@/lib/server/seller-center";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, type SP } from "@/lib/server/list";
import { linkState, linkStats } from "@/lib/server/links";
import { appOrigin } from "@/lib/server/request";
import { getSettings } from "@/lib/server/settings";
import { formatDate, formatMoney } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, Badge, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { ActionButton } from "@/components/common/action-form";
import { CopyButton } from "@/components/console/copy-button";
import { sellerToggleLink } from "./actions";

export const metadata = { title: "Deep links" };

export default async function SellerLinks({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const origin = await appOrigin();
  const sellerId = viewer.seller.id;

  const where: (SQL | undefined)[] = [eq(s.deepLinks.sellerId, sellerId)];
  if (q) where.push(or(ilike(s.deepLinks.name, likeQ(q)), ilike(s.deepLinks.code, likeQ(q)), ilike(s.deepLinks.campaign, likeQ(q)), ilike(s.deepLinks.source, likeQ(q))));
  const state = one(sp, "state");
  if (state === "paused") where.push(eq(s.deepLinks.status, "paused"));
  if (state === "active") where.push(eq(s.deepLinks.status, "active"), or(isNull(s.deepLinks.expiresAt), gt(s.deepLinks.expiresAt, new Date())));
  if (state === "expired") where.push(eq(s.deepLinks.status, "active"), lte(s.deepLinks.expiresAt, new Date()));
  // A non-UUID value would make Postgres reject the whole query, so an unusable filter is ignored.
  if (isUuid(one(sp, "product"))) where.push(eq(s.deepLinks.productId, one(sp, "product")));
  const cond = and(...where);

  const [rows, [{ total }], products, [totals]] = await Promise.all([
    db.select({ l: s.deepLinks, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.deepLinks).innerJoin(s.products, eq(s.products.id, s.deepLinks.productId)).where(cond).orderBy(desc(s.deepLinks.createdAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.deepLinks).where(cond),
    db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.products).where(eq(s.products.sellerId, sellerId)).orderBy(s.products.titleEn),
    db
      .select({
        clicks: sql<number>`coalesce(sum(${s.deepLinks.clicks}),0)::int`,
        links: sql<number>`count(*)::int`,
        orders: sql<number>`(select count(*) from ${s.orders} where ${s.orders.sellerId} = ${sellerId} and ${s.orders.linkId} is not null and ${s.orders.status} = 'paid')::int`,
        cents: sql<number>`(select coalesce(sum(${s.orders.totalCents}),0) from ${s.orders} where ${s.orders.sellerId} = ${sellerId} and ${s.orders.linkId} is not null and ${s.orders.status} = 'paid')::int`,
      })
      .from(s.deepLinks)
      .where(eq(s.deepLinks.sellerId, sellerId)),
  ]);
  const stats = await linkStats(db, rows.map((r) => r.l.id));
  const currency = (await getSettings(db)).site.currency;
  const stateTone = { active: "green", paused: "gray", expired: "amber" } as const;
  const stateLabel = { active: t("Active", "활성"), paused: t("Paused", "일시중지"), expired: t("Expired", "만료") };

  return (
    <>
      <PageHeader
        title={t("Deep links", "딥링크")}
        description={t("Trackable links for social posts, newsletters and ads. See clicks, orders and revenue per link.", "SNS, 뉴스레터, 광고용 추적 링크입니다. 링크별 클릭, 주문, 매출을 확인하세요.")}
        actions={<Link href="/seller/links/new" className="rc-btn rc-btn-brand"><Plus />{t("Create link", "링크 만들기")}</Link>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Links", "링크 수")} value={totals.links} />
        <StatCard label={t("Total clicks", "총 클릭")} value={totals.clicks.toLocaleString()} />
        <StatCard label={t("Paid orders via links", "링크 경유 결제")} value={totals.orders} hint={totals.clicks ? t(`Conversion ${((totals.orders / totals.clicks) * 100).toFixed(1)}%`, `전환율 ${((totals.orders / totals.clicks) * 100).toFixed(1)}%`) : undefined} />
        <StatCard label={t("Revenue via links", "링크 경유 매출")} value={formatMoney(totals.cents, currency, lang)} tone="good" />
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Name, code, source or campaign", "링크 이름, 코드, 소스, 캠페인"] },
          { type: "select", name: "state", label: ["State", "상태"], options: [{ value: "active", en: "Active", ko: "활성" }, { value: "paused", en: "Paused", ko: "일시중지" }, { value: "expired", en: "Expired", ko: "만료" }] },
          { type: "select", name: "product", label: ["Product", "상품"], options: products.map((p) => ({ value: p.id, en: p.titleEn, ko: p.titleKo })) },
        ]}
      />
      <Panel title={<>{t("Links", "링크")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Link", "링크"), t("Product", "상품"), t("Tracking", "유입 추적"), t("Options", "옵션"), t("State", "상태"), t("Clicks", "클릭"), t("Orders", "주문"), t("Revenue", "매출"), ""]}
          empty={<EmptyState title={t("No deep links yet", "딥링크가 없습니다")} description={t("Create a link for each channel to see which one sells.", "채널별로 링크를 만들어 어떤 채널에서 판매되는지 확인하세요.")} action={<Link href="/seller/links/new" className="rc-btn rc-btn-outline rc-btn-sm"><Plus />{t("Create link", "링크 만들기")}</Link>} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ l, titleEn, titleKo }) => {
            const url = `${origin}/l/${l.code}`;
            const st = linkState(l);
            const stat = stats.get(l.id) ?? { orders: 0, cents: 0 };
            return (
              <tr key={l.id}>
                <td>
                  <Link href={`/seller/links/${l.id}`} className="font-semibold hover:underline">{l.name}</Link>
                  <div className="mt-1 flex items-center gap-1.5">
                    <code className="max-w-[220px] truncate rounded bg-[#f3f4f7] px-1.5 py-0.5 text-[11px] text-[#3b3d46]">{url}</code>
                    <CopyButton value={url} className="!h-6 !px-1.5" />
                  </div>
                </td>
                <td className="max-w-[180px] truncate text-xs">{lang === "ko" ? titleKo : titleEn}</td>
                <td className="text-xs"><div>{l.source} / {l.medium}</div><div className="text-[#8a8d96]">{l.campaign ?? "—"}</div></td>
                <td className="text-[11px] text-[#5b5e68]">
                  <div>{l.destination === "checkout" ? t("Checkout", "바로 결제") : t("Product page", "상품 페이지")} · {l.locale.toUpperCase()}</div>
                  {l.couponCode && <div>{t("Coupon", "쿠폰")}: <b>{l.couponCode}</b></div>}
                  <div className="text-[#8a8d96]">{l.expiresAt ? t(`Expires ${formatDate(l.expiresAt, lang)}`, `${formatDate(l.expiresAt, lang)} 만료`) : t("No expiry", "만료 없음")}</div>
                </td>
                <td><Badge tone={stateTone[st]}>{stateLabel[st]}</Badge></td>
                <td className="font-medium">{l.clicks.toLocaleString()}</td>
                <td>{stat.orders}{l.clicks > 0 && <div className="text-[11px] text-[#8a8d96]">{((stat.orders / l.clicks) * 100).toFixed(1)}%</div>}</td>
                <td className="whitespace-nowrap font-medium">{formatMoney(stat.cents, currency, lang)}</td>
                <td className="whitespace-nowrap text-right">
                  <Link href={`/seller/links/${l.id}`} className="rc-btn rc-btn-outline rc-btn-sm mr-1">{t("Edit", "수정")}</Link>
                  <ActionButton action={sellerToggleLink.bind(null, l.id)}>{l.status === "active" ? t("Pause", "중지") : t("Resume", "재개")}</ActionButton>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
