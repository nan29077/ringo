import Link from "next/link";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, BookOpen, Heart, MailWarning, MessageCircle, Receipt } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { pick } from "@/lib/server/storefront";
import { formatDate, formatMoney } from "@/lib/i18n";
import { inquiryStatus, orderStatus, label, deliveryType } from "@/lib/status";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton } from "@/components/common/action-form";
import { AccountHeader, Card, Empty } from "@/components/store/account-ui";
import { resendVerification } from "../(auth)/actions";

export const metadata = { title: "Overview" };

export default async function AccountHome() {
  const viewer = await requireViewer("/account");
  const { t, lang } = await getT();
  const db = await getDb();
  const uid = viewer.user.id;
  const [library, orders, inquiries, [{ libraryCount }], [{ orderCount }], [{ wishCount }]] = await Promise.all([
    db
      .select({ productId: s.products.id, slug: s.products.slug, titleEn: s.products.titleEn, titleKo: s.products.titleKo, coverKey: s.products.coverKey, deliveryType: s.products.deliveryType, orderId: s.entitlements.orderId, createdAt: s.entitlements.createdAt })
      .from(s.entitlements)
      .innerJoin(s.products, eq(s.products.id, s.entitlements.productId))
      .where(and(eq(s.entitlements.userId, uid), eq(s.entitlements.status, "active")))
      .orderBy(desc(s.entitlements.createdAt))
      .limit(4),
    db.select().from(s.orders).where(eq(s.orders.buyerId, uid)).orderBy(desc(s.orders.createdAt)).limit(5),
    db.select().from(s.inquiries).where(and(eq(s.inquiries.userId, uid), inArray(s.inquiries.status, ["open", "answered"]))).orderBy(desc(s.inquiries.updatedAt)).limit(3),
    db.select({ libraryCount: count() }).from(s.entitlements).where(and(eq(s.entitlements.userId, uid), eq(s.entitlements.status, "active"))),
    db.select({ orderCount: count() }).from(s.orders).where(eq(s.orders.buyerId, uid)),
    db.select({ wishCount: count() }).from(s.wishlists).where(eq(s.wishlists.userId, uid)),
  ]);
  const firstName = viewer.user.name.split(/\s+/)[0];
  const stats = [
    { href: "/account/library", label: t("In your library", "라이브러리"), value: libraryCount, icon: BookOpen },
    { href: "/account/orders", label: t("Orders", "주문"), value: orderCount, icon: Receipt },
    { href: "/account/wishlist", label: t("Saved", "관심 상품"), value: wishCount, icon: Heart },
  ];

  return (
    <>
      <AccountHeader title={t(`Hi, ${firstName}`, `${firstName}님, 안녕하세요`)} description={t("Your purchases, orders and messages in one place.", "구매한 콘텐츠, 주문, 문의를 한곳에서 확인하세요.")} />

      {!viewer.user.emailVerifiedAt && (
        <div className="sf-notice sf-notice-warn mb-6 flex-wrap items-center" role="status">
          <MailWarning aria-hidden />
          <span className="min-w-0 flex-1">{t(`Please verify your email address (${viewer.user.email}) to keep your account secure and receive receipts.`, `계정 보안과 영수증 수신을 위해 이메일 주소(${viewer.user.email})를 인증해 주세요.`)}</span>
          <ActionButton action={resendVerification} className="sf-btn sf-btn-outline sf-btn-sm">{t("Resend email", "인증 메일 다시 받기")}</ActionButton>
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-3">
        {stats.map((st) => (
          <Link key={st.href} href={st.href} className="sf-card flex items-center gap-3 p-4 transition hover:border-[#c9ccc0]">
            <st.icon size={20} className="hidden text-[#7c8570] sm:block" aria-hidden />
            <span className="min-w-0"><strong className="block text-[22px] font-semibold text-[#20211f]">{st.value}</strong><span className="block truncate text-[13px] text-[#6b7065]">{st.label}</span></span>
          </Link>
        ))}
      </div>

      <div className="grid gap-5">
        <Card title={t("Recently added to your library", "최근 라이브러리")} id="recent-lib" actions={<Link href="/account/library" className="sf-link text-sm">{t("View all", "전체 보기")}</Link>} pad={false}>
          {library.length ? (
            <ul className="grid gap-4 p-5 sm:grid-cols-2">
              {library.map((i) => (
                <li key={i.orderId} className="flex items-center gap-3">
                  <img src={mediaUrl(i.coverKey)} alt="" className="sf-thumb" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#20211f]">{pick(lang, i.titleEn, i.titleKo)}</p>
                    <p className="text-[13px] text-[#6b7065]">{label(deliveryType, i.deliveryType, lang)}</p>
                  </div>
                  <Link href={i.deliveryType === "service" ? `/account/orders/${i.orderId}` : `/account/library/${i.productId}`} className="sf-btn sf-btn-outline sf-btn-sm" aria-label={t(`Open ${pick(lang, i.titleEn, i.titleKo)}`, `${pick(lang, i.titleEn, i.titleKo)} 열기`)}><ArrowRight aria-hidden /></Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={BookOpen} title={t("Your library is empty", "라이브러리가 비어 있어요")} body={t("Products you buy will appear here.", "구매한 상품이 이곳에 표시됩니다.")} action={<Link href="/#catalog" className="sf-btn sf-btn-primary sf-btn-sm">{t("Browse products", "상품 둘러보기")}</Link>} />
          )}
        </Card>

        <Card title={t("Recent orders", "최근 주문")} id="recent-orders" actions={<Link href="/account/orders" className="sf-link text-sm">{t("View all", "전체 보기")}</Link>} pad={false}>
          {orders.length ? (
            <ul className="sf-list">
              {orders.map((o) => (
                <li key={o.id} className="sf-row">
                  <div className="min-w-0 flex-1">
                    <Link href={`/account/orders/${o.id}`} className="block truncate font-semibold text-[#20211f] hover:underline">{o.productTitle}</Link>
                    <p className="text-[13px] text-[#6b7065]">{o.orderNo} · {formatDate(o.createdAt, lang)}</p>
                  </div>
                  <StatusBadge map={orderStatus} value={o.status} lang={lang} />
                  <strong className="w-24 text-right text-[15px]">{formatMoney(o.totalCents, o.currency, lang)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Receipt} title={t("No orders yet", "아직 주문이 없어요")} />
          )}
        </Card>

        <Card title={t("Open inquiries", "진행 중인 문의")} id="open-inq" actions={<Link href="/account/inquiries/new" className="sf-link text-sm">{t("New inquiry", "새 문의")}</Link>} pad={false}>
          {inquiries.length ? (
            <ul className="sf-list">
              {inquiries.map((q) => (
                <li key={q.id} className="sf-row">
                  <MessageCircle size={18} className="text-[#7c8570]" aria-hidden />
                  <Link href={`/account/inquiries/${q.id}`} className="min-w-0 flex-1 truncate font-medium text-[#20211f] hover:underline">{q.subject}</Link>
                  <span className="text-[13px] text-[#6b7065]">{formatDate(q.updatedAt, lang)}</span>
                  <StatusBadge map={inquiryStatus} value={q.status} lang={lang} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-[#6b7065]">{t("No open inquiries. Need help? Send us a message any time.", "진행 중인 문의가 없습니다. 도움이 필요하면 언제든 문의하세요.")}</p>
          )}
        </Card>
      </div>
    </>
  );
}
