import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { Download, Mail } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { holdReasons, isUuid } from "@/lib/server/seller-center";
import { mediaUrl } from "@/lib/server/storage";
import { bytes, formatDate, formatMoney } from "@/lib/i18n";
import { deliveryType, fulfillmentStatus, orderStatus, paymentStatus, refundStatus, settlementStatus, userStatus } from "@/lib/status";
import { PageHeader, Panel, DetailList, Notice, DataTable, EmptyState, Badge } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { FileUploadButton } from "@/components/common/uploader";
import { adminApproveRefund, adminCancelOrder, adminDeliverOrder, adminForceRefund, adminRejectRefund, adminResendReceipt, adminSaveOrderMemo, adminStartProduction } from "../actions";

export const metadata = { title: "Order" };

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [row] = await db
    .select({ order: s.orders, product: s.products, seller: s.sellers, buyer: s.users })
    .from(s.orders)
    .innerJoin(s.products, eq(s.products.id, s.orders.productId))
    .innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId))
    .innerJoin(s.users, eq(s.users.id, s.orders.buyerId))
    .where(eq(s.orders.id, id));
  if (!row) notFound();
  const { order: o, product, seller, buyer } = row;

  const [events, files, payments, refunds, link, settlement, entitlement, settings] = await Promise.all([
    db.select({ e: s.orderEvents, actorEmail: s.users.email }).from(s.orderEvents).leftJoin(s.users, eq(s.users.id, s.orderEvents.actorId)).where(eq(s.orderEvents.orderId, id)).orderBy(desc(s.orderEvents.createdAt), desc(s.orderEvents.id)),
    db.select().from(s.orderDeliverables).where(eq(s.orderDeliverables.orderId, id)).orderBy(asc(s.orderDeliverables.createdAt)),
    db.select().from(s.payments).where(eq(s.payments.orderId, id)).orderBy(desc(s.payments.createdAt)),
    db.select({ r: s.refunds, by: s.users.email }).from(s.refunds).leftJoin(s.users, eq(s.users.id, s.refunds.processedBy)).where(eq(s.refunds.orderId, id)).orderBy(desc(s.refunds.createdAt)),
    o.linkId ? db.select().from(s.deepLinks).where(eq(s.deepLinks.id, o.linkId)).then((r) => r[0]) : Promise.resolve(undefined),
    o.settlementId ? db.select().from(s.settlements).where(eq(s.settlements.id, o.settlementId)).then((r) => r[0]) : Promise.resolve(undefined),
    db.select().from(s.entitlements).where(eq(s.entitlements.orderId, id)).then((r) => r[0]),
    getSettings(db),
  ]);

  const service = product.deliveryType === "service";
  const money = (c: number) => formatMoney(c, o.currency, lang);
  const overdue = o.status === "paid" && !!o.dueAt && o.dueAt.getTime() < Date.now() && (o.fulfillmentStatus === "pending" || o.fulfillmentStatus === "in_progress");
  const hold = o.status === "paid" && !o.settlementId ? holdReasons(o, settings.commerce.refundWindowDays) : null;
  const holdLabel: Record<string, string> = {
    refund_requested: t("refund requested", "환불 요청 처리 전"),
    not_delivered: t("not delivered yet", "납품 전"),
    refund_window: t(`refund window until ${formatDate(hold?.releaseAt, lang)}`, `환불 가능 기간 (${formatDate(hold?.releaseAt, lang)}까지)`),
  };
  const canDeliver = service && o.status === "paid" && ["pending", "in_progress", "delivered"].includes(o.fulfillmentStatus);
  const succeeded = payments.find((p) => p.status === "succeeded");

  return (
    <>
      <PageHeader
        title={o.orderNo}
        description={t(`Ordered ${formatDate(o.createdAt, lang, true)}`, `주문일시 ${formatDate(o.createdAt, lang, true)}`)}
        crumbs={[{ href: "/admin/orders", label: t("Orders", "주문 관리") }, { label: o.orderNo }]}
        actions={
          <>
            <div className="flex flex-wrap gap-1">
              <StatusBadge map={orderStatus} value={o.status} lang={lang} />
              {o.fulfillmentStatus !== "not_required" && <StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} />}
              {o.refundStatus !== "none" && o.refundStatus !== o.status && <StatusBadge map={refundStatus} value={o.refundStatus} lang={lang} />}
            </div>
            {(o.status === "paid" || o.status === "refunded") && (
              <ActionButton action={adminResendReceipt.bind(null, o.id)} confirm={t(`Send the receipt again to ${o.buyerEmail}?`, `${o.buyerEmail}로 영수증을 다시 보낼까요?`)}>
                <Mail />{t("Resend receipt", "영수증 재발송")}
              </ActionButton>
            )}
            {o.status === "pending_payment" && (
              <ActionButton variant="destructive" action={adminCancelOrder.bind(null, o.id)} confirm={t("Cancel this unpaid order? Pending payment attempts are cancelled too.", "결제 전 주문을 취소할까요? 진행 중인 결제 시도도 함께 취소됩니다.")}>
                {t("Cancel order", "주문 취소")}
              </ActionButton>
            )}
          </>
        }
      />

      {payments.some((p) => p.status === "succeeded") && o.status !== "paid" && o.status !== "refunded" && (
        <div className="mb-4"><Notice tone="danger">{t("A payment succeeded while this order was not payable (late payment). Refund it in the provider console and note the refund reference in the admin memo.", "주문이 결제 불가 상태일 때 결제가 승인되었습니다(지연 결제). PG 관리자에서 환불한 뒤 관리자 메모에 환불 번호를 남기세요.")}</Notice></div>
      )}

      {o.status === "paid" && o.refundStatus === "requested" && (
        <Panel className="mb-4 !border-[#f7c9c7]" title={t("Refund requested", "환불 요청")} description={t("Approval refunds the full amount through the payment provider and revokes the buyer's access.", "승인하면 결제사를 통해 전액 환불되고 구매자의 이용 권한이 회수됩니다.")}>
          <p className="!mb-4 rounded-lg bg-[#fff3f2] px-4 py-3 text-sm text-[#a3302a]">{o.refundReason ?? "—"}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <ActionForm action={adminApproveRefund} className="grid content-start gap-2" confirm={t(`Refund ${money(o.totalCents)} to the buyer?`, `구매자에게 ${money(o.totalCents)}을 환불할까요?`)}>
              <input type="hidden" name="orderId" value={o.id} />
              <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Note (optional)", "메모 (선택)")}</span><input name="note" maxLength={500} className="rc-input" /></label>
              <button className="rc-btn rc-btn-brand justify-self-start">{t(`Approve refund · ${money(o.totalCents)}`, `환불 승인 · ${money(o.totalCents)}`)}</button>
            </ActionForm>
            <ActionForm action={adminRejectRefund} className="grid content-start gap-2" confirm={t("Reject this refund request? The buyer will be emailed the reason.", "환불 요청을 거절할까요? 구매자에게 사유가 메일로 전달됩니다.")}>
              <input type="hidden" name="orderId" value={o.id} />
              <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Reason for rejection", "거절 사유")}<span className="text-[#e5484d]">*</span></span><textarea name="reason" required maxLength={2000} className="rc-textarea !min-h-[64px]" placeholder={t("Shown to the buyer", "구매자에게 전달됩니다")} /></label>
              <button className="rc-btn rc-btn-danger justify-self-start">{t("Reject request", "요청 거절")}</button>
            </ActionForm>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title={t("Product", "상품")}>
            <div className="flex items-center gap-4">
              <img src={mediaUrl(product.coverKey)} alt="" className="rc-thumb !size-16" />
              <div className="min-w-0">
                <Link href={`/admin/products/${product.id}`} className="font-semibold hover:underline">{lang === "ko" ? product.titleKo : product.titleEn}</Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8a8d96]">
                  <StatusBadge map={deliveryType} value={product.deliveryType} lang={lang} />
                  <span>{t("Seller", "판매자")}: <Link href={`/admin/sellers/${seller.id}`} className="text-[#2f4ac2] hover:underline">{seller.displayName}</Link></span>
                  {o.productTitle !== product.titleEn && <span>{t("Ordered as", "주문 당시")}: {o.productTitle}</span>}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title={<>{t("Payment attempts", "결제 시도 내역")} <span className="ml-1 text-[#8a8d96]">{payments.length}</span></>} bodyClass="p-0">
            <DataTable head={[t("Provider", "결제사"), t("Reference", "거래 번호"), t("Method", "수단"), t("Status", "상태"), t("Amount", "금액"), t("Failure", "실패 사유"), t("Created", "생성")]} empty={<EmptyState title={t("No payment attempts", "결제 시도가 없습니다")} />}>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap font-medium">{p.provider}</td>
                  <td className="max-w-[180px] truncate font-mono text-xs">{p.providerRef ?? "—"}</td>
                  <td className="text-xs">{p.method ?? "—"}</td>
                  <td><StatusBadge map={paymentStatus} value={p.status} lang={lang} /></td>
                  <td className="whitespace-nowrap">{formatMoney(p.amountCents, p.currency, lang)}</td>
                  <td className="max-w-[200px] text-xs text-[#c0362c]">{p.failureReason ?? <span className="text-[#b3b5bc]">—</span>}</td>
                  <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(p.createdAt, lang, true)}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>

          {(refunds.length > 0 || o.status === "refunded") && (
            <Panel title={t("Refunds", "환불 내역")} bodyClass="p-0">
              <DataTable head={[t("Status", "상태"), t("Amount", "금액"), t("Reason", "사유"), t("Provider ref", "환불 거래번호"), t("Processed by", "처리자"), t("Created", "처리일시")]} empty={<EmptyState title={t("No refund records", "환불 기록이 없습니다")} />}>
                {refunds.map(({ r, by }) => (
                  <tr key={r.id}>
                    <td><Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status === "succeeded" ? t("Succeeded", "성공") : r.status === "failed" ? t("Failed", "실패") : t("Pending", "대기")}</Badge></td>
                    <td className="whitespace-nowrap">{money(r.amountCents)}</td>
                    <td className="max-w-[260px] text-xs">{r.reason ?? "—"}</td>
                    <td className="max-w-[160px] truncate font-mono text-xs">{r.providerRef ?? "—"}</td>
                    <td className="text-xs">{by ?? "—"}</td>
                    <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(r.createdAt, lang, true)}</td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          )}

          {service && (
            <Panel
              className={overdue ? "!border-[#f7c9c7]" : ""}
              title={t("Service production", "제작 · 납품")}
              description={o.dueAt ? t(`Due ${formatDate(o.dueAt, lang, true)}`, `납기 ${formatDate(o.dueAt, lang, true)}`) : undefined}
              actions={
                <>
                  {overdue && <Badge tone="red">{t("Overdue", "납기 지연")}</Badge>}
                  {o.status === "paid" && o.fulfillmentStatus === "pending" && (
                    <ActionButton action={adminStartProduction.bind(null, o.id)} confirm={t("Mark as in production on behalf of the seller?", "판매자 대신 제작 중으로 변경할까요?")}>{t("Mark in production", "제작 중으로 변경")}</ActionButton>
                  )}
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
                <p className="!mt-2 rounded-lg border border-dashed border-[#e1e3e8] px-4 py-4 text-center text-xs text-[#8a8d96]">{t("No files uploaded yet.", "업로드된 파일이 없습니다.")}</p>
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
                  <h3 className="text-xs font-semibold text-[#6b6e78]">{t("Delivery message", "납품 메시지")} · {formatDate(o.deliveredAt, lang, true)}</h3>
                  <p className="!mt-1.5 whitespace-pre-wrap rounded-lg bg-[#f0fbf5] px-4 py-3 text-sm leading-relaxed text-[#17663f]">{o.deliveryNote}</p>
                </div>
              )}

              {canDeliver && (
                <ActionForm action={adminDeliverOrder} className="mt-5 grid gap-2" resetOnSuccess confirm={t("Send this delivery to the buyer on behalf of the seller?", "판매자 대신 구매자에게 납품 처리할까요?")}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">{o.fulfillmentStatus === "delivered" ? t("Send an updated delivery", "수정 납품 보내기") : t("Delivery message (on behalf of seller)", "납품 메시지 (판매자 대리)")}<span className="text-[#e5484d]">*</span></span>
                    <textarea name="note" required maxLength={4000} className="rc-textarea" />
                  </label>
                  <button className="rc-btn rc-btn-primary justify-self-end">{o.fulfillmentStatus === "delivered" ? t("Send update", "수정 납품") : t("Mark delivered & notify buyer", "납품 완료 · 구매자 알림")}</button>
                </ActionForm>
              )}
            </Panel>
          )}

          {o.status === "paid" && (
            <Panel title={t("Admin refund", "관리자 환불")} description={t("Refund the full amount without a buyer request, or record a refund already processed in the payment provider console.", "구매자 요청 없이 전액 환불하거나, PG 관리자 화면에서 이미 처리한 환불을 기록합니다.")}>
              <div className="grid gap-5 lg:grid-cols-2">
                <ActionForm action={adminForceRefund} className="grid content-start gap-2" confirm={t(`Refund ${money(o.totalCents)} through ${succeeded?.provider ?? "the provider"} and revoke access?`, `${succeeded?.provider ?? "결제사"}를 통해 ${money(o.totalCents)}을 환불하고 이용 권한을 회수할까요?`)}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <input type="hidden" name="mode" value="provider" />
                  <h3 className="text-sm font-semibold">{t("Force refund", "강제 환불")}</h3>
                  <p className="text-xs text-[#6b6e78]">{t("Calls the provider's refund API. If the provider cannot refund automatically, use the manual record instead.", "결제사 환불 API를 호출합니다. 자동 환불이 불가하면 오른쪽 수동 환불 기록을 이용하세요.")}</p>
                  <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Reason", "사유")}<span className="text-[#e5484d]">*</span></span><input name="reason" required maxLength={500} className="rc-input" /></label>
                  <button className="rc-btn rc-btn-danger justify-self-start">{t(`Refund ${money(o.totalCents)}`, `${money(o.totalCents)} 환불`)}</button>
                </ActionForm>
                <ActionForm action={adminForceRefund} className="grid content-start gap-2 rounded-lg border border-dashed border-[#e1e3e8] p-3" confirm={t("Record a manual refund? No money is moved by Ringo — make sure it was refunded in the PG console.", "수동 환불을 기록할까요? 링고는 금액을 이동하지 않습니다. PG 관리자에서 환불이 완료되었는지 확인하세요.")}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <input type="hidden" name="mode" value="manual" />
                  <h3 className="text-sm font-semibold">{t("Record manual refund", "수동 환불 기록")}</h3>
                  <Notice tone="warn">{t("Step 1: refund the payment in the provider (PG) console. Step 2: record it here — the order becomes refunded and access is revoked.", "1단계: PG 관리자 화면에서 결제를 먼저 환불하세요. 2단계: 여기서 기록하면 주문이 환불 완료로 바뀌고 이용 권한이 회수됩니다.")}</Notice>
                  <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Explanation (PG refund reference, etc.)", "설명 (PG 환불 번호 등)")}<span className="text-[#e5484d]">*</span></span><input name="reason" required maxLength={500} className="rc-input" /></label>
                  <label className="flex items-start gap-2 text-xs text-[#3b3d46]"><input type="checkbox" name="ack" required className="mt-0.5" />{t("I confirm the refund was already completed in the payment provider console.", "PG 관리자 화면에서 환불을 이미 완료했음을 확인합니다.")}</label>
                  <button className="rc-btn rc-btn-outline justify-self-start">{t("Record manual refund", "수동 환불 기록")}</button>
                </ActionForm>
              </div>
            </Panel>
          )}

          <Panel title={t("Timeline", "처리 이력")}>
            {events.length ? (
              <div className="rc-timeline">
                {events.map(({ e, actorEmail }) => (
                  <div key={e.id}>
                    <i className={e.type === "refunded" || e.type.includes("fail") || e.type === "late_payment" ? "!bg-[#e5484d]" : e.type === "paid" || e.type === "delivered" ? "!bg-[#16a36a]" : ""} />
                    <div>
                      <div className="text-sm text-[#1c1d22]">{e.message ?? e.type}</div>
                      <div className="text-[11px] text-[#8a8d96]">{formatDate(e.createdAt, lang, true)} · {e.type}{e.actorRole ? ` · ${e.actorRole}` : ""}{actorEmail ? ` (${actorEmail})` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title={t("No events", "이력이 없습니다")} />}
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Panel title={t("Amounts", "결제 금액")}>
            <DetailList
              items={[
                [t("Subtotal", "상품 금액"), money(o.subtotalCents)],
                [t("Discount", "할인"), o.discountCents ? `-${money(o.discountCents)}` : "—"],
                [t("Coupon", "쿠폰"), o.couponCode ?? "—"],
                [t("Total paid", "결제 금액"), <b key="t">{money(o.totalCents)}</b>],
                [t("Commission", "판매 수수료"), `${money(o.commissionCents)} (${(o.commissionBps / 100).toFixed(2)}% · ${o.commissionBps} bps)`],
                [t("Seller net", "판매자 정산액"), <b key="n" className="text-[#16794a]">{money(o.sellerNetCents)}</b>],
                ...(o.refundedCents ? [[t("Refunded", "환불 금액"), `${money(o.refundedCents)} · ${formatDate(o.refundedAt, lang, true)}`] as [string, string]] : []),
                [t("Paid at", "결제일시"), formatDate(o.paidAt, lang, true)],
                ...(o.cancelledAt ? [[t("Cancelled at", "취소일시"), formatDate(o.cancelledAt, lang, true)] as [string, string]] : []),
                [t("Access", "이용 권한"), entitlement ? <Badge key="e" tone={entitlement.status === "active" ? "green" : "gray"}>{entitlement.status === "active" ? t("Active", "이용 가능") : t(`Revoked ${formatDate(entitlement.revokedAt, lang)}`, `회수됨 ${formatDate(entitlement.revokedAt, lang)}`)}</Badge> : "—"],
                [t("Settlement", "정산"), settlement ? (
                  <Link key="s" href={`/admin/settlements/${settlement.id}`} className="inline-flex items-center gap-1.5 text-[#2f4ac2] hover:underline">{formatDate(settlement.createdAt, lang)} <StatusBadge map={settlementStatus} value={settlement.status} lang={lang} /></Link>
                ) : hold ? (hold.reasons.length ? t(`Holding: ${hold.reasons.map((r) => holdLabel[r]).join(", ")}`, `보류: ${hold.reasons.map((r) => holdLabel[r]).join(", ")}`) : t("Eligible for next payout", "다음 정산 대상")) : "—"],
              ]}
            />
            {o.refundStatus === "rejected" && o.refundRejectReason && <div className="mt-4"><Notice>{t("Refund rejected", "환불 거절 사유")}: {o.refundRejectReason}</Notice></div>}
          </Panel>

          <Panel title={t("Buyer", "구매자")} actions={<Link href={`/admin/members/${buyer.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Member", "회원 정보")}</Link>}>
            <DetailList
              items={[
                [t("Name", "이름"), o.buyerName],
                [t("Email", "이메일"), <a key="e" className="text-[#2f4ac2] hover:underline" href={`mailto:${o.buyerEmail}`}>{o.buyerEmail}</a>],
                [t("Account status", "계정 상태"), <StatusBadge key="u" map={userStatus} value={buyer.status} lang={lang} />],
              ]}
            />
          </Panel>

          <Panel title={t("Seller", "판매자")} actions={<Link href={`/admin/sellers/${seller.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Seller", "판매자 정보")}</Link>}>
            <DetailList items={[[t("Store", "스토어"), seller.displayName], [t("Commission at order", "주문 시 수수료"), `${(o.commissionBps / 100).toFixed(2)}%`]]} />
          </Panel>

          <Panel title={t("Attribution", "유입 경로")}>
            <DetailList
              items={[
                [t("Source", "소스"), o.source === "admin_grant" ? <Badge key="g" tone="violet">{t("Manual grant", "수동 지급")}</Badge> : o.source ?? "—"],
                [t("Medium", "매체"), o.medium ?? "—"],
                [t("Campaign", "캠페인"), o.campaign ?? "—"],
                [t("Deep link", "딥링크"), link ? <Link key="l" href={`/admin/links?q=${encodeURIComponent(link.code)}`} className="text-[#2f4ac2] hover:underline">{link.name} ({link.code})</Link> : "—"],
              ]}
            />
          </Panel>

          <Panel title={t("Admin memo", "관리자 메모")} description={t("Internal only. Not visible to buyers or sellers.", "내부용 메모로 구매자·판매자에게 보이지 않습니다.")}>
            <ActionForm action={adminSaveOrderMemo} className="grid gap-2">
              <input type="hidden" name="orderId" value={o.id} />
              <textarea key={o.adminMemo ?? ""} name="memo" maxLength={4000} defaultValue={o.adminMemo ?? ""} className="rc-textarea !min-h-[100px]" />
              <button className="rc-btn rc-btn-outline rc-btn-sm justify-self-end">{t("Save memo", "메모 저장")}</button>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
