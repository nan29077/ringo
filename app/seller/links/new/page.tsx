import Link from "next/link";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { appOrigin } from "@/lib/server/request";
import { PageHeader, Notice } from "@/components/console/ui";
import { LinkForm } from "../link-form";
import { linkFormOptions } from "../load";

export const metadata = { title: "Create sales link" };

export default async function NewSellerLink({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const viewer = await requireSeller();
  const { productId } = await searchParams;
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const { products, coupons } = await linkFormOptions(db, viewer.seller.id);
  return (
    <>
      <PageHeader title={t("Create sales link", "판매 링크 만들기")} crumbs={[{ href: "/seller/links", label: t("Sales links", "판매 링크") }, { label: t("Create", "만들기") }]} />
      {products.length === 0 ? (
        <Notice tone="warn">{t("You need at least one product on sale to create a link.", "링크를 만들려면 판매중인 상품이 1개 이상 필요합니다.")} <Link href="/seller/products" className="font-semibold underline">{t("Go to products", "상품 관리로 이동")}</Link></Notice>
      ) : (
        <LinkForm t={t} lang={lang} products={products} coupons={coupons} defaultProductId={products.some((p) => p.id === productId) ? productId : undefined} expiresValue="" origin={await appOrigin()} />
      )}
    </>
  );
}
