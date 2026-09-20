import type { Metadata } from "next";
import { and, count, eq, isNotNull, isNull, ne } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getLang } from "@/lib/server/i18n-server";
import { LangProvider } from "@/components/common/lang-provider";
import { ConsoleShell, type NavGroup } from "@/components/console/shell";
import { expireStaleOrders } from "@/lib/server/commerce";
import { unreadForStaff } from "@/lib/server/inquiries";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Ringo Admin" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin();
  const db = await getDb();
  // Safety net when no scheduler is configured: close unpaid orders past the payment window.
  await expireStaleOrders(db).catch(() => 0);
  const lang = await getLang("ko");
  const n = async (q: Promise<{ v: number }[]>) => (await q)[0]?.v ?? 0;
  const [pendingProducts, contentChanges, pendingSellers, refundRequests, openInquiries, pendingService] = await Promise.all([
    n(db.select({ v: count() }).from(s.products).where(eq(s.products.status, "pending_review"))),
    // Live products whose deliverables a seller changed after approval, waiting for an operator to look.
    n(db.select({ v: count() }).from(s.products).where(isNotNull(s.products.contentChangedAt))),
    n(db.select({ v: count() }).from(s.sellers).where(eq(s.sellers.status, "pending"))),
    n(db.select({ v: count() }).from(s.orders).where(eq(s.orders.refundStatus, "requested"))),
    // Only platform-routed threads: seller threads are the seller's queue and were inflating this badge.
    n(db.select({ v: count() }).from(s.inquiries).where(and(ne(s.inquiries.status, "closed"), isNull(s.inquiries.sellerId), unreadForStaff))),
    n(db.select({ v: count() }).from(s.orders).where(and(eq(s.orders.status, "paid"), eq(s.orders.fulfillmentStatus, "pending")))),
  ]);

  const groups: NavGroup[] = [
    { id: "dashboard", en: "Dashboard", ko: "대시보드", icon: "LayoutDashboard", href: "/admin" },
    { id: "products", en: "Products", ko: "상품 관리", icon: "Package", badge: pendingProducts + contentChanges, items: [
      { href: "/admin/products", en: "Product list", ko: "상품 목록", badge: contentChanges },
      { href: "/admin/products/review", en: "Review queue", ko: "상품 심사", badge: pendingProducts },
      { href: "/admin/categories", en: "Categories", ko: "분류 관리" },
      { href: "/admin/reviews", en: "Buyer reviews", ko: "구매평 관리" },
    ] },
    { id: "orders", en: "Orders", ko: "주문 관리", icon: "ShoppingCart", badge: refundRequests, items: [
      { href: "/admin/orders", en: "All orders", ko: "전체 주문" },
      { href: "/admin/orders/fulfillment", en: "Service production", ko: "제작 주문 관리", badge: pendingService },
      { href: "/admin/orders/refunds", en: "Refund requests", ko: "환불 요청", badge: refundRequests },
      { href: "/admin/payments", en: "Payments", ko: "결제 내역" },
    ] },
    { id: "members", en: "Members", ko: "회원 관리", icon: "Users", items: [
      { href: "/admin/members", en: "Member list", ko: "회원 목록" },
      { href: "/admin/operators", en: "Operators", ko: "운영자 관리" },
    ] },
    { id: "sellers", en: "Sellers", ko: "판매자 관리", icon: "Store", badge: pendingSellers, items: [
      { href: "/admin/sellers/applications", en: "Applications", ko: "입점 신청", badge: pendingSellers },
      { href: "/admin/sellers", en: "Seller list", ko: "판매자 목록" },
      { href: "/admin/settlements", en: "Settlements", ko: "정산 관리" },
    ] },
    { id: "marketing", en: "Marketing", ko: "마케팅", icon: "Megaphone", items: [
      { href: "/admin/coupons", en: "Coupons", ko: "쿠폰 관리" },
      { href: "/admin/links", en: "Deep links", ko: "딥링크 현황" },
      { href: "/admin/banners", en: "Banners", ko: "배너 관리" },
    ] },
    { id: "support", en: "Customer care", ko: "고객 지원", icon: "MessageSquare", badge: openInquiries, items: [
      { href: "/admin/inquiries", en: "Inquiries", ko: "1:1 문의", badge: openInquiries },
      { href: "/admin/notices", en: "Notices", ko: "공지사항" },
      { href: "/admin/messages", en: "Email log", ko: "메일 발송 내역" },
    ] },
    { id: "analytics", en: "Analytics", ko: "통계", icon: "ChartColumn", items: [
      { href: "/admin/analytics", en: "Sales", ko: "매출 통계" },
      { href: "/admin/analytics/products", en: "Products", ko: "상품 통계" },
      { href: "/admin/analytics/traffic", en: "Traffic sources", ko: "유입 경로" },
    ] },
    { id: "settings", en: "Settings", ko: "설정", icon: "Settings", items: [
      { href: "/admin/settings", en: "Preferences", ko: "환경 설정" },
      { href: "/admin/settings/payments", en: "Payment providers", ko: "결제 연동" },
    ] },
    { id: "logs", en: "Logs", ko: "로그", icon: "ScrollText", items: [
      { href: "/admin/logs", en: "Audit log", ko: "관리 작업 로그" },
      { href: "/admin/logs/errors", en: "Error log", ko: "에러 로그" },
    ] },
  ];

  return (
    <LangProvider lang={lang}>
      <ConsoleShell groups={groups} workspace={{ en: "Super admin", ko: "최고 관리자", tone: "admin" }} user={{ name: viewer.user.name, email: viewer.user.email }}>
        {children}
      </ConsoleShell>
    </LangProvider>
  );
}
