import Link from "next/link";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { one, type SP } from "@/lib/server/list";
import { isUuid, pick } from "@/lib/server/storefront";
import { ActionForm } from "@/components/common/action-form";
import { AccountHeader } from "@/components/store/account-ui";
import { submitInquiry } from "../../actions";

export const metadata = { title: "New inquiry" };

export default async function NewInquiry({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const productParam = one(sp, "product");
  const orderParam = one(sp, "order");
  const self = `/account/inquiries/new${productParam ? `?product=${encodeURIComponent(productParam)}` : orderParam ? `?order=${encodeURIComponent(orderParam)}` : ""}`;
  const viewer = await requireViewer(self);
  const { t, lang } = await getT();
  const db = await getDb();
  const [order] = isUuid(orderParam)
    ? await db.select({ id: s.orders.id, orderNo: s.orders.orderNo, productId: s.orders.productId }).from(s.orders).where(and(eq(s.orders.id, orderParam), eq(s.orders.buyerId, viewer.user.id)))
    : [];
  const productId = order?.productId ?? (isUuid(productParam) ? productParam : null);
  const [product] = productId
    ? await db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo, coverKey: s.products.coverKey, slug: s.products.slug, sellerName: s.sellers.displayName }).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).where(eq(s.products.id, productId))
    : [];
  const categories: [string, string][] = [
    ["general", t("General question", "일반 문의")],
    ["product", t("About a product", "상품 문의")],
    ["order", t("About an order", "주문 문의")],
    ["refund", t("Refund", "환불 문의")],
    ["payment", t("Payment (Ringo support)", "결제 문의 (링고 고객센터)")],
    ["account", t("Account (Ringo support)", "계정 문의 (링고 고객센터)")],
    ["seller", t("Selling on Ringo", "판매자 입점 문의")],
  ];
  const defaultCategory = order ? "order" : product ? "product" : "general";

  return (
    <>
      <AccountHeader crumbs={[{ href: "/account/inquiries", label: t("Inquiries", "문의 내역") }, { label: t("New", "새 문의") }]} title={t("New inquiry", "새 문의")} description={product ? t(`Questions about this ${order ? "order" : "product"} go to ${product.sellerName}. Payment and account questions go to Ringo support.`, `이 ${order ? "주문" : "상품"}에 대한 문의는 ${product.sellerName}에게 전달됩니다. 결제·계정 문의는 링고 고객센터로 전달됩니다.`) : t("Your message goes to Ringo support. To ask a seller, start from the product or order page.", "문의는 링고 고객센터로 전달됩니다. 판매자에게 문의하려면 상품 또는 주문 페이지에서 시작하세요.")} />
      <section className="sf-card sf-card-pad max-w-[720px]">
        {product && (
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-[#f7f7f3] p-3">
            <img src={mediaUrl(product.coverKey)} alt="" className="sf-thumb" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#20211f]">{pick(lang, product.titleEn, product.titleKo)}</p>
              <p className="text-[13px] text-[#6b7065]">{product.sellerName}{order ? ` · ${t("Order", "주문")} ${order.orderNo}` : ""}</p>
            </div>
          </div>
        )}
        <ActionForm action={submitInquiry} className="grid gap-4">
          {product && <input type="hidden" name="productId" value={product.id} />}
          {order && <input type="hidden" name="orderId" value={order.id} />}
          <label className="sf-field">
            <span>{t("Category", "문의 유형")}</span>
            <select name="category" defaultValue={defaultCategory} className="sf-select">
              {categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="sf-field">
            <span>{t("Subject", "제목")}</span>
            <input name="subject" required minLength={2} maxLength={160} className="sf-input" />
          </label>
          <label className="sf-field">
            <span>{t("Message", "내용")}</span>
            <textarea name="body" required minLength={2} maxLength={5000} className="sf-textarea !min-h-[180px]" placeholder={t("Include details that help us answer quickly.", "빠른 답변에 도움이 되는 내용을 자세히 적어주세요.")} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button className="sf-btn sf-btn-primary">{t("Send inquiry", "문의 보내기")}</button>
            <Link href={product && !order ? `/p/${product.slug}` : "/account/inquiries"} className="sf-btn sf-btn-ghost">{t("Cancel", "취소")}</Link>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
