import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { daysAgo, salesSummary } from "@/lib/server/analytics";
import { isUuid, sellerBalance } from "@/lib/server/seller-center";
import { mediaUrl } from "@/lib/server/storage";
import { pct } from "@/lib/server/admin-ops";
import { formatDate, formatMoney } from "@/lib/i18n";
import { orderStatus, productStatus, refundStatus, sellerStatus, settlementStatus, userStatus } from "@/lib/status";
import { PageHeader, Panel, DetailList, DataTable, EmptyState, StatCard, Notice, Field } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionForm } from "@/components/common/action-form";
import { changeSellerStatus, saveSellerCommission, saveSellerMemo } from "../actions";

export const metadata = { title: "Seller" };

export default async function AdminSellerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [row] = await db.select({ x: s.sellers, owner: s.users }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(eq(s.sellers.id, id));
  if (!row) notFound();
  const { x, owner } = row;

  const [settings, summary, balance, products, [productCount], orders, settlements, [links]] = await Promise.all([
    getSettings(db),
    salesSummary(db, daysAgo(30), id),
    sellerBalance(db, id),
    db.select().from(s.products).where(eq(s.products.sellerId, id)).orderBy(desc(s.products.updatedAt)).limit(10),
    db.select({ n: count() }).from(s.products).where(eq(s.products.sellerId, id)),
    db.select().from(s.orders).where(eq(s.orders.sellerId, id)).orderBy(desc(s.orders.createdAt)).limit(10),
    db.select().from(s.settlements).where(eq(s.settlements.sellerId, id)).orderBy(desc(s.settlements.createdAt)).limit(10),
    db.select({ n: count() }).from(s.deepLinks).where(eq(s.deepLinks.sellerId, id)),
  ]);
  const cur = settings.site.currency;
  const m = (c: number) => formatMoney(c, cur, lang);
  const effectiveBps = x.commissionBps ?? settings.commerce.defaultCommissionBps;

  return (
    <>
      <PageHeader
        title={x.displayName}
        description={`/s/${x.slug}`}
        crumbs={[{ href: "/admin/sellers", label: t("Sellers", "판매자 관리") }, { label: x.displayName }]}
        actions={
          <>
            <StatusBadge map={sellerStatus} value={x.status} lang={lang} />
            <Link href={`/s/${x.slug}`} target="_blank" className="rc-btn rc-btn-outline rc-btn-sm"><ExternalLink />{t("View store", "스토어 보기")}</Link>
            <Link href={`/admin/orders?seller=${x.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Orders", "주문 보기")}</Link>
          </>
        }
      />
      {x.status === "suspended" && <div className="mb-4"><Notice tone="danger">{t("This store is suspended. Buyers cannot purchase its products and the seller cannot use the seller center.", "정지된 스토어입니다. 구매자는 상품을 구매할 수 없고 판매자는 판매자 센터를 이용할 수 없습니다.")}</Notice></div>}
      {x.status === "pending" && <div className="mb-4"><Notice tone="warn">{t("This application is awaiting review.", "심사 대기 중인 입점 신청입니다.")} <Link href="/admin/sellers/applications" className="font-semibold underline">{t("Review", "심사하기")}</Link></Notice></div>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Sales · 30 days", "30일 매출")} value={m(summary.gross)} hint={t(`${summary.orders} orders · refunds ${m(summary.refundCents)}`, `주문 ${summary.orders}건 · 환불 ${m(summary.refundCents)}`)} />
        <StatCard label={t("Commission · 30 days", "30일 수수료")} value={m(summary.commissionAfterRefunds)} hint={t("After refunds", "환불 반영")} tone="good" />
        <StatCard label={t("Available for payout", "정산 가능 금액")} value={m(balance.available.cents)} hint={t(`${balance.available.count} orders · holding ${m(balance.holding.cents)}`, `주문 ${balance.available.count}건 · 보류 ${m(balance.holding.cents)}`)} tone="info" href="/admin/settlements" />
        <StatCard label={t("Paid out total", "누적 지급액")} value={m(balance.paidOut.cents)} hint={t(`Awaiting transfer ${m(balance.awaitingTransfer.cents)}`, `지급 대기 ${m(balance.awaitingTransfer.cents)}`)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title={<>{t("Products", "상품")} <span className="ml-1 text-[#8a8d96]">{productCount.n}</span></>} bodyClass="p-0" actions={<Link href={`/admin/products?seller=${x.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("All products", "전체 보기")}</Link>}>
            <DataTable head={[t("Product", "상품"), t("Price", "판매가"), t("Sales", "판매"), t("Status", "상태"), t("Updated", "수정일")]} empty={<EmptyState title={t("No products", "상품이 없습니다")} />}>
              {products.map((p) => (
                <tr key={p.id}>
                  <td><div className="flex items-center gap-3"><img src={mediaUrl(p.coverKey)} alt="" className="rc-thumb !size-9" /><Link href={`/admin/products/${p.id}`} className="block max-w-[260px] truncate font-medium hover:underline">{lang === "ko" ? p.titleKo : p.titleEn}</Link></div></td>
                  <td className="whitespace-nowrap">{formatMoney(p.priceCents, p.currency, lang)}</td>
                  <td>{p.salesCount}</td>
                  <td><StatusBadge map={productStatus} value={p.status} lang={lang} /></td>
                  <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(p.updatedAt, lang)}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>

          <Panel title={t("Recent orders", "최근 주문")} bodyClass="p-0" actions={<Link href={`/admin/orders?seller=${x.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("All orders", "전체 보기")}</Link>}>
            <DataTable head={[t("Order", "주문번호"), t("Buyer", "구매자"), t("Product", "상품"), t("Total", "결제금액"), t("Net", "정산액"), t("Status", "상태")]} empty={<EmptyState title={t("No orders", "주문이 없습니다")} />}>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div></td>
                  <td className="text-xs">{o.buyerName}</td>
                  <td className="max-w-[220px] truncate">{o.productTitle}</td>
                  <td className="whitespace-nowrap">{formatMoney(o.totalCents, o.currency, lang)}</td>
                  <td className="whitespace-nowrap">{formatMoney(o.sellerNetCents, o.currency, lang)}</td>
                  <td><div className="flex flex-wrap gap-1"><StatusBadge map={orderStatus} value={o.status} lang={lang} />{o.refundStatus !== "none" && o.refundStatus !== o.status && <StatusBadge map={refundStatus} value={o.refundStatus} lang={lang} />}</div></td>
                </tr>
              ))}
            </DataTable>
          </Panel>

          <Panel title={t("Settlements", "정산 내역")} bodyClass="p-0" actions={<Link href={`/admin/settlements?seller=${x.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("All settlements", "전체 보기")}</Link>}>
            <DataTable head={[t("Period", "정산 기간"), t("Orders", "주문"), t("Net payout", "지급액"), t("Status", "상태"), t("Paid", "지급일")]} empty={<EmptyState title={t("No settlements yet", "정산 내역이 없습니다")} />}>
              {settlements.map((st) => (
                <tr key={st.id}>
                  <td className="whitespace-nowrap"><Link href={`/admin/settlements/${st.id}`} className="text-[#2f4ac2] hover:underline">{formatDate(st.periodStart, lang)} ~ {formatDate(st.periodEnd, lang)}</Link></td>
                  <td>{st.orderCount}</td>
                  <td className="whitespace-nowrap font-medium">{formatMoney(st.netCents, st.currency, lang)}</td>
                  <td><StatusBadge map={settlementStatus} value={st.status} lang={lang} /></td>
                  <td className="whitespace-nowrap text-xs">{formatDate(st.paidAt, lang)}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Panel title={t("Store profile", "스토어 정보")}>
            <div className="mb-4 flex items-center gap-3">
              <img src={x.avatarKey ? mediaUrl(x.avatarKey) : "/favicon.svg"} alt="" className="rc-thumb !size-12 !rounded-full" />
              <div className="min-w-0"><div className="font-semibold">{x.displayName}</div><div className="text-xs text-[#8a8d96]">/s/{x.slug}</div></div>
            </div>
            <DetailList
              items={[
                [t("Owner", "대표 계정"), <Link key="o" href={`/admin/members/${owner.id}`} className="text-[#2f4ac2] hover:underline">{owner.name} · {owner.email}</Link>],
                [t("Owner status", "계정 상태"), <StatusBadge key="us" map={userStatus} value={owner.status} lang={lang} />],
                [t("Website", "웹사이트"), x.website && /^https?:\/\//i.test(x.website) ? <a key="w" href={x.website} target="_blank" rel="noopener noreferrer nofollow" className="text-[#2f4ac2] hover:underline">{x.website}</a> : x.website ?? "—"],
                [t("Bio", "소개"), x.bio ?? "—"],
                [t("Deep links", "딥링크"), <Link key="l" href={`/admin/links?seller=${x.id}`} className="hover:underline">{t(`${links.n} links`, `${links.n}개`)}</Link>],
                [t("Applied", "신청일"), formatDate(x.createdAt, lang)],
                [t("Approved", "승인일"), formatDate(x.reviewedAt, lang)],
              ]}
            />
          </Panel>

          <Panel title={t("Commission", "판매 수수료")} description={t(`Current: ${pct(effectiveBps)}${x.commissionBps == null ? " (marketplace default)" : " (custom)"}. Changes apply to new orders only.`, `현재 ${pct(effectiveBps)}${x.commissionBps == null ? " (기본 수수료)" : " (개별 수수료)"}. 변경 내용은 신규 주문부터 적용됩니다.`)}>
            <ActionForm action={saveSellerCommission} className="grid gap-2" confirm={t("Change this seller's commission rate?", "이 판매자의 수수료율을 변경할까요?")}>
              <input type="hidden" name="sellerId" value={x.id} />
              <Field label={t("Custom commission (%)", "개별 수수료 (%)")} hint={t(`Leave blank to use the marketplace default (${pct(settings.commerce.defaultCommissionBps)}).`, `비워 두면 기본 수수료(${pct(settings.commerce.defaultCommissionBps)})가 적용됩니다.`)}>
                <input key={String(x.commissionBps)} name="percent" inputMode="decimal" pattern="^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)?$" className="rc-input" defaultValue={x.commissionBps != null ? (x.commissionBps / 100).toFixed(2) : ""} placeholder={(settings.commerce.defaultCommissionBps / 100).toFixed(2)} />
              </Field>
              <button className="rc-btn rc-btn-outline rc-btn-sm justify-self-end">{t("Save commission", "수수료 저장")}</button>
            </ActionForm>
          </Panel>

          <Panel title={t("Payout account", "정산 계좌")}>
            {x.payoutMethod && x.payoutAccountNumber ? (
              <DetailList items={[[t("Method", "수단"), x.payoutMethod.toUpperCase()], [t("Bank", "은행"), x.payoutBankName ?? "—"], [t("Account name", "예금주"), x.payoutAccountName ?? "—"], [t("Account number", "계좌번호"), <code key="n" className="text-xs">{x.payoutAccountNumber}</code>]]} />
            ) : (
              <Notice tone="warn">{t("No payout account registered. Payouts cannot be transferred.", "정산 계좌가 등록되지 않아 지급할 수 없습니다.")}</Notice>
            )}
          </Panel>

          {(x.status === "active" || x.status === "suspended") && (
            <Panel title={t("Store status", "스토어 상태")}>
              {x.status === "active" ? (
                <ActionForm action={changeSellerStatus} className="grid gap-2" confirm={t("Suspend this store? Its products can no longer be purchased and the seller center is locked.", "이 스토어를 정지할까요? 상품 구매가 차단되고 판매자 센터 이용이 제한됩니다.")}>
                  <input type="hidden" name="sellerId" value={x.id} />
                  <input type="hidden" name="status" value="suspended" />
                  <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Reason", "정지 사유")}<span className="text-[#e5484d]">*</span></span><textarea name="reason" required maxLength={500} className="rc-textarea !min-h-[64px]" placeholder={t("Recorded in the admin memo", "관리자 메모에 기록됩니다")} /></label>
                  <button className="rc-btn rc-btn-danger justify-self-start">{t("Suspend store", "스토어 정지")}</button>
                </ActionForm>
              ) : (
                <ActionForm action={changeSellerStatus} className="grid gap-2" confirm={t("Reactivate this store?", "이 스토어의 운영을 재개할까요?")}>
                  <input type="hidden" name="sellerId" value={x.id} />
                  <input type="hidden" name="status" value="active" />
                  <input name="reason" maxLength={500} className="rc-input" placeholder={t("Note (optional)", "메모 (선택)")} />
                  <button className="rc-btn rc-btn-primary justify-self-start">{t("Reactivate store", "운영 재개")}</button>
                </ActionForm>
              )}
            </Panel>
          )}

          <Panel title={t("Admin memo", "관리자 메모")} description={t("Internal only.", "내부용 메모입니다.")}>
            <ActionForm action={saveSellerMemo} className="grid gap-2">
              <input type="hidden" name="sellerId" value={x.id} />
              <textarea key={x.adminMemo ?? ""} name="memo" maxLength={4000} defaultValue={x.adminMemo ?? ""} className="rc-textarea !min-h-[120px]" />
              <button className="rc-btn rc-btn-outline rc-btn-sm justify-self-end">{t("Save memo", "메모 저장")}</button>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
