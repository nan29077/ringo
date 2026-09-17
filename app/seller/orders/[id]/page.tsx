import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { holdReasons, isUuid } from "@/lib/server/seller-center";
import { mediaUrl } from "@/lib/server/storage";
import { bytes, formatDate, formatMoney } from "@/lib/i18n";
import { deliveryType, fulfillmentStatus, label, orderEventType, orderStatus, refundStatus } from "@/lib/status";
import { PageHeader, Panel, DetailList, Notice, DataTable, EmptyState, Badge } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { FileUploadButton } from "@/components/common/uploader";
import { sellerApproveRefund, sellerDeliverOrder, sellerRejectRefund, sellerStartProduction } from "../actions";

export const metadata = { title: "Order" };

export default async function SellerOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSeller();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [row] = await db
    .select({ order: s.orders, product: s.products })
    .from(s.orders)
    .innerJoin(s.products, eq(s.products.id, s.orders.productId))
    .where(and(eq(s.orders.id, id), eq(s.orders.sellerId, viewer.seller.id)));
  if (!row) notFound();
  const { order: o, product } = row;

  const [events, files, link, settlement, settings] = await Promise.all([
    db.select().from(s.orderEvents).where(eq(s.orderEvents.orderId, id)).orderBy(desc(s.orderEvents.createdAt), desc(s.orderEvents.id)),
    db.select().from(s.orderDeliverables).where(eq(s.orderDeliverables.orderId, id)).orderBy(asc(s.orderDeliverables.createdAt)),
    o.linkId ? db.select().from(s.deepLinks).where(and(eq(s.deepLinks.id, o.linkId), eq(s.deepLinks.sellerId, viewer.seller.id))).then((r) => r[0]) : Promise.resolve(undefined),
    o.settlementId ? db.select().from(s.settlements).where(and(eq(s.settlements.id, o.settlementId), eq(s.settlements.sellerId, viewer.seller.id))).then((r) => r[0]) : Promise.resolve(undefined),
    getSettings(db),
  ]);

  const service = product.deliveryType === "service";
  const money = (c: number) => formatMoney(c, o.currency, lang);
  const overdue = o.status === "paid" && !!o.dueAt && o.dueAt.getTime() < Date.now() && (o.fulfillmentStatus === "pending" || o.fulfillmentStatus === "in_progress");
  const hold = o.status === "paid" && !o.settlementId && o.totalCents > 0 ? holdReasons(o, settings.commerce.refundWindowDays) : null;
  const holdLabel: Record<string, string> = {
    refund_requested: t("refund requested", "환불 요청 처리 전"),
    not_delivered: t("not delivered yet", "납품 전"),
    refund_window: t(`refund window until ${formatDate(hold?.releaseAt, lang)}`, `환불 가능 기간 (${formatDate(hold?.releaseAt, lang)}까지)`),
  };
  const canDeliver = service && o.status === "paid" && ["pending", "in_progress", "delivered"].includes(o.fulfillmentStatus);

  return (
    <>
      <PageHeader
        title={o.orderNo}
        description={t(`Ordered ${formatDate(o.createdAt, lang, true)}`, `주문일시 ${formatDate(o.createdAt, lang, true)}`)}
        crumbs={[{ href: "/seller/orders", label: t("Orders", "주문 관리") }, { label: o.orderNo }]}
        actions={
          <div className="flex flex-wrap gap-1">
            <StatusBadge map={orderStatus} value={o.status} lang={lang} />
            {o.fulfillmentStatus !== "not_required" && <StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} />}
            {o.refundStatus !== "none" && <StatusBadge map={refundStatus} value={o.refundStatus} lang={lang} />}
          </div>
        }
      />

      {o.status === "paid" && o.refundStatus === "requested" && (
        <Panel className="mb-4 !border-[#f7c9c7]" title={t("Refund requested", "환불 요청")} description={t("Decide on this request. Approval refunds the full amount and revokes the buyer's access.", "요청을 처리하세요. 승인하면 전액 환불되고 구매자의 이용 권한이 회수됩니다.")}>
          <p className="!mb-4 rounded-lg bg-[#fff3f2] px-4 py-3 text-sm text-[#a3302a]">{o.refundReason ?? "—"}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <ActionForm action={sellerApproveRefund} className="grid content-start gap-2" confirm={t(`Refund ${money(o.totalCents)} to the buyer?`, `구매자에게 ${money(o.totalCents)}을 환불할까요?`)}>
              <input type="hidden" name="orderId" value={o.id} />
              <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Note (optional)", "메모 (선택)")}</span><input name="note" maxLength={500} className="rc-input" /></label>
              <button className="rc-btn rc-btn-brand justify-self-start">{t(`Approve refund · ${money(o.totalCents)}`, `환불 승인 · ${money(o.totalCents)}`)}</button>
            </ActionForm>
            <ActionForm action={sellerRejectRefund} className="grid content-start gap-2">
              <input type="hidden" name="orderId" value={o.id} />
              <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Reason for rejection", "거절 사유")}<span className="text-[#e5484d]">*</span></span><textarea name="reason" required maxLength={2000} className="rc-textarea !min-h-[64px]" placeholder={t("Shown to the buyer", "구매자에게 전달됩니다")} /></label>
              <button className="rc-btn rc-btn-danger justify-self-start">{t("Reject request", "요청 거절")}</button>
            </ActionForm>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-4">
          <Panel title={t("Product", "상품")}>
            <div className="flex items-center gap-4">
              <img src={mediaUrl(product.coverKey)} alt="" className="rc-thumb !size-16" />
              <div className="min-w-0">
                <Link href={`/seller/products/${product.id}`} className="font-semibold hover:underline">{lang === "ko" ? product.titleKo : product.titleEn}</Link>
                <div className="mt-1 flex items-center gap-2 text-xs text-[#8a8d96]"><StatusBadge map={deliveryType} value={product.deliveryType} lang={lang} />{o.productTitle !== product.titleEn && <span>{t("Ordered as", "주문 당시")}: {o.productTitle}</span>}</div>
              </div>
            </div>
          </Panel>

          {service && (
            <Panel
              className={overdue ? "!border-[#f7c9c7]" : ""}
              title={t("Service production", "제작 · 납품")}
              description={o.dueAt ? t(`Due ${formatDate(o.dueAt, lang, true)}`, `납기 ${formatDate(o.dueAt, lang, true)}`) : undefined}
              actions={
                <>
                  {overdue && <Badge tone="red">{t("Overdue", "납기 지연")}</Badge>}
                  {o.status === "paid" && o.fulfillmentStatus === "pending" && <ActionButton action={sellerStartProduction.bind(null, o.id)}>{t("Start production", "제작 시작")}</ActionButton>}
                </>
              }
            >
              <h3 className="text-xs font-semibold text-[#6b6e78]">{t("Buyer's brief", "구매자 요청 내용")}</h3>
              <p className="!mt-1.5 whitespace-pre-wrap rounded-lg bg-[#f8f9fb] px-4 py-3 text-sm leading-relaxed">{o.brief || "—"}</p>

              <div className="mt-5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-[#6b6e78]">{t("Deliverable files", "납품 파일")} ({files.length})</h3>
                {o.status === "paid" && <FileUploadButton kind="deliverable" orderId={o.id} label={t("Upload deliverables", "납품 파일 업로드")} />}
              </div>
              {files.length === 0 ? (
                <p className="!mt-2 rounded-lg border border-dashed border-[#e1e3e8] px-4 py-4 text-center text-xs text-[#8a8d96]">{t("No files uploaded yet. Files become downloadable for the buyer once the order is delivered.", "업로드된 파일이 없습니다. 납품 완료 후 구매자가 파일을 내려받을 수 있습니다.")}</p>
              ) : (
              <div className="mt-2 overflow-hidden rounded-lg border border-[#eef0f3]">
                <DataTable head={[t("File", "파일"), t("Size", "크기"), t("Uploaded", "업로드"), ""]}>
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td className="max-w-[300px] truncate font-medium">{f.filename}</td>
                      <td className="whitespace-nowrap text-[#6b6e78]">{bytes(f.bytes)}</td>
                      <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(f.createdAt, lang, true)}</td>
                      <td className="text-right"><a className="rc-btn rc-btn-outline rc-btn-sm" href={`/api/download/deliverable/${f.id}`}><Download />{t("Download", "다운로드")}</a></td>
                    </tr>
                  ))}
                </DataTable>
              </div>
              )}

              {o.deliveryNote && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold text-[#6b6e78]">{t("Delivery message sent", "전달한 납품 메시지")} · {formatDate(o.deliveredAt, lang, true)}</h3>
                  <p className="!mt-1.5 whitespace-pre-wrap rounded-lg bg-[#f0fbf5] px-4 py-3 text-sm leading-relaxed text-[#17663f]">{o.deliveryNote}</p>
                </div>
              )}

              {canDeliver && (
                <ActionForm action={sellerDeliverOrder} className="mt-5 grid gap-2" resetOnSuccess>
                  <input type="hidden" name="orderId" value={o.id} />
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">{o.fulfillmentStatus === "delivered" ? t("Send an updated delivery", "수정 납품 보내기") : t("Delivery message", "납품 메시지")}<span className="text-[#e5484d]">*</span></span>
                    <textarea name="note" required maxLength={4000} className="rc-textarea" placeholder={t("Describe what you delivered, links, and how to use the files.", "납품 내용, 링크, 파일 사용 방법 등을 적어주세요.")} />
                  </label>
                  <button className="rc-btn rc-btn-primary justify-self-end">{o.fulfillmentStatus === "delivered" ? t("Send update", "수정 납품") : t("Mark delivered & notify buyer", "납품 완료 · 구매자 알림")}</button>
                </ActionForm>
              )}
              {o.status !== "paid" && <div className="mt-4"><Notice tone="warn">{t("Production actions are only available for paid orders.", "제작 처리는 결제 완료 주문에서만 가능합니다.")}</Notice></div>}
            </Panel>
          )}

          <Panel title={t("Timeline", "처리 이력")}>
            {events.length ? (
              <div className="rc-timeline">
                {events.map((e) => (
                  <div key={e.id}>
                    <i className={e.type === "refunded" || e.type.includes("fail") ? "!bg-[#e5484d]" : e.type === "paid" || e.type === "delivered" ? "!bg-[#16a36a]" : ""} />
                    <div>
                      <div className="text-sm text-[#1c1d22]">{label(orderEventType, e.type, lang)}</div>
                      {e.message && <div className="text-xs text-[#6b6e78]">{e.message}</div>}
                      <div className="text-[11px] text-[#8a8d96]">{formatDate(e.createdAt, lang, true)}{e.actorRole ? ` · ${e.actorRole}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title={t("No events", "이력이 없습니다")} />}
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title={t("Payment", "결제 정보")}>
            <DetailList
              items={[
                [t("Subtotal", "상품 금액"), money(o.subtotalCents)],
                [t("Discount", "할인"), o.discountCents ? `-${money(o.discountCents)}${o.couponCode ? ` (${o.couponCode})` : ""}` : "—"],
                [t("Total paid", "결제 금액"), <b key="t">{money(o.totalCents)}</b>],
                [
                  t("Commission", "판매 수수료"),
                  o.discountCents === 0
                    ? `${money(o.commissionCents)} (${(o.commissionBps / 100).toFixed(1)}%)`
                    : o.commissionCents < Math.round((o.subtotalCents * o.commissionBps) / 10000)
                      // The fee never exceeds what the buyer paid, so a deep discount caps it below the list-price rate.
                      ? t(`${money(o.commissionCents)} — capped at the amount paid (${(o.commissionBps / 100).toFixed(1)}% of the ${money(o.subtotalCents)} list price would be ${money(Math.round((o.subtotalCents * o.commissionBps) / 10000))})`, `${money(o.commissionCents)} · 결제 금액까지만 부과 (정가 ${money(o.subtotalCents)}의 ${(o.commissionBps / 100).toFixed(1)}%는 ${money(Math.round((o.subtotalCents * o.commissionBps) / 10000))})`)
                      : t(`${money(o.commissionCents)} (${(o.commissionBps / 100).toFixed(1)}% of the ${money(o.subtotalCents)} list price — coupon discounts are not deducted from the fee)`, `${money(o.commissionCents)} (정가 ${money(o.subtotalCents)}의 ${(o.commissionBps / 100).toFixed(1)}% · 쿠폰 할인은 수수료에서 차감되지 않습니다)`),
                ],
                [t("Seller net", "판매자 정산액"), <b key="n" className="text-[#16794a]">{money(o.sellerNetCents)}</b>],
                ...(o.refundedCents ? [[t("Refunded", "환불 금액"), `${money(o.refundedCents)} · ${formatDate(o.refundedAt, lang)}`] as [string, string]] : []),
                [t("Paid at", "결제일시"), formatDate(o.paidAt, lang, true)],
                [t("Settlement", "정산"), settlement ? <Link key="s" href={`/seller/settlements/${settlement.id}`} className="text-[#2f4ac2] hover:underline">{formatDate(settlement.createdAt, lang)}</Link> : o.status === "paid" && o.totalCents === 0 ? t("Free order · nothing to settle", "무료 주문 · 정산 대상 아님") : hold ? (hold.reasons.length ? t(`Holding: ${hold.reasons.map((r) => holdLabel[r]).join(", ")}`, `보류: ${hold.reasons.map((r) => holdLabel[r]).join(", ")}`) : t("Included in the next payout", "다음 정산에 포함")) : "—"],
              ]}
            />
            {o.refundStatus === "rejected" && o.refundRejectReason && <div className="mt-4"><Notice>{t("Refund rejected", "환불 거절 사유")}: {o.refundRejectReason}</Notice></div>}
          </Panel>

          <Panel title={t("Buyer", "구매자")}>
            <DetailList items={[[t("Name", "이름"), o.buyerName], [t("Email", "이메일"), <a key="e" className="text-[#2f4ac2] hover:underline" href={`mailto:${o.buyerEmail}`}>{o.buyerEmail}</a>]]} />
          </Panel>

          <Panel title={t("Attribution", "유입 경로")}>
            <DetailList
              items={[
                [t("Source", "소스"), o.source ?? "—"],
                [t("Medium", "매체"), o.medium ?? "—"],
                [t("Campaign", "캠페인"), o.campaign ?? "—"],
                [t("Deep link", "딥링크"), link ? <Link key="l" href={`/seller/links/${link.id}`} className="text-[#2f4ac2] hover:underline">{link.name} ({link.code})</Link> : "—"],
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
