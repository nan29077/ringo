import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { isUuid, toLocalInput } from "@/lib/server/seller-center";
import { formatDate, formatMoney } from "@/lib/i18n";
import { orderStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { CouponForm } from "../coupon-form";

export const metadata = { title: "Coupon" };

export default async function SellerCouponDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSeller();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [coupon] = await db.select().from(s.coupons).where(and(eq(s.coupons.id, id), eq(s.coupons.sellerId, viewer.seller.id)));
  if (!coupon) notFound();
  const [products, orders, settings] = await Promise.all([
    db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.products).where(eq(s.products.sellerId, viewer.seller.id)).orderBy(s.products.titleEn),
    db.select().from(s.orders).where(and(eq(s.orders.couponId, coupon.id), eq(s.orders.sellerId, viewer.seller.id))).orderBy(desc(s.orders.createdAt)).limit(20),
    getSettings(db),
  ]);
  return (
    <>
      <PageHeader title={coupon.code} description={coupon.name} crumbs={[{ href: "/seller/coupons", label: t("Coupons", "쿠폰") }, { label: coupon.code }]} />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <CouponForm coupon={coupon} products={products} currency={settings.site.currency} startsValue={toLocalInput(coupon.startsAt)} endsValue={toLocalInput(coupon.endsAt)} />
        <Panel title={t("Recent orders with this coupon", "이 쿠폰을 사용한 주문")} bodyClass="p-0" className="self-start">
          <DataTable head={[t("Order", "주문번호"), t("Discount", "할인"), t("Status", "상태")]} empty={<EmptyState title={t("Not used yet", "아직 사용되지 않았습니다")} />}>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="whitespace-nowrap"><Link href={`/seller/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div></td>
                <td className="whitespace-nowrap">-{formatMoney(o.discountCents, o.currency, lang)}</td>
                <td><StatusBadge map={orderStatus} value={o.status} lang={lang} /></td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </>
  );
}
