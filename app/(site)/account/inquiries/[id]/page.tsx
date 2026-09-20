import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getInquiryThread, markInquiryRead } from "@/lib/server/inquiries";
import { isUuid, pick } from "@/lib/server/storefront";
import { formatDate } from "@/lib/i18n";
import { inquiryStatus } from "@/lib/status";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { AccountHeader, Card } from "@/components/store/account-ui";
import { closeMyInquiry, replyToInquiry } from "../../actions";

export const metadata = { title: "Inquiry" };

export default async function InquiryThread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/account/inquiries/${id}`);
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT();
  const thread = await getInquiryThread(db, viewer, id).catch(() => null);
  // Opening the thread clears its unread badge for this side.
  if (thread) await markInquiryRead(db, thread.access, id);
  if (!thread || thread.inquiry.userId !== viewer.user.id) notFound();
  const { inquiry, messages } = thread;
  const [seller, product, order] = await Promise.all([
    inquiry.sellerId ? db.select({ name: s.sellers.displayName, slug: s.sellers.slug }).from(s.sellers).where(eq(s.sellers.id, inquiry.sellerId)).then((r) => r[0]) : undefined,
    inquiry.productId ? db.select({ slug: s.products.slug, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.products).where(eq(s.products.id, inquiry.productId)).then((r) => r[0]) : undefined,
    inquiry.orderId ? db.select({ id: s.orders.id, orderNo: s.orders.orderNo }).from(s.orders).where(and(eq(s.orders.id, inquiry.orderId), eq(s.orders.buyerId, viewer.user.id))).then((r) => r[0]) : undefined,
  ]);
  const recipient = seller?.name ?? t("Ringo support", "링고 고객센터");

  return (
    <>
      <AccountHeader
        crumbs={[{ href: "/account/inquiries", label: t("Inquiries", "문의 내역") }, { label: inquiry.subject }]}
        title={inquiry.subject}
        description={<>{t("To", "받는 곳")}: {recipient}{product && <> · <Link href={`/p/${product.slug}`} className="sf-link">{pick(lang, product.titleEn, product.titleKo)}</Link></>}{order && <> · <Link href={`/account/orders/${order.id}`} className="sf-link">{order.orderNo}</Link></>}</>}
        actions={<>
          <StatusBadge map={inquiryStatus} value={inquiry.status} lang={lang} />
          {inquiry.status !== "closed" && <ActionButton action={closeMyInquiry.bind(null, inquiry.id)} confirm={t("Mark this inquiry as resolved and close it?", "문제가 해결되어 문의를 종료할까요?")} className="sf-btn sf-btn-outline sf-btn-sm">{t("Close inquiry", "문의 종료")}</ActionButton>}
        </>}
      />
      <div className="grid max-w-[820px] gap-5">
        <Card title={t("Conversation", "대화")} id="conversation">
          <ol className="grid gap-3">
            {messages.map(({ m, authorName }) => {
              const mine = m.authorId === viewer.user.id;
              const who = mine ? t("You", "나") : m.authorRole === "admin" ? t("Ringo support", "링고 고객센터") : seller?.name ?? authorName ?? t("Seller", "판매자");
              return (
                <li key={m.id} className={`sf-bubble ${mine ? "justify-self-end bg-[#fff1ec]" : "justify-self-start bg-[#f3f4ef]"}`}>
                  <div className="mb-1 text-[12px] text-[#6b7065]"><b className="text-[#33352f]">{who}</b> · <time dateTime={m.createdAt.toISOString()}>{formatDate(m.createdAt, lang, true)}</time></div>
                  <p>{m.body}</p>
                </li>
              );
            })}
          </ol>
        </Card>
        {inquiry.status === "closed" ? (
          <div className="sf-notice">{t("This inquiry is closed.", "종료된 문의입니다.")} <Link href="/account/inquiries/new" className="sf-link">{t("Start a new inquiry", "새 문의 작성")}</Link></div>
        ) : (
          <Card title={t("Reply", "답장")} id="reply">
            <ActionForm action={replyToInquiry} resetOnSuccess className="grid gap-3">
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <label className="sf-field">
                <span className="sr-only">{t("Message", "메시지")}</span>
                <textarea name="body" required maxLength={5000} className="sf-textarea" placeholder={t(`Write a message to ${recipient}`, `${recipient}에게 메시지 작성`)} />
              </label>
              <button className="sf-btn sf-btn-dark justify-self-end">{t("Send", "보내기")}</button>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
