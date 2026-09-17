import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { PageHeader, Notice } from "@/components/console/ui";
import { ProductForm } from "@/components/console/product-form";
import { adminSaveProduct } from "../actions";

export const metadata = { title: "Add product" };

export default async function AdminNewProduct() {
  await requireAdmin();
  const db = await getDb();
  const { t } = await getT("ko");
  const [categories, sellers] = await Promise.all([
    db.select({ id: s.categories.id, nameEn: s.categories.nameEn, nameKo: s.categories.nameKo, deliveryType: s.categories.deliveryType }).from(s.categories).where(eq(s.categories.active, true)).orderBy(s.categories.sort),
    db.select({ id: s.sellers.id, name: s.sellers.displayName }).from(s.sellers).where(eq(s.sellers.status, "active")).orderBy(s.sellers.displayName),
  ]);
  return (
    <>
      <PageHeader
        title={t("Add product", "상품 등록")}
        description={t("Create a product on behalf of a seller. It is saved as a draft; upload files and publish it from the product page.", "판매자를 대신해 상품을 등록합니다. 임시저장 후 상품 상세에서 파일을 올리고 바로 판매를 시작할 수 있습니다.")}
        crumbs={[{ href: "/admin/products", label: t("Products", "상품 관리") }, { label: t("Add product", "상품 등록") }]}
      />
      {sellers.length === 0 ? (
        <Notice tone="warn">{t("There are no active sellers. Approve a seller application first.", "운영중인 판매자가 없습니다. 먼저 입점 신청을 승인하세요.")}</Notice>
      ) : (
        <ProductForm admin action={adminSaveProduct} categories={categories} sellers={sellers} />
      )}
    </>
  );
}
