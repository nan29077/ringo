import Link from "next/link";
import { and, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { likeQ, listParams, one, type SP } from "@/lib/server/list";
import { isUuid } from "@/lib/server/admin-catalog";
import { formatDate, formatMoney } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, Badge, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { ActionButton } from "@/components/common/action-form";
import { adminToggleCoupon } from "./actions";

export const metadata = { title: "Coupons" };

export default async function AdminCoupons({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const now = new Date();
  const where: (SQL | undefined)[] = [];
  if (q) where.push(or(ilike(s.coupons.code, likeQ(q)), ilike(s.coupons.name, likeQ(q))));
  const scope = one(sp, "scope");
  if (scope === "platform") where.push(isNull(s.coupons.sellerId));
  if (scope === "seller") where.push(isNotNull(s.coupons.sellerId));
  if (isUuid(one(sp, "seller"))) where.push(eq(s.coupons.sellerId, one(sp, "seller")));
  const state = one(sp, "state");
  if (state === "inactive") where.push(eq(s.coupons.active, false));
  if (state === "expired") where.push(lte(s.coupons.endsAt, now));
  if (state === "active") where.push(eq(s.coupons.active, true), or(isNull(s.coupons.endsAt), gt(s.coupons.endsAt, now)));
  const cond = and(...where);

  const [rows, [{ total }], [totals], sellers, currency] = await Promise.all([
    db
      .select({ c: s.coupons, titleEn: s.products.titleEn, titleKo: s.products.titleKo, seller: s.sellers.displayName })
      .from(s.coupons)
      .leftJoin(s.products, eq(s.products.id, s.coupons.productId))
      .leftJoin(s.sellers, eq(s.sellers.id, s.coupons.sellerId))
      .where(cond)
      .orderBy(desc(s.coupons.createdAt))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.coupons).where(cond),
    db
      .select({
        coupons: sql<number>`(select count(*) from ${s.coupons})::int`,
        active: sql<number>`(select count(*) from ${s.coupons} where ${s.coupons.active} and (${s.coupons.endsAt} is null or ${s.coupons.endsAt} > now()))::int`,
        orders: sql<number>`count(*)::int`,
        discount: sql<number>`coalesce(sum(${s.orders.discountCents}),0)::int`,
      })
      .from(s.orders)
      .where(and(isNotNull(s.orders.couponId), eq(s.orders.status, "paid"))),
    db.select({ id: s.sellers.id, name: s.sellers.displayName }).from(s.sellers).where(inArray(s.sellers.status, ["active", "suspended"])).orderBy(s.sellers.displayName),
    getSettings(db).then((x) => x.site.currency),
  ]);
  const ids = rows.map((r) => r.c.id);
  const usage = ids.length
    ? await db
        .select({ couponId: s.orders.couponId, orders: sql<number>`count(*)::int`, discount: sql<number>`coalesce(sum(${s.orders.discountCents}),0)::int`, revenue: sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int` })
        .from(s.orders)
        .where(and(inArray(s.orders.couponId, ids), eq(s.orders.status, "paid")))
        .groupBy(s.orders.couponId)
    : [];
  const usageMap = new Map(usage.map((u) => [u.couponId!, u]));

  return (
    <>
      <PageHeader
        title={t("Coupons", "쿠폰 관리")}
        description={t("Platform coupons created by operators and seller coupons for their own products.", "운영자가 발행한 플랫폼 쿠폰과 판매자가 자기 상품에 발행한 쿠폰을 함께 관리합니다.")}
        actions={<Link href="/admin/coupons/new" className="rc-btn rc-btn-primary"><Plus />{t("Create platform coupon", "플랫폼 쿠폰 발행")}</Link>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Coupons", "쿠폰 수")} value={totals.coupons} />
        <StatCard label={t("Currently usable", "사용 가능")} value={totals.active} tone="info" />
        <StatCard label={t("Paid orders with a coupon", "쿠폰 사용 결제")} value={totals.orders.toLocaleString()} />
        <StatCard label={t("Total discount given", "총 할인 금액")} value={formatMoney(totals.discount, currency, lang)} hint={t("Paid orders (excluding refunded)", "결제 완료 주문 기준 (환불 제외)")} />
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Code or name", "쿠폰 코드 또는 이름"] },
          { type: "select", name: "scope", label: ["Issuer", "발행 주체"], options: [{ value: "platform", en: "Platform", ko: "플랫폼" }, { value: "seller", en: "Seller", ko: "판매자" }] },
          { type: "select", name: "seller", label: ["Seller", "판매자"], options: sellers.map((x) => ({ value: x.id, en: x.name, ko: x.name })) },
          { type: "select", name: "state", label: ["State", "상태"], options: [{ value: "active", en: "Active", ko: "사용 가능" }, { value: "inactive", en: "Inactive", ko: "비활성" }, { value: "expired", en: "Ended", ko: "기간 종료" }] },
        ]}
      />
      <Panel title={<>{t("Coupons", "쿠폰")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Coupon", "쿠폰"), t("Issuer", "발행"), t("Discount", "할인"), t("Applies to", "적용 상품"), t("Period", "기간"), t("Used", "사용"), t("Paid orders", "결제 주문"), t("Discount given", "할인 금액"), t("State", "상태"), ""]}
          empty={<EmptyState title={t("No coupons match these filters", "조건에 맞는 쿠폰이 없습니다")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ c, titleEn, titleKo, seller }) => {
            const ended = !!c.endsAt && c.endsAt <= now;
            const upcoming = !!c.startsAt && c.startsAt > now;
            const exhausted = c.usageLimit != null && c.usedCount >= c.usageLimit;
            const u = usageMap.get(c.id);
            return (
              <tr key={c.id}>
                <td><Link href={`/admin/coupons/${c.id}`} className="font-mono font-semibold hover:underline">{c.code}</Link><div className="max-w-[180px] truncate text-[11px] text-[#8a8d96]">{c.name}</div></td>
                <td className="whitespace-nowrap">{c.sellerId ? <><Badge tone="blue">{t("Seller", "판매자")}</Badge><div className="mt-0.5 text-[11px]"><Link href={`/admin/sellers/${c.sellerId}`} className="hover:underline">{seller}</Link></div></> : <Badge tone="violet">{t("Platform", "플랫폼")}</Badge>}</td>
                <td className="whitespace-nowrap font-medium">{c.kind === "percent" ? `${c.value}%` : formatMoney(c.value, currency, lang)}<div className="text-[11px] font-normal text-[#8a8d96]">{c.minOrderCents ? t(`Min ${formatMoney(c.minOrderCents, currency, lang)}`, `최소 ${formatMoney(c.minOrderCents, currency, lang)}`) : ""}{c.maxDiscountCents != null ? ` ${t("max", "최대")} ${formatMoney(c.maxDiscountCents, currency, lang)}` : ""}</div></td>
                <td className="max-w-[180px] truncate text-xs">{c.productId ? (lang === "ko" ? titleKo : titleEn) : c.sellerId ? t("All seller products", "판매자 전체 상품") : t("All products", "전체 상품")}</td>
                <td className="whitespace-nowrap text-[11px] text-[#5b5e68]">{c.startsAt || c.endsAt ? `${formatDate(c.startsAt, lang)} ~ ${formatDate(c.endsAt, lang)}` : t("Always", "상시")}</td>
                <td className="whitespace-nowrap">{c.usedCount}{c.usageLimit != null && <span className="text-[#8a8d96]"> / {c.usageLimit}</span>}</td>
                <td>{u?.orders ?? 0}</td>
                <td className="whitespace-nowrap">{formatMoney(u?.discount ?? 0, currency, lang)}</td>
                <td>{!c.active ? <Badge>{t("Inactive", "비활성")}</Badge> : ended ? <Badge tone="gray">{t("Ended", "기간 종료")}</Badge> : exhausted ? <Badge tone="amber">{t("Used up", "한도 소진")}</Badge> : upcoming ? <Badge tone="blue">{t("Scheduled", "시작 전")}</Badge> : <Badge tone="green">{t("Active", "사용 가능")}</Badge>}</td>
                <td className="whitespace-nowrap text-right">
                  <Link href={`/admin/coupons/${c.id}`} className="rc-btn rc-btn-outline rc-btn-sm mr-1">{c.sellerId ? t("View", "보기") : t("Edit", "수정")}</Link>
                  <ActionButton action={adminToggleCoupon.bind(null, c.id)} confirm={c.active ? t(`Deactivate ${c.code}? Buyers can no longer use it.`, `${c.code} 쿠폰을 비활성화할까요? 더 이상 사용할 수 없습니다.`) : undefined}>{c.active ? t("Deactivate", "비활성화") : t("Activate", "활성화")}</ActionButton>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
