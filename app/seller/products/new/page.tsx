import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { PageHeader } from "@/components/console/ui";
import { ProductForm } from "@/components/console/product-form";
import { sellerSaveProduct } from "../actions";

export const metadata = { title: "Add product" };

export default async function NewSellerProduct() {
  await requireSeller();
  const db = await getDb();
  const { t } = await getT("ko");
  const categories = await db
    .select({ id: s.categories.id, nameEn: s.categories.nameEn, nameKo: s.categories.nameKo, deliveryType: s.categories.deliveryType })
    .from(s.categories)
    .where(eq(s.categories.active, true))
    .orderBy(s.categories.sort);
  return (
    <>
      <PageHeader
        title={t("Add product", "상품 등록")}
        description={t("Save a draft first, then upload files and submit it for review.", "먼저 임시저장한 뒤 파일을 올리고 심사를 요청하세요.")}
        crumbs={[{ href: "/seller/products", label: t("Products", "상품 관리") }, { label: t("Add product", "상품 등록") }]}
      />
      <ProductForm action={sellerSaveProduct} categories={categories} />
    </>
  );
}
