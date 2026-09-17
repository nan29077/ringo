import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { compactJson, isUuid } from "@/lib/server/admin-catalog";
import { mediaUrl } from "@/lib/server/storage";
import { bytes, formatDate, formatMoney } from "@/lib/i18n";
import { deliveryType, orderStatus, productStatus, refundStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, DetailList, Notice, StatCard, Badge } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { FileUploadButton } from "@/components/common/uploader";
import { ProductForm } from "@/components/console/product-form";
import { Stars } from "../../reviews/stars";
import { setReviewHidden } from "../../reviews/actions";
import { adminDeleteAsset, adminPublishDraft, adminSaveProduct, approveProduct, changeProductStatus, rejectProduct, toggleProductFlag } from "../actions";

export const metadata = { title: "Product" };

export default async function AdminProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [row] = await db
    .select({ product: s.products, sellerName: s.sellers.displayName, sellerStatus: s.sellers.status, sellerEmail: s.users.email, categoryEn: s.categories.nameEn, categoryKo: s.categories.nameKo })
    .from(s.products)
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .innerJoin(s.users, eq(s.users.id, s.sellers.userId))
    .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
    .where(eq(s.products.id, id));
  if (!row) notFound();
  const { product } = row;

  const [assets, categories, [sales], recent, reviews, history, [counts]] = await Promise.all([
    db.select().from(s.productAssets).where(eq(s.productAssets.productId, id)).orderBy(asc(s.productAssets.sort), asc(s.productAssets.createdAt)),
    tab === "edit"
      ? db.select({ id: s.categories.id, nameEn: s.categories.nameEn, nameKo: s.categories.nameKo, deliveryType: s.categories.deliveryType }).from(s.categories).where(or(eq(s.categories.active, true), eq(s.categories.id, product.categoryId))).orderBy(s.categories.sort)
      : Promise.resolve([]),
    db
      .select({
        paid: sql<number>`count(*) filter (where ${s.orders.paidAt} is not null)::int`,
        gross: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.paidAt} is not null),0)::int`,
        commission: sql<number>`coalesce(sum(${s.orders.commissionCents}) filter (where ${s.orders.status} = 'paid'),0)::int`,
        refunded: sql<number>`count(*) filter (where ${s.orders.status} = 'refunded')::int`,
        refundCents: sql<number>`coalesce(sum(${s.orders.refundedCents}),0)::int`,
        refundRequests: sql<number>`count(*) filter (where ${s.orders.refundStatus} = 'requested')::int`,
        last30: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.paidAt} > now() - interval '30 days'),0)::int`,
        pending: sql<number>`count(*) filter (where ${s.orders.status} = 'pending_payment')::int`,
      })
      .from(s.orders)
      .where(eq(s.orders.productId, id)),
    tab === "overview" ? db.select().from(s.orders).where(eq(s.orders.productId, id)).orderBy(desc(s.orders.createdAt)).limit(10) : Promise.resolve([]),
    tab === "reviews"
      ? db.select({ r: s.productReviews, buyer: s.users.name, buyerEmail: s.users.email, orderNo: s.orders.orderNo }).from(s.productReviews).innerJoin(s.users, eq(s.users.id, s.productReviews.userId)).leftJoin(s.orders, eq(s.orders.id, s.productReviews.orderId)).where(eq(s.productReviews.productId, id)).orderBy(desc(s.productReviews.createdAt)).limit(200)
      : Promise.resolve([]),
    tab === "history" ? db.select().from(s.auditLogs).where(and(eq(s.auditLogs.targetType, "product"), eq(s.auditLogs.targetId, id))).orderBy(desc(s.auditLogs.createdAt)).limit(200) : Promise.resolve([]),
    Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(s.productReviews).where(eq(s.productReviews.productId, id)),
      db.select({ n: sql<number>`count(*)::int` }).from(s.auditLogs).where(and(eq(s.auditLogs.targetType, "product"), eq(s.auditLogs.targetId, id))),
      db.select({ n: sql<number>`count(*)::int` }).from(s.deepLinks).where(eq(s.deepLinks.productId, id)),
    ]).then(([[r], [h], [l]]) => [{ reviews: r.n, history: h.n, links: l.n }]),
  ]);

  const title = lang === "ko" ? product.titleKo : product.titleEn;
  const st = product.status;
  const cur = product.currency;
  const needsFiles = product.deliveryType === "download" || product.deliveryType === "collection";
  const tabs = [
    { id: "overview", label: t("Overview", "개요") },
    { id: "edit", label: t("Edit details", "상품 정보 수정") },
    { id: "reviews", label: `${t("Reviews", "구매평")} ${counts.reviews}` },
    { id: "history", label: `${t("Change history", "변경 이력")} ${counts.history}` },
  ];

  const reasonForm = (status: "suspended", label: string, placeholder: string) => (
    <ActionForm action={changeProductStatus} className="grid gap-2" confirm={t("Suspend selling this product?", "이 상품의 판매를 중지할까요?")}>
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="status" value={status} />
      <textarea name="reason" required maxLength={1000} className="rc-textarea !min-h-[64px]" placeholder={placeholder} />
      <button className="rc-btn rc-btn-danger w-full">{label}</button>
    </ActionForm>
  );

  return (
    <>
      <PageHeader
        title={title}
        description={`/p/${product.slug}`}
        crumbs={[{ href: "/admin/products", label: t("Products", "상품 관리") }, { label: title }]}
        actions={
          <>
            {st === "pending_review" && <Link href="/admin/products/review" className="rc-btn rc-btn-outline">{t("Review queue", "심사 대기열")}</Link>}
            {st === "published" && <Link href={`/p/${product.slug}`} target="_blank" className="rc-btn rc-btn-outline"><ExternalLink />{t("View on store", "상품 페이지 보기")}</Link>}
          </>
        }
      />

      <section className="rc-panel mb-4 p-5">
        <div className="flex flex-wrap items-start gap-5">
          <img src={mediaUrl(product.coverKey)} alt="" className="h-24 w-24 rounded-xl border border-[#e9ebef] object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge map={productStatus} value={st} lang={lang} />
              <StatusBadge map={deliveryType} value={product.deliveryType} lang={lang} />
              <span className="text-xs text-[#8a8d96]">{lang === "ko" ? row.categoryKo : row.categoryEn}</span>
            </div>
            <div className="mt-2 text-lg font-bold text-[#16171b]">{product.titleKo}</div>
            <div className="text-sm text-[#5b5e68]">{product.titleEn}</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6b6e78]">
              <span>{t("Seller", "판매자")}: <Link href={`/admin/sellers/${product.sellerId}`} className="font-semibold text-[#2f4ac2] hover:underline">{row.sellerName}</Link> ({row.sellerEmail})</span>
              <span>{t("Price", "판매가")}: <b className="text-[#1c1d22]">{formatMoney(product.priceCents, cur, lang)}</b>{product.compareAtCents && <span className="ml-1 text-[#9a9ca5] line-through">{formatMoney(product.compareAtCents, cur, lang)}</span>}</span>
              <span>{t("Rating", "평점")}: {product.ratingAvg != null ? (product.ratingAvg / 10).toFixed(1) : "—"}</span>
              <span>{t("Updated", "수정일")}: {formatDate(product.updatedAt, lang, true)}</span>
            </div>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-6">
              <span className="text-[#6b6e78]">{t("Display", "진열")}</span>
              <ActionButton size="xs" action={toggleProductFlag.bind(null, product.id, "visible")}>{product.visible ? <Badge tone="green">{t("Shown", "진열중")}</Badge> : <Badge>{t("Hidden", "진열안함")}</Badge>}</ActionButton>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-[#6b6e78]">{t("Featured", "추천")}</span>
              <ActionButton size="xs" action={toggleProductFlag.bind(null, product.id, "featured")}>{product.featured ? <Badge tone="violet">{t("Featured", "추천")}</Badge> : <Badge>{t("Off", "미사용")}</Badge>}</ActionButton>
            </div>
            {row.sellerStatus !== "active" && <Badge tone="red">{t("Seller not active", "판매자 비활성")}</Badge>}
          </div>
        </div>
      </section>

      {(st === "rejected" || st === "suspended") && product.rejectReason && (
        <div className="mb-4">
          <Notice tone="danger"><b>{st === "rejected" ? t("Rejection reason", "반려 사유") : t("Suspension reason", "판매 중지 사유")}</b>: {product.rejectReason}</Notice>
        </div>
      )}

      <nav className="rc-tabs">
        {tabs.map((x) => <Link key={x.id} href={`/admin/products/${id}${x.id === "overview" ? "" : `?tab=${x.id}`}`} className={tab === x.id ? "active" : ""}>{x.label}</Link>)}
      </nav>

      {tab === "edit" && <ProductForm admin action={adminSaveProduct} categories={categories} product={product} assets={assets.map((a) => ({ id: a.id, filename: a.filename }))} />}

      {tab === "reviews" && (
        <Panel title={<>{t("Buyer reviews", "구매평")} <span className="ml-1 text-[#8a8d96]">{reviews.length}</span></>} bodyClass="p-0" actions={<Link href={`/admin/reviews?q=${encodeURIComponent(product.titleEn)}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Open in review manager", "구매평 관리에서 보기")}</Link>}>
          <DataTable head={[t("Rating", "평점"), t("Review", "내용"), t("Buyer", "작성자"), t("Order", "주문"), t("Date", "작성일"), t("Visibility", "공개")]} empty={<EmptyState title={t("No reviews yet", "아직 구매평이 없습니다")} />}>
            {reviews.map((x) => (
              <tr key={x.r.id}>
                <td className="whitespace-nowrap"><Stars n={x.r.rating} /></td>
                <td className="max-w-[420px]"><p className="line-clamp-3 whitespace-pre-wrap">{x.r.body || <span className="text-[#b3b5bc]">{t("(no text)", "(내용 없음)")}</span>}</p></td>
                <td className="whitespace-nowrap">{x.buyer}<div className="text-[11px] text-[#8a8d96]">{x.buyerEmail}</div></td>
                <td className="whitespace-nowrap">{x.orderNo ? <Link href={`/admin/orders/${x.r.orderId}`} className="text-[#2f4ac2] hover:underline">{x.orderNo}</Link> : "—"}</td>
                <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(x.r.createdAt, lang)}</td>
                <td className="whitespace-nowrap">
                  {x.r.hidden ? <Badge>{t("Hidden", "숨김")}</Badge> : <Badge tone="green">{t("Visible", "공개")}</Badge>}
                  <ActionButton size="xs" className="ml-2" action={setReviewHidden.bind(null, x.r.id, !x.r.hidden)} confirm={x.r.hidden ? undefined : t("Hide this review from the store?", "이 구매평을 숨길까요?")}>{x.r.hidden ? t("Unhide", "공개") : t("Hide", "숨기기")}</ActionButton>
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {tab === "history" && (
        <Panel title={t("Change history", "변경 이력")} description={t("Audit log entries for this product (latest 200).", "이 상품에 대한 관리 작업 로그입니다 (최근 200건).")} bodyClass="p-0">
          <DataTable head={[t("Date", "일시"), t("Action", "작업"), t("Actor", "작업자"), t("Details", "내용")]} empty={<EmptyState title={t("No recorded changes", "기록된 변경 이력이 없습니다")} />}>
            {history.map((h) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(h.createdAt, lang, true)}</td>
                <td className="whitespace-nowrap"><code className="rounded bg-[#f3f4f7] px-1.5 py-0.5 text-[11px]">{h.action}</code></td>
                <td className="whitespace-nowrap text-xs">{h.actorEmail ?? "—"}<div className="text-[11px] text-[#8a8d96]">{h.actorRole}</div></td>
                <td className="max-w-[460px] truncate font-mono text-[11px] text-[#5b5e68]" title={h.data ? JSON.stringify(h.data) : undefined}>{compactJson(h.data) || "—"}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="grid content-start gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label={t("Paid orders", "결제 주문")} value={sales.paid.toLocaleString()} hint={t(`${sales.pending} awaiting payment`, `결제 대기 ${sales.pending}건`)} />
              <StatCard label={t("Gross sales", "총 매출")} value={formatMoney(sales.gross, cur, lang)} hint={t(`Last 30 days ${formatMoney(sales.last30, cur, lang)}`, `최근 30일 ${formatMoney(sales.last30, cur, lang)}`)} />
              <StatCard label={t("Platform commission", "플랫폼 수수료")} value={formatMoney(sales.commission, cur, lang)} hint={t("Paid, not refunded", "환불 제외 결제 주문")} tone="good" />
              <StatCard label={t("Refunds", "환불")} value={formatMoney(sales.refundCents, cur, lang)} hint={t(`${sales.refunded} refunded · ${sales.refundRequests} requested`, `환불 ${sales.refunded}건 · 요청 ${sales.refundRequests}건`)} tone={sales.refundRequests ? "warn" : "default"} />
            </div>

            <Panel
              title={<>{t("Files", "파일")} <span className="ml-1 text-[#8a8d96]">{assets.length}</span></>}
              description={needsFiles ? t("Buyers download these files after purchase. At least one file is required to publish.", "구매자가 결제 후 내려받는 파일입니다. 판매 시작 전 최소 1개가 필요합니다.") : t("Optional files, e.g. course materials attached to lessons.", "강의 자료 등 선택 파일입니다.")}
              bodyClass="p-0"
              actions={<FileUploadButton kind="product-asset" productId={product.id} label={t("Upload files", "파일 업로드")} />}
            >
              <DataTable head={[t("File name", "파일명"), t("Type", "형식"), t("Size", "크기"), t("Uploaded", "업로드일"), ""]} empty={<EmptyState title={t("No files uploaded", "업로드된 파일이 없습니다")} />}>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td className="max-w-[300px] truncate font-medium">{a.filename}</td>
                    <td className="max-w-[140px] truncate text-xs text-[#6b6e78]">{a.contentType}</td>
                    <td className="whitespace-nowrap text-[#6b6e78]">{bytes(a.bytes)}</td>
                    <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(a.createdAt, lang, true)}</td>
                    <td className="whitespace-nowrap text-right">
                      <a href={`/api/download/asset/${a.id}`} className="rc-btn rc-btn-outline rc-btn-sm mr-1"><Download />{t("Download", "다운로드")}</a>
                      <ActionButton action={adminDeleteAsset.bind(null, a.id)} confirm={t(`Delete ${a.filename}? Buyers who purchased will lose access to this file.`, `${a.filename} 파일을 삭제할까요? 기존 구매자도 이 파일을 받을 수 없게 됩니다.`)} className="text-[#c0362c]">
                        <Trash2 />{t("Delete", "삭제")}
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Panel>

            <Panel title={t("Recent orders", "최근 주문")} bodyClass="p-0" actions={<Link href={`/admin/orders?q=${encodeURIComponent(product.titleEn)}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("All orders", "전체 주문")}</Link>}>
              <DataTable head={[t("Order", "주문번호"), t("Buyer", "구매자"), t("Amount", "금액"), t("Coupon", "쿠폰"), t("Status", "상태")]} empty={<EmptyState title={t("No orders yet", "아직 주문이 없습니다")} />}>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div></td>
                    <td>{o.buyerName}<div className="text-[11px] text-[#8a8d96]">{o.buyerEmail}</div></td>
                    <td className="whitespace-nowrap font-medium">{formatMoney(o.totalCents, o.currency, lang)}</td>
                    <td className="text-xs">{o.couponCode ?? "—"}</td>
                    <td className="space-x-1 whitespace-nowrap"><StatusBadge map={orderStatus} value={o.status} lang={lang} />{o.refundStatus !== "none" && <StatusBadge map={refundStatus} value={o.refundStatus} lang={lang} />}</td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          </div>

          <div className="grid content-start gap-4">
            <Panel title={t("Moderation", "판매 상태 관리")}>
              <div className="grid gap-3">
                {st === "pending_review" && (
                  <>
                    <Notice>{t(`Submitted ${formatDate(product.submittedAt, "en", true)}. Approve to publish, or reject with a reason the seller will receive by email.`, `${formatDate(product.submittedAt, "ko", true)} 심사 요청. 승인하면 바로 판매되며, 반려 시 사유가 판매자에게 메일로 전달됩니다.`)}</Notice>
                    {needsFiles && assets.length === 0 && <Notice tone="warn">{t("No files uploaded yet.", "업로드된 파일이 없습니다.")}</Notice>}
                    <ActionButton action={approveProduct.bind(null, product.id)} variant="default" size="default" className="w-full">{t("Approve & publish", "승인 (판매 시작)")}</ActionButton>
                    <ActionForm action={rejectProduct} className="grid gap-2">
                      <input type="hidden" name="id" value={product.id} />
                      <textarea name="reason" required maxLength={1000} className="rc-textarea !min-h-[64px]" placeholder={t("Rejection reason (sent to the seller)", "반려 사유 (판매자에게 전달)")} />
                      <button className="rc-btn rc-btn-danger w-full">{t("Reject", "반려")}</button>
                    </ActionForm>
                  </>
                )}
                {(st === "draft" || st === "rejected") && (
                  <>
                    <Notice>{st === "draft" ? t("Draft. Publishing as admin skips the review queue.", "임시저장 상태입니다. 관리자가 판매를 시작하면 심사 없이 바로 판매됩니다.") : t("Rejected. You can publish it directly after checking the fixes.", "반려된 상품입니다. 수정 사항을 확인한 뒤 바로 판매를 시작할 수 있습니다.")}</Notice>
                    {needsFiles && assets.length === 0 && <Notice tone="warn">{t("Upload at least one file before publishing.", "판매 시작 전 파일을 1개 이상 업로드하세요.")}</Notice>}
                    <ActionButton action={adminPublishDraft.bind(null, product.id)} variant="default" size="default" className="w-full" confirm={t("Publish this product now?", "지금 판매를 시작할까요?")}>{t("Publish now", "바로 판매 시작")}</ActionButton>
                  </>
                )}
                {st === "published" && reasonForm("suspended", t("Suspend selling", "판매 중지"), t("Suspension reason (shown to the seller)", "판매 중지 사유 (판매자에게 표시)"))}
                {(st === "suspended" || st === "archived") && (
                  <ActionForm action={changeProductStatus} confirm={t("Put this product back on sale?", "이 상품을 다시 판매할까요?")}>
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="status" value="published" />
                    <button className="rc-btn rc-btn-primary w-full">{t("Reinstate (on sale)", "판매 재개")}</button>
                  </ActionForm>
                )}
                {st === "archived" && (
                  <ActionForm action={changeProductStatus}>
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="status" value="draft" />
                    <button className="rc-btn rc-btn-outline w-full">{t("Restore to draft", "임시저장으로 복원")}</button>
                  </ActionForm>
                )}
                {st !== "archived" && st !== "pending_review" && (
                  <ActionForm action={changeProductStatus} confirm={t("Archive this product? It will no longer be sold. Existing buyers keep access.", "상품을 보관할까요? 더 이상 판매되지 않으며 기존 구매자는 계속 이용할 수 있습니다.")}>
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button className="rc-btn w-full text-[#8a8d96] hover:bg-[#f3f4f7]">{t("Archive", "보관하기")}</button>
                  </ActionForm>
                )}
              </div>
            </Panel>
            <Panel title={t("Details", "상품 정보")}>
              <DetailList
                items={[
                  [t("Slug", "상품 주소"), <code key="s" className="text-xs">/p/{product.slug}</code>],
                  [t("Format", "형식"), product.formatLabel ?? "—"],
                  ...(product.deliveryType === "service" ? [[t("Delivery time", "제작 기간"), t(`${product.deliveryDays ?? 7} days`, `${product.deliveryDays ?? 7}일`)] as [string, string]] : []),
                  ...(product.deliveryType === "course" ? [[t("Lessons", "강의 수"), String(product.lessons.length)] as [string, string]] : []),
                  [t("Sales count", "판매 수"), String(product.salesCount)],
                  [t("Deep links", "딥링크"), <Link key="l" href={`/admin/links?q=${encodeURIComponent(product.titleEn)}`} className="text-[#2f4ac2] hover:underline">{counts.links}</Link>],
                  [t("Created", "등록일"), formatDate(product.createdAt, lang, true)],
                  [t("Submitted", "심사 요청일"), formatDate(product.submittedAt, lang, true)],
                  [t("Published", "판매 시작일"), formatDate(product.publishedAt, lang, true)],
                ]}
              />
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
