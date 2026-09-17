import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getInquiryThread } from "@/lib/server/inquiries";
import { isUuid } from "@/lib/server/admin-catalog";
import { formatDate, formatMoney } from "@/lib/i18n";
import { inquiryStatus, orderStatus } from "@/lib/status";
import { PageHeader, Panel, DetailList, Notice, Badge } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { adminCloseInquiry, adminReplyInquiry } from "../actions";
import { inquiryCategories } from "@/lib/inquiry-categories";

export const metadata = { title: "Inquiry" };

export default async function AdminInquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const thread = await getInquiryThread(db, viewer, id).catch(() => null);
  if (!thread) notFound();
  const { inquiry, userName, userEmail, messages } = thread;
  const [seller, product, order, [previous]] = await Promise.all([
    inquiry.sellerId ? db.select({ id: s.sellers.id, name: s.sellers.displayName, email: s.users.email }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(eq(s.sellers.id, inquiry.sellerId)).then((r) => r[0]) : undefined,
    inquiry.productId ? db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.products).where(eq(s.products.id, inquiry.productId)).then((r) => r[0]) : undefined,
    inquiry.orderId ? db.select().from(s.orders).where(eq(s.orders.id, inquiry.orderId)).then((r) => r[0]) : undefined,
    db.select({ n: count() }).from(s.inquiries).where(and(eq(s.inquiries.userId, inquiry.userId))),
  ]);
  const cat = inquiryCategories[inquiry.category];

  return (
    <>
      <PageHeader
        title={inquiry.subject}
        crumbs={[{ href: "/admin/inquiries", label: t("Inquiries", "1:1 문의") }, { label: inquiry.subject }]}
        actions={
          <>
            <StatusBadge map={inquiryStatus} value={inquiry.status} lang={lang} />
            {inquiry.status !== "closed" && <ActionButton action={adminCloseInquiry.bind(null, inquiry.id)} confirm={t("Close this inquiry? The customer can no longer reply.", "문의를 종료할까요? 고객은 더 이상 답글을 달 수 없습니다.")}>{t("Close inquiry", "문의 종료")}</ActionButton>}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-4">
          <Panel title={<>{t("Conversation", "대화 내용")} <span className="ml-1 text-[#8a8d96]">{messages.length}</span></>}>
            <div className="grid gap-3">
              {messages.map(({ m, authorName }) => {
                const customer = m.authorId === inquiry.userId;
                const who = customer ? userName : m.authorRole === "admin" ? `${t("Ringo support", "링고 고객센터")} (${authorName ?? "admin"})` : `${t("Seller", "판매자")} · ${authorName ?? seller?.name ?? ""}`;
                const bg = customer ? "justify-self-start bg-[#f3f4f7]" : m.authorRole === "admin" ? "justify-self-end bg-[#eaeefc]" : "justify-self-end bg-[#fff1ed]";
                return (
                  <div key={m.id} className={`max-w-[85%] rounded-xl px-4 py-3 ${bg}`}>
                    <div className="mb-1 text-[11px] text-[#8a8d96]"><b className="text-[#3b3d46]">{who}</b> · {formatDate(m.createdAt, lang, true)}</div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#1c1d22]">{m.body}</p>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title={t("Reply as Ringo support", "운영자 답변 작성")}>
            <div className="mb-3 grid gap-2">
              {inquiry.sellerId && <Notice>{t(`This inquiry is routed to the seller (${seller?.name ?? ""}). Your reply is shown as Ringo support.`, `판매자(${seller?.name ?? ""})에게 배정된 문의입니다. 답변은 '링고 고객센터' 명의로 표시됩니다.`)}</Notice>}
              {inquiry.status === "closed" && <Notice tone="warn">{t("This inquiry is closed. Replying reopens it as answered and notifies the customer.", "종료된 문의입니다. 답변하면 답변 완료 상태로 다시 열리고 고객에게 알림이 전송됩니다.")}</Notice>}
            </div>
            <ActionForm action={adminReplyInquiry} resetOnSuccess className="grid gap-3">
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <textarea name="body" required maxLength={5000} className="rc-textarea !min-h-[140px]" placeholder={t("Write your answer to the customer", "고객에게 보낼 답변을 입력하세요")} />
              <button className="rc-btn rc-btn-primary justify-self-end">{t("Send reply", "답변 등록")}</button>
            </ActionForm>
          </Panel>
        </div>
        <div className="grid content-start gap-4">
          <Panel title={t("Inquiry", "문의 정보")}>
            <DetailList
              items={[
                [t("Customer", "고객"), <span key="c"><Link href={`/admin/members/${inquiry.userId}`} className="text-[#2f4ac2] hover:underline">{userName}</Link><div className="text-[11px] text-[#8a8d96]">{userEmail}</div></span>],
                [t("Inquiries by customer", "고객 문의 수"), <Link key="n" href={`/admin/inquiries?q=${encodeURIComponent(userEmail)}`} className="hover:underline">{previous.n}</Link>],
                [t("Routed to", "담당"), seller ? <span key="s"><Badge tone="blue">{t("Seller", "판매자")}</Badge> <Link href={`/admin/sellers/${seller.id}`} className="text-[#2f4ac2] hover:underline">{seller.name}</Link><div className="text-[11px] text-[#8a8d96]">{seller.email}</div></span> : <Badge key="p" tone="violet">{t("Platform support", "플랫폼")}</Badge>],
                [t("Category", "유형"), cat ? t(cat[0], cat[1]) : inquiry.category],
                [t("Product", "상품"), product ? <Link key="p" href={`/admin/products/${product.id}`} className="text-[#2f4ac2] hover:underline">{lang === "ko" ? product.titleKo : product.titleEn}</Link> : "—"],
                [t("Created", "접수일"), formatDate(inquiry.createdAt, lang, true)],
                [t("Last activity", "최근 활동"), formatDate(inquiry.updatedAt, lang, true)],
              ]}
            />
          </Panel>
          {order && (
            <Panel title={t("Related order", "관련 주문")}>
              <DetailList
                items={[
                  [t("Order", "주문번호"), <Link key="o" href={`/admin/orders/${order.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{order.orderNo}</Link>],
                  [t("Amount", "금액"), formatMoney(order.totalCents, order.currency, lang)],
                  [t("Status", "상태"), <StatusBadge key="st" map={orderStatus} value={order.status} lang={lang} />],
                  [t("Paid", "결제일"), formatDate(order.paidAt, lang, true)],
                ]}
              />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
