import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { PageHeader } from "@/components/console/ui";
import { AdminCouponForm } from "../coupon-form";

export const metadata = { title: "New coupon" };

export default async function AdminNewCoupon() {
  await requireAdmin();
  const db = await getDb();
  const { t } = await getT("ko");
  const [products, settings] = await Promise.all([
    db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo, seller: s.sellers.displayName }).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).where(eq(s.products.status, "published")).orderBy(s.products.titleEn).limit(1000),
    getSettings(db),
  ]);
  return (
    <>
      <PageHeader title={t("Create platform coupon", "플랫폼 쿠폰 발행")} description={t("A platform coupon can be used on any product, or restricted to one product.", "플랫폼 쿠폰은 모든 상품 또는 지정한 한 상품에 사용할 수 있습니다.")} crumbs={[{ href: "/admin/coupons", label: t("Coupons", "쿠폰 관리") }, { label: t("New", "발행") }]} />
      <AdminCouponForm products={products} currency={settings.site.currency} startsValue="" endsValue="" />
    </>
  );
}
