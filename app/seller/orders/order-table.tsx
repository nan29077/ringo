import Link from "next/link";
import type { orders } from "@/db/schema";
import { formatDate, formatMoney, type Lang, type T } from "@/lib/i18n";
import { fulfillmentStatus, orderStatus, refundStatus } from "@/lib/status";
import { DataTable, EmptyState } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";

type Order = typeof orders.$inferSelect;

/** Order rows used by the seller order list, production queue and refund queue. */
export function OrderTable({ rows, t, lang, mode = "all", empty, footer }: { rows: Order[]; t: T; lang: Lang; mode?: "all" | "production" | "refunds"; empty: string; footer?: React.ReactNode }) {
  const now = Date.now();
  const head =
    mode === "production"
      ? [t("Due", "납기일"), t("Order", "주문번호"), t("Buyer", "구매자"), t("Product", "상품"), t("Brief", "요청 내용"), t("Status", "상태"), ""]
      : mode === "refunds"
        ? [t("Order", "주문번호"), t("Buyer", "구매자"), t("Product", "상품"), t("Amount", "금액"), t("Reason", "환불 사유"), t("Paid", "결제일"), ""]
        : [t("Order", "주문번호"), t("Buyer", "구매자"), t("Product", "상품"), t("Amount", "결제금액"), t("Seller net", "정산예정"), t("Status", "상태"), t("Source", "유입")];
  return (
    <DataTable head={head} empty={<EmptyState title={empty} />} footer={footer}>
      {rows.map((o) => {
        const orderCell = (
          <td className="whitespace-nowrap">
            <Link href={`/seller/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link>
            <div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div>
          </td>
        );
        const buyer = <td><div className="whitespace-nowrap">{o.buyerName}</div><div className="text-[11px] text-[#8a8d96]">{o.buyerEmail}</div></td>;
        const product = <td className="max-w-[240px] truncate">{o.productTitle}</td>;
        const manage = <td className="text-right"><Link href={`/seller/orders/${o.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Open", "처리")}</Link></td>;
        if (mode === "production") {
          const overdue = !!o.dueAt && o.dueAt.getTime() < now;
          const days = o.dueAt ? Math.ceil((o.dueAt.getTime() - now) / 86400000) : null;
          return (
            <tr key={o.id} className={overdue ? "[&>td]:!bg-[#fff5f4]" : ""}>
              <td className="whitespace-nowrap">
                <b className={overdue ? "text-[#c0362c]" : ""}>{formatDate(o.dueAt, lang)}</b>
                <div className={`text-[11px] ${overdue ? "font-semibold text-[#c0362c]" : "text-[#8a8d96]"}`}>
                  {days == null ? "—" : overdue ? t(`${Math.max(1, -days)} day(s) overdue`, `${Math.max(1, -days)}일 지연`) : days === 0 ? t("Due today", "오늘 마감") : t(`D-${days}`, `D-${days}`)}
                </div>
              </td>
              {orderCell}
              {buyer}
              {product}
              <td className="max-w-[260px]"><p className="line-clamp-2 text-xs text-[#5b5e68]">{o.brief ?? "—"}</p></td>
              <td><StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} />{o.refundStatus === "requested" && <div className="mt-1"><StatusBadge map={refundStatus} value="requested" lang={lang} /></div>}</td>
              {manage}
            </tr>
          );
        }
        if (mode === "refunds") {
          return (
            <tr key={o.id}>
              {orderCell}
              {buyer}
              {product}
              <td className="whitespace-nowrap font-medium">{formatMoney(o.totalCents, o.currency, lang)}</td>
              <td className="max-w-[280px]"><p className="line-clamp-2 text-xs text-[#5b5e68]">{o.refundReason ?? "—"}</p></td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(o.paidAt, lang)}</td>
              {manage}
            </tr>
          );
        }
        return (
          <tr key={o.id}>
            {orderCell}
            {buyer}
            {product}
            <td className="whitespace-nowrap font-medium">{formatMoney(o.totalCents, o.currency, lang)}{o.discountCents > 0 && <div className="text-[11px] text-[#8a8d96]">-{formatMoney(o.discountCents, o.currency, lang)}{o.couponCode ? ` · ${o.couponCode}` : ""}</div>}</td>
            <td className="whitespace-nowrap">{o.status === "paid" ? formatMoney(o.sellerNetCents, o.currency, lang) : <span className="text-[#b3b5bc]">—</span>}</td>
            <td>
              <div className="flex flex-wrap gap-1">
                <StatusBadge map={orderStatus} value={o.status} lang={lang} />
                {o.status === "paid" && o.fulfillmentStatus !== "not_required" && <StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} />}
                {o.refundStatus !== "none" && <StatusBadge map={refundStatus} value={o.refundStatus} lang={lang} />}
              </div>
            </td>
            <td className="text-xs text-[#6b6e78]">{o.source ?? "—"}{o.campaign && <div className="text-[11px] text-[#9a9ca5]">{o.campaign}</div>}</td>
          </tr>
        );
      })}
    </DataTable>
  );
}
