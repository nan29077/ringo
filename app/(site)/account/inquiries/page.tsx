import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { MessageCircle, Plus } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { inquiryStatus } from "@/lib/status";
import { StatusBadge } from "@/components/console/status-badge";
import { AccountHeader, Empty, Pager } from "@/components/store/account-ui";

export const metadata = { title: "Inquiries" };

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireViewer("/account/inquiries");
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await getDb();
  const { page } = listParams(sp);
  const size = 15;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ inquiry: s.inquiries, sellerName: s.sellers.displayName })
      .from(s.inquiries)
      .leftJoin(s.sellers, eq(s.sellers.id, s.inquiries.sellerId))
      .where(eq(s.inquiries.userId, viewer.user.id))
      .orderBy(desc(s.inquiries.updatedAt))
      .limit(size)
      .offset((page - 1) * size),
    db.select({ total: count() }).from(s.inquiries).where(eq(s.inquiries.userId, viewer.user.id)),
  ]);
  return (
    <>
      <AccountHeader
        title={t("Inquiries", "문의 내역")}
        description={t("Questions to sellers and Ringo support. Replies are also sent by email.", "판매자와 링고 고객센터에 보낸 문의입니다. 답변은 이메일로도 안내됩니다.")}
        actions={<Link href="/account/inquiries/new" className="sf-btn sf-btn-primary sf-btn-sm"><Plus aria-hidden />{t("New inquiry", "새 문의")}</Link>}
      />
      <div className="sf-card">
        {rows.length ? (
          <ul className="sf-list">
            {rows.map(({ inquiry: q, sellerName }) => (
              <li key={q.id} className="sf-row">
                <MessageCircle size={18} className="text-[#7c8570]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Link href={`/account/inquiries/${q.id}`} className="block truncate font-semibold text-[#20211f] hover:underline">{q.subject}</Link>
                  <p className="text-[13px] text-[#6b7065]">{t("To", "받는 곳")}: {sellerName ?? t("Ringo support", "링고 고객센터")} · {t(`Updated ${formatDate(q.updatedAt, lang, true)}`, `${formatDate(q.updatedAt, lang, true)} 업데이트`)}</p>
                </div>
                <StatusBadge map={inquiryStatus} value={q.status} lang={lang} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={MessageCircle} title={t("No inquiries yet", "아직 문의가 없어요")} body={t("Ask a seller about a product, or contact Ringo support about your account or payments.", "상품은 판매자에게, 계정·결제는 링고 고객센터에 문의할 수 있어요.")} action={<Link href="/account/inquiries/new" className="sf-btn sf-btn-primary sf-btn-sm">{t("New inquiry", "새 문의")}</Link>} />
        )}
      </div>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / size))} t={t} href={(p) => `/account/inquiries?page=${p}`} />
    </>
  );
}
