import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, or, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { toLocalInput } from "@/lib/server/seller-center";
import { isUuid } from "@/lib/server/admin-catalog";
import { formatDate, formatMoney } from "@/lib/i18n";
import { orderStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, DetailList, StatCard, Badge, Notice } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton } from "@/components/common/action-form";
import { AdminCouponForm } from "../coupon-form";
import { adminToggleCoupon } from "../actions";

export const metadata = { title: "Coupon" };

export default async function AdminCouponDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [row] = await db
    .select({ c: s.coupons, seller: s.sellers.displayName, titleEn: s.products.titleEn, titleKo: s.products.titleKo })
    .from(s.coupons)
    .leftJoin(s.sellers, eq(s.sellers.id, s.coupons.sellerId))
    .leftJoin(s.products, eq(s.products.id, s.coupons.productId))
    .where(eq(s.coupons.id, id));
  if (!row) notFound();
  const coupon = row.c;
  const platform = !coupon.sellerId;
  const [orders, [stats], products, settings] = await Promise.all([
    db.select().from(s.orders).where(eq(s.orders.couponId, id)).orderBy(desc(s.orders.createdAt)).limit(30),
    db
      .select({
        paid: sql<number>`count(*) filter (where ${s.orders.status} = 'paid')::int`,
        discount: sql<number>`coalesce(sum(${s.orders.discountCents}) filter (where ${s.orders.status} = 'paid'),0)::int`,
        revenue: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.status} = 'paid'),0)::int`,
        refunded: sql<number>`count(*) filter (where ${s.orders.status} = 'refunded')::int`,
      })
      .from(s.orders)
      .where(eq(s.orders.couponId, id)),
    platform
      ? db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo, seller: s.sellers.displayName }).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).where(coupon.productId ? or(eq(s.products.status, "published"), eq(s.products.id, coupon.productId)) : eq(s.products.status, "published")).orderBy(s.products.titleEn).limit(1000)
      : Promise.resolve([]),
    getSettings(db),
  ]);
  const cur = settings.site.currency;

  return (
    <>
      <PageHeader
        title={coupon.code}
        description={coupon.name}
        crumbs={[{ href: "/admin/coupons", label: t("Coupons", "쿠폰 관리") }, { label: coupon.code }]}
        actions={
          <>
            {platform ? <Badge tone="violet">{t("Platform coupon", "플랫폼 쿠폰")}</Badge> : <Badge tone="blue">{t("Seller coupon", "판매자 쿠폰")}</Badge>}
            <ActionButton action={adminToggleCoupon.bind(null, coupon.id)} confirm={coupon.active ? t("Deactivate this coupon?", "쿠폰을 비활성화할까요?") : undefined}>{coupon.active ? t("Deactivate", "비활성화") : t("Activate", "활성화")}</ActionButton>
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Used", "사용 횟수")} value={`${coupon.usedCount}${coupon.usageLimit != null ? ` / ${coupon.usageLimit}` : ""}`} />
        <StatCard label={t("Paid orders", "결제 주문")} value={stats.paid} hint={t(`${stats.refunded} refunded`, `환불 ${stats.refunded}건`)} />
        <StatCard label={t("Discount given", "할인 금액")} value={formatMoney(stats.discount, cur, lang)} />
        <StatCard label={t("Revenue with coupon", "쿠폰 사용 매출")} value={formatMoney(stats.revenue, cur, lang)} tone="good" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        {platform ? (
          <AdminCouponForm coupon={coupon} products={products} currency={cur} startsValue={toLocalInput(coupon.startsAt)} endsValue={toLocalInput(coupon.endsAt)} />
        ) : (
          <Panel title={t("Coupon terms", "쿠폰 조건")} className="self-start">
            <div className="mb-4"><Notice>{t("Seller coupons are edited by the seller. Operators can activate or deactivate them.", "판매자 쿠폰은 판매자가 수정합니다. 운영자는 활성/비활성만 변경할 수 있습니다.")}</Notice></div>
            <DetailList
              items={[
                [t("Seller", "판매자"), <Link key="s" href={`/admin/sellers/${coupon.sellerId}`} className="text-[#2f4ac2] hover:underline">{row.seller}</Link>],
                [t("Discount", "할인"), coupon.kind === "percent" ? `${coupon.value}%${coupon.maxDiscountCents != null ? ` (${t("max", "최대")} ${formatMoney(coupon.maxDiscountCents, cur, lang)})` : ""}` : formatMoney(coupon.value, cur, lang)],
                [t("Applies to", "적용 상품"), coupon.productId ? <Link key="p" href={`/admin/products/${coupon.productId}`} className="text-[#2f4ac2] hover:underline">{lang === "ko" ? row.titleKo : row.titleEn}</Link> : t("All seller products", "판매자 전체 상품")],
                [t("Minimum order", "최소 주문 금액"), formatMoney(coupon.minOrderCents, cur, lang)],
                [t("Limits", "사용 제한"), t(`${coupon.usageLimit ?? "Unlimited"} total · ${coupon.perUserLimit} per buyer`, `전체 ${coupon.usageLimit ?? "무제한"} · 1인 ${coupon.perUserLimit}회`)],
                [t("Period", "기간"), coupon.startsAt || coupon.endsAt ? `${formatDate(coupon.startsAt, lang, true)} ~ ${formatDate(coupon.endsAt, lang, true)}` : t("Always", "상시")],
                [t("State", "상태"), coupon.active ? <Badge key="a" tone="green">{t("Active", "사용 가능")}</Badge> : <Badge key="a">{t("Inactive", "비활성")}</Badge>],
                [t("Created", "생성일"), formatDate(coupon.createdAt, lang, true)],
              ]}
            />
          </Panel>
        )}
        <Panel title={t("Orders with this coupon", "쿠폰 사용 주문")} description={t("Latest 30", "최근 30건")} bodyClass="p-0" className="self-start">
          <DataTable head={[t("Order", "주문번호"), t("Discount", "할인"), t("Paid", "결제액"), t("Status", "상태")]} empty={<EmptyState title={t("Not used yet", "아직 사용되지 않았습니다")} />}>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{o.buyerName} · {formatDate(o.createdAt, lang)}</div></td>
                <td className="whitespace-nowrap">-{formatMoney(o.discountCents, o.currency, lang)}</td>
                <td className="whitespace-nowrap">{formatMoney(o.totalCents, o.currency, lang)}</td>
                <td><StatusBadge map={orderStatus} value={o.status} lang={lang} /></td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </>
  );
}
