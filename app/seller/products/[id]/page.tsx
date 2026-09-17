import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { Download, ExternalLink, Link2, Trash2 } from "lucide-react";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { isUuid } from "@/lib/server/seller-center";
import { mediaUrl } from "@/lib/server/storage";
import { bytes, formatDate, formatMoney } from "@/lib/i18n";
import { deliveryType, orderStatus, productStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, DetailList, Notice, StatCard } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton } from "@/components/common/action-form";
import { FileUploadButton } from "@/components/common/uploader";
import { ProductForm } from "@/components/console/product-form";
import { sellerDeleteAsset, sellerSaveProduct, sellerSetProductStatus, sellerSubmitProduct } from "../actions";

export const metadata = { title: "Product" };

export default async function SellerProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireSeller();
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [product] = await db.select().from(s.products).where(and(eq(s.products.id, id), eq(s.products.sellerId, viewer.seller.id)));
  if (!product) notFound();

  const [assets, categories, [sales], recent, [linkCount]] = await Promise.all([
    db.select().from(s.productAssets).where(eq(s.productAssets.productId, id)).orderBy(asc(s.productAssets.sort), asc(s.productAssets.createdAt)),
    db.select({ id: s.categories.id, nameEn: s.categories.nameEn, nameKo: s.categories.nameKo, deliveryType: s.categories.deliveryType }).from(s.categories).where(or(eq(s.categories.active, true), eq(s.categories.id, product.categoryId))).orderBy(s.categories.sort),
    db
      .select({
        paid: sql<number>`count(*) filter (where ${s.orders.paidAt} is not null)::int`,
        gross: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.paidAt} is not null),0)::int`,
        net: sql<number>`coalesce(sum(${s.orders.sellerNetCents}) filter (where ${s.orders.status} = 'paid'),0)::int`,
        refunded: sql<number>`count(*) filter (where ${s.orders.status} = 'refunded')::int`,
        refundCents: sql<number>`coalesce(sum(${s.orders.refundedCents}),0)::int`,
        last30: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.paidAt} > now() - interval '30 days'),0)::int`,
      })
      .from(s.orders)
      .where(and(eq(s.orders.productId, id), eq(s.orders.sellerId, viewer.seller.id))),
    db.select().from(s.orders).where(and(eq(s.orders.productId, id), eq(s.orders.sellerId, viewer.seller.id))).orderBy(desc(s.orders.createdAt)).limit(5),
    db.select({ n: sql<number>`count(*)::int` }).from(s.deepLinks).where(and(eq(s.deepLinks.productId, id), eq(s.deepLinks.sellerId, viewer.seller.id))),
  ]);

  const title = lang === "ko" ? product.titleKo : product.titleEn;
  const needsFiles = product.deliveryType === "download" || product.deliveryType === "collection";
  const st = product.status;
  const canSubmit = (st === "draft" && !product.publishedAt) || st === "rejected";
  const canResume = st === "draft" && !!product.publishedAt;
  const canPause = st === "published";
  const canWithdraw = st === "pending_review";
  const canArchive = ["draft", "published", "rejected"].includes(st);
  const canRestore = st === "archived";
  const tabs = [
    { id: "overview", label: t("Overview & files", "상태 · 파일") },
    { id: "edit", label: t("Edit details", "상품 정보 수정") },
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={`/p/${product.slug}`}
        crumbs={[{ href: "/seller/products", label: t("Products", "상품 관리") }, { label: title }]}
        actions={
          <>
            {st === "published" && <Link href={`/p/${product.slug}`} target="_blank" className="rc-btn rc-btn-outline"><ExternalLink />{t("View on store", "상품 페이지 보기")}</Link>}
            {st === "published" && <Link href={`/seller/links/new?productId=${product.id}`} className="rc-btn rc-btn-outline"><Link2 />{t("Create deep link", "딥링크 만들기")}</Link>}
          </>
        }
      />

      {(st === "rejected" || st === "suspended") && (
        <div className="mb-4">
          <Notice tone="danger">
            <b>{st === "rejected" ? t("This product was rejected.", "상품이 반려되었습니다.") : t("This product was suspended by the marketplace.", "운영자가 판매를 중지한 상품입니다.")}</b>
            {product.rejectReason && <div className="mt-1">{t("Reason", "사유")}: {product.rejectReason}</div>}
            <div className="mt-1 text-xs">{st === "rejected" ? t("Fix the issues and submit the product again.", "내용을 수정한 뒤 다시 심사를 요청하세요.") : t("Contact support if you have questions.", "문의 사항은 고객센터로 연락하세요.")}</div>
          </Notice>
        </div>
      )}

      <nav className="rc-tabs">
        {tabs.map((x) => <Link key={x.id} href={`/seller/products/${id}${x.id === "overview" ? "" : `?tab=${x.id}`}`} className={tab === x.id ? "active" : ""}>{x.label}</Link>)}
      </nav>

      {tab === "edit" ? (
        <ProductForm action={sellerSaveProduct} categories={categories} product={product} assets={assets.map((a) => ({ id: a.id, filename: a.filename }))} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="grid content-start gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label={t("Paid orders", "결제 주문")} value={sales.paid.toLocaleString()} hint={t(`${sales.refunded} refunded`, `환불 ${sales.refunded}건`)} />
              <StatCard label={t("Gross sales", "총 매출")} value={formatMoney(sales.gross, product.currency, lang)} hint={t(`Last 30 days ${formatMoney(sales.last30, product.currency, lang)}`, `최근 30일 ${formatMoney(sales.last30, product.currency, lang)}`)} />
              <StatCard label={t("Seller net", "판매자 순매출")} value={formatMoney(sales.net, product.currency, lang)} hint={t(`Refunds ${formatMoney(sales.refundCents, product.currency, lang)}`, `환불 ${formatMoney(sales.refundCents, product.currency, lang)}`)} tone="good" />
            </div>

            <Panel
              title={<>{t("Files", "파일")} <span className="ml-1 text-[#8a8d96]">{assets.length}</span></>}
              description={needsFiles ? t("Buyers download these files after purchase. At least one file is required.", "구매자가 결제 후 내려받는 파일입니다. 최소 1개가 필요합니다.") : t("Optional files, e.g. course materials attached to lessons.", "강의 자료 등 선택 파일입니다. 강의 목차에 연결할 수 있습니다.")}
              bodyClass="p-0"
              actions={st !== "suspended" && <FileUploadButton kind="product-asset" productId={product.id} label={t("Upload files", "파일 업로드")} />}
            >
              <DataTable head={[t("File name", "파일명"), t("Size", "크기"), t("Uploaded", "업로드일"), ""]} empty={<EmptyState title={t("No files uploaded", "업로드된 파일이 없습니다")} description={needsFiles ? t("Upload the files buyers will receive.", "구매자가 받을 파일을 업로드하세요.") : undefined} />}>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td className="max-w-[340px] truncate font-medium">{a.filename}</td>
                    <td className="whitespace-nowrap text-[#6b6e78]">{bytes(a.bytes)}</td>
                    <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(a.createdAt, lang, true)}</td>
                    <td className="text-right whitespace-nowrap">
                      <a href={`/api/download/asset/${a.id}`} className="rc-btn rc-btn-outline rc-btn-sm mr-1"><Download />{t("Download", "다운로드")}</a>
                      <ActionButton action={sellerDeleteAsset.bind(null, a.id)} confirm={t(`Delete ${a.filename}? Buyers who already purchased will no longer be able to download this file.`, `${a.filename} 파일을 삭제할까요? 이미 구매한 고객도 이 파일을 더 이상 받을 수 없습니다.`)} className="text-[#c0362c]">
                        <Trash2 />{t("Delete", "삭제")}
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Panel>

            <Panel title={t("Recent orders", "최근 주문")} bodyClass="p-0" actions={<Link href={`/seller/orders?q=${encodeURIComponent(product.titleEn)}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("All orders", "전체 주문")}</Link>}>
              <DataTable head={[t("Order", "주문번호"), t("Buyer", "구매자"), t("Amount", "금액"), t("Status", "상태")]} empty={<EmptyState title={t("No orders yet", "아직 주문이 없습니다")} />}>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap"><Link href={`/seller/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div></td>
                    <td>{o.buyerName}</td>
                    <td>{formatMoney(o.totalCents, o.currency, lang)}</td>
                    <td><StatusBadge map={orderStatus} value={o.status} lang={lang} /></td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          </div>

          <div className="grid content-start gap-4">
            <Panel title={t("Sales status", "판매 상태")}>
              <div className="flex items-center gap-3">
                <img src={mediaUrl(product.coverKey)} alt="" className="rc-thumb !size-16" />
                <div className="grid gap-1">
                  <StatusBadge map={productStatus} value={st} lang={lang} />
                  <span className="text-xs text-[#8a8d96]">{formatMoney(product.priceCents, product.currency, lang)}</span>
                </div>
              </div>
              <div className="mt-4">
                <DetailList
                  items={[
                    [t("Type", "상품타입"), <StatusBadge key="d" map={deliveryType} value={product.deliveryType} lang={lang} />],
                    ...(product.deliveryType === "service" ? [[t("Delivery time", "제작 기간"), t(`${product.deliveryDays ?? 7} days`, `${product.deliveryDays ?? 7}일`)] as [string, string]] : []),
                    ...(product.deliveryType === "course" ? [[t("Lessons", "강의 수"), String(product.lessons.length)] as [string, string]] : []),
                    [t("Created", "등록일"), formatDate(product.createdAt, lang)],
                    [t("Submitted", "심사 요청일"), formatDate(product.submittedAt, lang)],
                    [t("First published", "최초 판매일"), formatDate(product.publishedAt, lang)],
                    [t("Deep links", "딥링크"), <Link key="l" href="/seller/links" className="text-[#2f4ac2] hover:underline">{linkCount.n}</Link>],
                  ]}
                />
              </div>
              {st === "pending_review" && <div className="mt-4"><Notice>{t("The marketplace team is reviewing this product. You can keep editing details meanwhile.", "운영팀이 상품을 심사하고 있습니다. 심사 중에도 정보를 수정할 수 있습니다.")}</Notice></div>}
              {canSubmit && needsFiles && assets.length === 0 && <div className="mt-4"><Notice tone="warn">{t("Upload at least one file before submitting.", "심사 요청 전 파일을 1개 이상 업로드하세요.")}</Notice></div>}
              <div className="mt-4 grid gap-2">
                {canSubmit && (
                  <ActionButton action={sellerSubmitProduct.bind(null, product.id)} variant="default" size="default" className="w-full !bg-[#ed4b2e] hover:!bg-[#d9401f]">
                    {st === "rejected" ? t("Resubmit for review", "다시 심사 요청") : t("Submit for review", "심사 요청")}
                  </ActionButton>
                )}
                {canResume && <ActionButton action={sellerSetProductStatus.bind(null, product.id, "published")} variant="default" size="default" className="w-full">{t("Resume selling", "판매 재개")}</ActionButton>}
                {canPause && <ActionButton action={sellerSetProductStatus.bind(null, product.id, "draft")} size="default" className="w-full" confirm={t("Pause selling? The product will be hidden from the store.", "판매를 일시중지할까요? 스토어에서 숨겨집니다.")}>{t("Pause selling", "판매 일시중지")}</ActionButton>}
                {canWithdraw && <ActionButton action={sellerSetProductStatus.bind(null, product.id, "draft")} size="default" className="w-full" confirm={t("Withdraw the review request?", "심사 요청을 취소할까요?")}>{t("Withdraw review request", "심사 요청 취소")}</ActionButton>}
                {canRestore && <ActionButton action={sellerSetProductStatus.bind(null, product.id, "draft")} size="default" className="w-full">{t("Restore to draft", "임시저장으로 복원")}</ActionButton>}
                {canArchive && <ActionButton action={sellerSetProductStatus.bind(null, product.id, "archived")} variant="ghost" size="default" className="w-full text-[#8a8d96]" confirm={t("Archive this product? It will no longer be sold. Existing buyers keep access.", "상품을 보관할까요? 더 이상 판매되지 않으며 기존 구매자는 계속 이용할 수 있습니다.")}>{t("Archive", "보관하기")}</ActionButton>}
                <Link href={`/seller/products/${id}?tab=edit`} className="rc-btn rc-btn-outline w-full">{t("Edit details", "상품 정보 수정")}</Link>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
