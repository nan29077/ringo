import type { Metadata } from "next";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getLang } from "@/lib/server/i18n-server";
import { sellerCounts } from "@/lib/server/seller-center";
import { LangProvider } from "@/components/common/lang-provider";
import { ConsoleShell, type NavGroup } from "@/components/console/shell";

export const metadata: Metadata = { title: { default: "Seller center", template: "%s · Ringo Seller" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireSeller();
  const db = await getDb();
  const lang = await getLang("ko");
  const c = await sellerCounts(db, viewer.seller.id);

  const groups: NavGroup[] = [
    { id: "dashboard", en: "Dashboard", ko: "대시보드", icon: "LayoutDashboard", href: "/seller" },
    { id: "products", en: "Products", ko: "상품 관리", icon: "Package", badge: c.rejectedProducts, items: [
      { href: "/seller/products", en: "Product list", ko: "상품 목록", badge: c.rejectedProducts },
      { href: "/seller/products/new", en: "Add product", ko: "상품 등록" },
    ] },
    { id: "orders", en: "Orders", ko: "주문 관리", icon: "ShoppingCart", badge: c.pendingService + c.refundRequests, items: [
      { href: "/seller/orders", en: "All orders", ko: "전체 주문" },
      { href: "/seller/orders/production", en: "Production queue", ko: "제작 대기열", badge: c.pendingService },
      { href: "/seller/orders/refunds", en: "Refund requests", ko: "환불 요청", badge: c.refundRequests },
    ] },
    { id: "marketing", en: "Marketing", ko: "마케팅", icon: "Megaphone", items: [
      { href: "/seller/links", en: "Deep links", ko: "딥링크" },
      { href: "/seller/coupons", en: "Coupons", ko: "쿠폰" },
    ] },
    { id: "settlements", en: "Settlements", ko: "정산", icon: "Wallet", href: "/seller/settlements" },
    { id: "inquiries", en: "Customer inquiries", ko: "고객 문의", icon: "MessageSquare", href: "/seller/inquiries", badge: c.openInquiries },
    { id: "reviews", en: "Reviews", ko: "구매평", icon: "Star", href: "/seller/reviews" },
    { id: "settings", en: "Store settings", ko: "스토어 설정", icon: "Settings", items: [
      { href: "/seller/settings", en: "Store profile", ko: "스토어 프로필" },
      { href: "/seller/settings/payout", en: "Payout account", ko: "정산 계좌" },
    ] },
    { id: "notices", en: "Notices", ko: "공지사항", icon: "Bell", href: "/seller/notices" },
  ];

  return (
    <LangProvider lang={lang}>
      <ConsoleShell groups={groups} workspace={{ en: "Seller center", ko: "판매자 센터", tone: "seller" }} user={{ name: viewer.seller.displayName, email: viewer.user.email }}>
        {children}
      </ConsoleShell>
    </LangProvider>
  );
}
