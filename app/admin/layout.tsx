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
      { href: "/admin/products/review", en: "Products to review", ko: "승인 대기 상품", badge: pendingProducts },
      { href: "/admin/categories", en: "Categories", ko: "카테고리" },
      { href: "/admin/reviews", en: "Buyer reviews", ko: "구매 후기" },
    ] },
    { id: "orders", en: "Orders", ko: "주문 관리", icon: "ShoppingCart", badge: refundRequests + pendingService, items: [
      { href: "/admin/orders", en: "All orders", ko: "전체 주문" },
      { href: "/admin/orders/fulfillment", en: "Custom orders to make", ko: "제작 요청 주문", badge: pendingService },
      { href: "/admin/orders/refunds", en: "Refund requests", ko: "환불 요청", badge: refundRequests },
      { href: "/admin/payments", en: "Payment history", ko: "결제 내역" },
    ] },
    { id: "members", en: "Members", ko: "회원 관리", icon: "Users", items: [
      { href: "/admin/members", en: "Member list", ko: "회원 목록" },
      { href: "/admin/operators", en: "Admin staff", ko: "관리자 계정" },
    ] },
    { id: "sellers", en: "Sellers", ko: "판매자 관리", icon: "Store", badge: pendingSellers, items: [
      { href: "/admin/sellers/applications", en: "Seller applications", ko: "입점 신청", badge: pendingSellers },
      { href: "/admin/sellers", en: "Seller list", ko: "판매자 목록" },
      { href: "/admin/settlements", en: "Seller payouts", ko: "판매자 정산" },
    ] },
    { id: "marketing", en: "Marketing", ko: "마케팅", icon: "Megaphone", items: [
      { href: "/admin/coupons", en: "Coupons", ko: "쿠폰 관리" },
      { href: "/admin/links", en: "Sales links", ko: "판매 링크" },
      { href: "/admin/banners", en: "Banners", ko: "배너 관리" },
    ] },
    { id: "support", en: "Customer support", ko: "고객 지원", icon: "MessageSquare", badge: openInquiries, items: [
      { href: "/admin/inquiries", en: "Inquiries", ko: "1:1 문의", badge: openInquiries },
      { href: "/admin/notices", en: "Notices", ko: "공지사항" },
      { href: "/admin/messages", en: "Sent emails", ko: "보낸 메일" },
    ] },
    { id: "analytics", en: "Reports", ko: "통계", icon: "ChartColumn", items: [
      { href: "/admin/analytics", en: "Sales report", ko: "매출 통계" },
      { href: "/admin/analytics/products", en: "Product report", ko: "상품 통계" },
      { href: "/admin/analytics/traffic", en: "Where buyers come from", ko: "방문 경로" },
    ] },
    { id: "settings", en: "Settings", ko: "설정", icon: "Settings", items: [
      { href: "/admin/settings", en: "Basic settings", ko: "기본 설정" },
      { href: "/admin/settings/payments", en: "Payment setup", ko: "결제 서비스 설정" },
    ] },
    { id: "logs", en: "Records", ko: "기록", icon: "ScrollText", items: [
      { href: "/admin/logs", en: "Admin activity", ko: "관리자 작업 기록" },
      { href: "/admin/logs/errors", en: "System errors", ko: "오류 기록" },
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
