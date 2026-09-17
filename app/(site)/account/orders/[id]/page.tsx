import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, Library, MessageCircle, PlayCircle, RotateCcw, Star } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { expireOrderIfStale } from "@/lib/server/commerce";
import { mediaUrl } from "@/lib/server/storage";
import { getProvider } from "@/lib/server/payments";
import { one, type SP } from "@/lib/server/list";
import { isUuid, pick } from "@/lib/server/storefront";
import { bytes, formatDate, formatMoney, type T } from "@/lib/i18n";
import { fulfillmentStatus, orderStatus, refundStatus } from "@/lib/status";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { AccountHeader, Card } from "@/components/store/account-ui";
import { Stars } from "@/components/store/stars";
import { cancelOrder } from "../../../checkout/actions";
import { submitRefundRequest } from "../../actions";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Order details" };

function eventLabel(type: string, t: T) {
  const map: Record<string, [string, string]> = {
    created: ["Order placed", "주문 접수"],
    payment_started: ["Payment started", "결제 시작"],
    paid: ["Payment completed", "결제 완료"],
    payment_failed: ["Payment not completed", "결제 미완료"],
    cancelled: ["Order cancelled", "주문 취소"],
    in_progress: ["Production started", "제작 시작"],
    delivered: ["Delivered", "납품 완료"],
    refund_requested: ["Refund requested", "환불 요청"],
    refund_rejected: ["Refund request declined", "환불 요청 거절"],
    refunded: ["Refunded", "환불 완료"],
  };
  const m = map[type];
  return m ? t(m[0], m[1]) : null;
}

function providerLabel(id: string | undefined, t: T) {
  if (!id) return "—";
  if (id === "free") return t("Free order", "무료 주문");
  if (id === "test") return t("Test payment (sandbox)", "테스트 결제 (샌드박스)");
  return getProvider(id)?.label ?? id;
}

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer(`/account/orders/${id}`);
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT();
  const [row] = await db
    .select({ order: s.orders, product: s.products, seller: s.sellers })
    .from(s.orders)
    .innerJoin(s.products, eq(s.products.id, s.orders.productId))
    .innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId))
    .where(and(eq(s.orders.id, id), eq(s.orders.buyerId, viewer.user.id)));
  if (!row) notFound();
  const { order: row_o, product: p, seller } = row;
  // Close a pending order whose payment window has passed, so the page never offers a dead payment button.
  const expired = await expireOrderIfStale(db, row_o, viewer);
  const o = expired && row_o.status === "pending_payment" ? { ...row_o, status: "expired" as const } : row_o;
  const [settings, events, payments, deliverables, [review], [entitlement]] = await Promise.all([
    getSettings(db),
    db.select().from(s.orderEvents).where(eq(s.orderEvents.orderId, o.id)).orderBy(desc(s.orderEvents.createdAt), desc(s.orderEvents.id)),
    db.select().from(s.payments).where(eq(s.payments.orderId, o.id)).orderBy(desc(s.payments.createdAt)),
    o.status === "paid" && o.fulfillmentStatus === "delivered" ? db.select().from(s.orderDeliverables).where(eq(s.orderDeliverables.orderId, o.id)).orderBy(asc(s.orderDeliverables.createdAt)) : Promise.resolve([]),
    db.select().from(s.productReviews).where(eq(s.productReviews.orderId, o.id)),
    db.select().from(s.entitlements).where(and(eq(s.entitlements.orderId, o.id), eq(s.entitlements.status, "active"))),
  ]);
  const money = (c: number) => formatMoney(c, o.currency, lang);
  const service = p.deliveryType === "service";
  const payment = payments.find((x) => x.status === "succeeded" || x.status === "refunded") ?? payments[0];
  const windowDays = settings.commerce.refundWindowDays;
  const refundDeadline = o.paidAt ? new Date(o.paidAt.getTime() + windowDays * 86400000) : null;
  const withinWindow = !!refundDeadline && refundDeadline.getTime() > Date.now();
  const canRequestRefund = o.status === "paid" && ["none", "rejected"].includes(o.refundStatus) && withinWindow && o.totalCents > 0;
  const canReview = o.status === "paid" && (!service || o.fulfillmentStatus === "delivered");
  const visibleEvents = events.map((e) => ({ ...e, label: eventLabel(e.type, t) })).filter((e) => e.label);
  const justPaid = one(sp, "paid") === "1";
  const paidOrRefunded = o.status === "paid" || o.status === "refunded";
  const title = pick(lang, p.titleEn, p.titleKo) || o.productTitle;

  return (
    <>
      <AccountHeader
        crumbs={[{ href: "/account/orders", label: t("Orders", "주문 내역") }, { label: o.orderNo }]}
        title={t(`Order ${o.orderNo}`, `주문 ${o.orderNo}`)}
        description={t(`Placed ${formatDate(o.createdAt, lang, true)}`, `${formatDate(o.createdAt, lang, true)} 주문`)}
        actions={<>
          <StatusBadge map={orderStatus} value={o.status} lang={lang} />
          {o.status === "paid" && service && <StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} />}
          {o.refundStatus !== "none" && <StatusBadge map={refundStatus} value={o.refundStatus} lang={lang} />}
        </>}
      />

      {justPaid && o.status === "paid" && (
        <div className="sf-notice sf-notice-good mb-5" role="status">
          <CheckCircle2 aria-hidden />
          <div>
            <strong>{t("Payment complete — it’s yours.", "결제가 완료되었습니다.")}</strong>{" "}
            {service ? t("The creator has been notified and will start on your order. Updates will appear on this page.", "크리에이터에게 주문이 전달되었습니다. 진행 상황은 이 페이지에서 확인할 수 있어요.") : t("You can open it in your library right now. A receipt was sent to your email.", "지금 바로 라이브러리에서 이용할 수 있어요. 영수증은 이메일로 발송되었습니다.")}
          </div>
        </div>
      )}
      {justPaid && o.status === "pending_payment" && (
        <div className="sf-notice sf-notice-info mb-5" role="status"><Clock aria-hidden />{t("We’re waiting for the payment provider to confirm your payment. Refresh this page in a moment.", "결제사의 결제 확인을 기다리고 있습니다. 잠시 후 새로고침해 주세요.")}</div>
      )}
      {o.status === "expired" && (
        <div className="sf-notice sf-notice-warn mb-5" role="status"><Clock aria-hidden />{t("The payment window for this order has passed, so it was cancelled. Nothing was charged — you can order the product again.", "결제 가능 시간이 지나 주문이 취소되었습니다. 결제된 금액은 없으며, 상품을 다시 주문할 수 있습니다.")}</div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 gap-5">
          <section className="sf-card sf-card-pad">
            <div className="flex flex-wrap items-center gap-4">
              <img src={mediaUrl(p.coverKey)} alt="" className="sf-thumb sf-thumb-lg" />
              <div className="min-w-[180px] flex-1">
                <Link href={`/p/${p.slug}`} className="block text-[17px] font-semibold text-[#20211f] hover:underline">{title}</Link>
                <p className="text-sm text-[#6b7065]"><Link href={`/s/${seller.slug}`} className="hover:underline">{seller.displayName}</Link>{p.formatLabel ? ` · ${p.formatLabel}` : ""}</p>
              </div>
              <div className="flex w-full flex-wrap gap-2 border-t border-[#efefeb] pt-4">
                {entitlement && p.deliveryType === "course" && <Link href={`/account/library/${p.id}`} className="sf-btn sf-btn-primary sf-btn-sm"><PlayCircle aria-hidden />{t("Open course", "강의 열기")}</Link>}
                {entitlement && !service && p.deliveryType !== "course" && <Link href={`/account/library/${p.id}`} className="sf-btn sf-btn-primary sf-btn-sm"><Library aria-hidden />{t("Open in library", "라이브러리에서 열기")}</Link>}
                <Link href={`/account/inquiries/new?order=${o.id}`} className="sf-btn sf-btn-outline sf-btn-sm"><MessageCircle aria-hidden />{t("Contact seller", "판매자 문의")}</Link>
              </div>
            </div>
          </section>

          {o.status === "pending_payment" && (
            <div className="sf-notice sf-notice-warn flex-wrap items-center" role="status">
              <AlertTriangle aria-hidden />
              <span className="min-w-0 flex-1">{t("This order hasn’t been paid yet.", "아직 결제되지 않은 주문입니다.")}</span>
              <Link href={`/checkout/${o.id}`} className="sf-btn sf-btn-primary sf-btn-sm">{t("Complete payment", "결제하기")}</Link>
              <ActionButton action={cancelOrder.bind(null, o.id)} confirm={t("Cancel this order?", "이 주문을 취소할까요?")} className="sf-btn sf-btn-danger sf-btn-sm">{t("Cancel order", "주문 취소")}</ActionButton>
            </div>
          )}

          {service && (
            <Card title={t("Service order", "제작 서비스")} id="service">
              <dl className="sf-dl">
                <dt>{t("Status", "진행 상태")}</dt><dd>{o.status === "paid" ? <StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} /> : "—"}</dd>
                {o.dueAt && <><dt>{t("Expected delivery", "납품 예정일")}</dt><dd>{formatDate(o.dueAt, lang)}</dd></>}
                {o.deliveredAt && <><dt>{t("Delivered", "납품일")}</dt><dd>{formatDate(o.deliveredAt, lang, true)}</dd></>}
                <dt>{t("Your brief", "요청 내용")}</dt><dd className="whitespace-pre-line">{o.brief || "—"}</dd>
                {o.deliveryNote && <><dt>{t("Note from the creator", "크리에이터 메모")}</dt><dd className="whitespace-pre-line">{o.deliveryNote}</dd></>}
              </dl>
              {deliverables.length > 0 && (
                <ul className="mt-5 grid gap-2 border-t border-[#efefeb] pt-4">
                  {deliverables.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <FileText size={17} className="text-[#7c8570]" aria-hidden />
                      <span className="min-w-0 flex-1 break-all">{f.filename} <span className="text-[#7a7e73]">· {bytes(f.bytes)}</span></span>
                      <a href={`/api/download/deliverable/${f.id}`} className="sf-btn sf-btn-dark sf-btn-sm" download><Download aria-hidden />{t("Download", "다운로드")}</a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {o.status !== "pending_payment" && o.status !== "cancelled" && o.status !== "expired" && (
            <Card title={t("Refund", "환불")} id="refund">
              {o.refundStatus === "requested" && <div className="sf-notice sf-notice-warn"><RotateCcw aria-hidden /><div><strong>{t("Refund requested — under review.", "환불 요청 검토 중입니다.")}</strong><p className="!mt-1 whitespace-pre-line">{t("Your reason:", "요청 사유:")} {o.refundReason}</p></div></div>}
              {o.refundStatus === "refunded" && <div className="sf-notice sf-notice-good"><CheckCircle2 aria-hidden /><div><strong>{t(`Refunded ${money(o.refundedCents)}`, `${money(o.refundedCents)} 환불 완료`)}</strong>{o.refundedAt && ` · ${formatDate(o.refundedAt, lang, true)}`}<p className="!mt-1">{t("Access to this product has been removed. It can take several business days for the money to appear, depending on your payment method.", "상품 이용 권한이 해제되었습니다. 결제 수단에 따라 환불 금액 반영까지 영업일 기준 며칠이 걸릴 수 있습니다.")}</p></div></div>}
              {o.refundStatus === "rejected" && <div className="sf-notice sf-notice-bad mb-4"><AlertTriangle aria-hidden /><div><strong>{t("Your refund request was declined.", "환불 요청이 거절되었습니다.")}</strong>{o.refundRejectReason && <p className="!mt-1 whitespace-pre-line">{t("Reason:", "사유:")} {o.refundRejectReason}</p>}</div></div>}
              {canRequestRefund && (
                <ActionForm action={submitRefundRequest} className="grid gap-3">
                  <input type="hidden" name="orderId" value={o.id} />
                  <p className="text-sm text-[#55594f]">{t(`You can request a refund until ${formatDate(refundDeadline, lang)}. The seller or Ringo support will review it.`, `${formatDate(refundDeadline, lang)}까지 환불을 요청할 수 있습니다. 판매자 또는 링고 고객센터가 검토합니다.`)}</p>
                  <label className="sf-field">
                    <span>{o.refundStatus === "rejected" ? t("Request again — reason", "다시 요청 · 사유") : t("Reason for refund", "환불 사유")}</span>
                    <textarea name="reason" required minLength={5} maxLength={2000} className="sf-textarea" placeholder={t("Tell us what went wrong", "어떤 문제가 있었는지 알려주세요")} />
                  </label>
                  <button className="sf-btn sf-btn-outline justify-self-start"><RotateCcw aria-hidden />{t("Request refund", "환불 요청")}</button>
                </ActionForm>
              )}
              {o.status === "paid" && o.refundStatus === "none" && !canRequestRefund && <p className="text-sm text-[#6b7065]">{o.totalCents === 0 ? t("Free orders can’t be refunded.", "무료 주문은 환불 대상이 아닙니다.") : t(`The ${windowDays}-day refund period for this order ended on ${formatDate(refundDeadline, lang)}. Contact the seller if you have a problem.`, `이 주문의 환불 가능 기간(${windowDays}일)이 ${formatDate(refundDeadline, lang)}에 종료되었습니다. 문제가 있다면 판매자에게 문의하세요.`)}</p>}
            </Card>
          )}

          {(review || canReview) && (
            <Card title={t("Your review", "내 리뷰")} id="review">
              {review ? (
                <div>
                  <div className="flex flex-wrap items-center gap-3 text-sm"><Stars value={review.rating} label={t(`${review.rating} out of 5`, `5점 만점에 ${review.rating}점`)} /><span className="text-[#6b7065]">{formatDate(review.createdAt, lang)}</span>{review.hidden && <span className="sf-pill">{t("Hidden by moderators", "운영 정책에 따라 숨김")}</span>}</div>
                  {review.body && <p className="!mt-2 whitespace-pre-line text-[15px] text-[#4f534a]">{review.body}</p>}
                </div>
              ) : (
                <>
                  <p className="!mb-4 flex items-center gap-2 text-sm text-[#55594f]"><Star size={16} aria-hidden />{t("How was it? Your review helps other buyers.", "어떠셨나요? 리뷰는 다른 구매자에게 큰 도움이 됩니다.")}</p>
                  <ReviewForm orderId={o.id} />
                </>
              )}
            </Card>
          )}

          <Card title={t("Timeline", "진행 기록")} id="timeline">
            {visibleEvents.length ? (
              <ol className="sf-timeline">
                {visibleEvents.map((e) => (
                  <li key={e.id}><i aria-hidden /><div><p className="font-medium text-[#20211f]">{e.label}</p><p className="text-[13px] text-[#6b7065]">{formatDate(e.createdAt, lang, true)}</p></div></li>
                ))}
              </ol>
            ) : <p className="text-sm text-[#6b7065]">—</p>}
          </Card>
        </div>

        <aside className="sf-card sf-card-pad xl:sticky xl:top-5" aria-labelledby="receipt-title">
          <h2 id="receipt-title" className="sf-h2 !mb-4">{paidOrRefunded ? t("Receipt", "영수증") : t("Order summary", "주문 내역")}</h2>
          <dl className="sf-dl !grid-cols-[max-content_1fr] !gap-x-4 text-[14px]">
            <dt>{t("Order no.", "주문번호")}</dt><dd className="font-mono text-[13px]">{o.orderNo}</dd>
            <dt>{t("Date", "주문일")}</dt><dd>{formatDate(o.createdAt, lang, true)}</dd>
            {o.paidAt && <><dt>{t("Paid", "결제일")}</dt><dd>{formatDate(o.paidAt, lang, true)}</dd></>}
            <dt>{t("Status", "상태")}</dt><dd><StatusBadge map={orderStatus} value={o.status} lang={lang} /></dd>
            <dt>{t("Payment", "결제 수단")}</dt><dd>{providerLabel(payment?.provider, t)}{payment?.method && payment.method !== payment.provider ? ` · ${payment.method}` : ""}</dd>
          </dl>
          <div className="mt-5 border-t border-[#efefeb] pt-3">
            <div className="sf-line"><span className="min-w-0 truncate">{title}</span><span>{money(o.subtotalCents)}</span></div>
            {o.discountCents > 0 && <div className="sf-line text-[#1f6a3d]"><span>{t("Coupon", "쿠폰")}{o.couponCode ? ` ${o.couponCode}` : ""}</span><span>−{money(o.discountCents)}</span></div>}
            <div className="sf-line sf-line-total"><span>{t("Total", "합계")}</span><span>{money(o.totalCents)}</span></div>
            {o.refundedCents > 0 && <div className="sf-line text-[#6b7065]"><span>{t("Refunded", "환불")}</span><span>−{money(o.refundedCents)}</span></div>}
          </div>
          <p className="!mt-4 text-[12px] leading-relaxed text-[#7a7e73]">
            {paidOrRefunded
              ? t(`Sold by ${seller.displayName} via Ringo. Receipt emailed to ${o.buyerEmail}.`, `판매자 ${seller.displayName} · 링고를 통해 판매. 영수증은 ${o.buyerEmail}(으)로 발송되었습니다.`)
              : t(`Sold by ${seller.displayName} via Ringo. A receipt is emailed once the payment completes.`, `판매자 ${seller.displayName} · 링고를 통해 판매. 영수증은 결제가 완료되면 발송됩니다.`)}
          </p>
        </aside>
      </div>
    </>
  );
}
