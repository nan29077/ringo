import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { PageHeader } from "@/components/console/ui";
import { CouponForm } from "../coupon-form";

export const metadata = { title: "Create coupon" };

export default async function NewSellerCoupon() {
  const viewer = await requireSeller();
  const db = await getDb();
  const { t } = await getT("ko");
  const products = await db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.products).where(eq(s.products.sellerId, viewer.seller.id)).orderBy(s.products.titleEn);
  return (
    <>
      <PageHeader title={t("Create coupon", "쿠폰 만들기")} crumbs={[{ href: "/seller/coupons", label: t("Coupons", "쿠폰") }, { label: t("Create", "만들기") }]} />
      <CouponForm products={products} currency={(await getSettings(db)).site.currency} startsValue="" endsValue="" />
    </>
  );
}
