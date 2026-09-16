import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getInquiryThread } from "@/lib/server/inquiries";
import { isUuid } from "@/lib/server/seller-center";
import { formatDate } from "@/lib/i18n";
import { inquiryStatus } from "@/lib/status";
import { PageHeader, Panel, DetailList, Notice } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { sellerCloseInquiry, sellerReplyInquiry } from "../actions";

export const metadata = { title: "Inquiry" };

export default async function SellerInquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSeller();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [own] = await db.select({ id: s.inquiries.id }).from(s.inquiries).where(and(eq(s.inquiries.id, id), eq(s.inquiries.sellerId, viewer.seller.id)));
  if (!own) notFound();
  const thread = await getInquiryThread(db, viewer, id).catch(() => null);
  if (!thread) notFound();
  const { inquiry, userName, messages } = thread;
  const [product, order] = await Promise.all([
    inquiry.productId ? db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.products).where(and(eq(s.products.id, inquiry.productId), eq(s.products.sellerId, viewer.seller.id))).then((r) => r[0]) : undefined,
    inquiry.orderId ? db.select({ id: s.orders.id, orderNo: s.orders.orderNo }).from(s.orders).where(and(eq(s.orders.id, inquiry.orderId), eq(s.orders.sellerId, viewer.seller.id))).then((r) => r[0]) : undefined,
  ]);
  return (
    <>
      <PageHeader
        title={inquiry.subject}
        crumbs={[{ href: "/seller/inquiries", label: t("Customer inquiries", "고객 문의") }, { label: inquiry.subject }]}
        actions={<><StatusBadge map={inquiryStatus} value={inquiry.status} lang={lang} />{inquiry.status !== "closed" && <ActionButton action={sellerCloseInquiry.bind(null, inquiry.id)} confirm={t("Close this inquiry?", "문의를 종료할까요?")}>{t("Close inquiry", "문의 종료")}</ActionButton>}</>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-4">
          <Panel title={t("Conversation", "대화 내용")}>
            <div className="grid gap-3">
              {messages.map(({ m, authorName }) => {
                const mine = m.authorRole !== "buyer" && m.authorId !== inquiry.userId;
                return (
                  <div key={m.id} className={`max-w-[85%] rounded-xl px-4 py-3 ${mine ? "justify-self-end bg-[#fff1ed]" : "justify-self-start bg-[#f3f4f7]"}`}>
                    <div className="mb-1 text-[11px] text-[#8a8d96]">
                      <b className="text-[#3b3d46]">{m.authorId === inquiry.userId ? userName : m.authorRole === "admin" ? t("Ringo support", "링고 고객센터") : authorName ?? t("Seller", "판매자")}</b> · {formatDate(m.createdAt, lang, true)}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#1c1d22]">{m.body}</p>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title={t("Reply", "답변 작성")}>
            {inquiry.status === "closed" && <div className="mb-3"><Notice>{t("This inquiry is closed. Sending a reply reopens it as answered and notifies the customer.", "종료된 문의입니다. 답변을 등록하면 답변 완료 상태로 다시 열리고 고객에게 알림이 전송됩니다.")}</Notice></div>}
            <ActionForm action={sellerReplyInquiry} resetOnSuccess className="grid gap-3">
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <textarea name="body" required maxLength={5000} className="rc-textarea !min-h-[140px]" placeholder={t("Write your answer to the customer", "고객에게 보낼 답변을 입력하세요")} />
              <button className="rc-btn rc-btn-primary justify-self-end">{t("Send reply", "답변 등록")}</button>
            </ActionForm>
          </Panel>
        </div>
        <Panel title={t("Details", "문의 정보")} className="self-start">
          <DetailList
            items={[
              [t("Customer", "고객"), userName],
              [t("Category", "유형"), inquiry.category],
              [t("Product", "상품"), product ? <Link key="p" href={`/seller/products/${product.id}`} className="text-[#2f4ac2] hover:underline">{lang === "ko" ? product.titleKo : product.titleEn}</Link> : "—"],
              [t("Order", "주문"), order ? <Link key="o" href={`/seller/orders/${order.id}`} className="text-[#2f4ac2] hover:underline">{order.orderNo}</Link> : "—"],
              [t("Created", "등록일"), formatDate(inquiry.createdAt, lang, true)],
              [t("Updated", "최근 활동"), formatDate(inquiry.updatedAt, lang, true)],
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
