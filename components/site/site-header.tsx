import Link from "next/link";
import { ArrowUpRight, Heart, Library, Menu, User } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { getT } from "@/lib/server/i18n-server";
import { LanguageToggle } from "@/components/common/language-toggle";
import { MobileMenu } from "./mobile-menu";

export async function SiteHeader() {
  const viewer = await getViewer();
  const { t } = await getT();
  const workspace = viewer ? (viewer.user.role === "admin" ? { href: "/admin", label: t("Admin", "관리자") } : viewer.seller?.status === "active" ? { href: "/seller", label: t("Seller center", "판매자 센터") } : null) : null;
  return (
    <>
      <div className="announcement">{t("Good ideas deserve great tools. Discover your next digital find.", "좋은 아이디어를 위한 멋진 도구. 새로운 디지털 콘텐츠를 만나보세요.")}<span>{t("CURATED BY CREATORS", "크리에이터가 만든 콘텐츠")}</span></div>
      <header className="site-header">
        <Link href="/" aria-label={t("Ringo home", "링고 홈")} className="brand"><img src="/favicon.svg" alt="" />ringo<span className="brand-dot">®</span></Link>
        <nav aria-label={t("Main", "주요 메뉴")}>
          <Link href="/#catalog" className="text-sm text-[#555751] hover:text-[#ed4b2e]">{t("Explore", "둘러보기")}</Link>
          <Link href="/?category=courses#catalog" className="text-sm text-[#555751] hover:text-[#ed4b2e]">{t("Courses", "강의")}</Link>
          <Link href="/?category=ebooks#catalog" className="text-sm text-[#555751] hover:text-[#ed4b2e]">{t("eBooks", "전자책")}</Link>
          <Link href="/?category=design#catalog" className="text-sm text-[#555751] hover:text-[#ed4b2e]">{t("Design", "디자인")}</Link>
          <Link href="/sell" className="flex items-center gap-1 text-sm text-[#555751] hover:text-[#ed4b2e]">{t("Sell on Ringo", "링고에서 판매하기")}<ArrowUpRight size={14} aria-hidden /></Link>
        </nav>
        <div className="header-actions">
          <MobileMenu label={t("Menu", "메뉴")} icon={<Menu size={20} aria-hidden />}>
            <nav aria-label={t("Mobile menu", "모바일 메뉴")}>
              <Link href="/#catalog">{t("Explore", "둘러보기")}</Link>
              <Link href="/?category=courses#catalog">{t("Courses", "강의")}</Link>
              <Link href="/?category=ebooks#catalog">{t("eBooks", "전자책")}</Link>
              <Link href="/?category=design#catalog">{t("Design", "디자인")}</Link>
              <Link href="/sell">{t("Sell on Ringo", "링고에서 판매하기")}</Link>
              {viewer && (
                <>
                  <hr />
                  <Link href="/account/library">{t("Library", "라이브러리")}</Link>
                  <Link href="/account/wishlist">{t("Wishlist", "관심 상품")}</Link>
                  <Link href="/account/orders">{t("Orders", "주문 내역")}</Link>
                  {workspace && <Link href={workspace.href}>{workspace.label}</Link>}
                </>
              )}
              <hr />
              <Link href="/notices">{t("Notices", "공지사항")}</Link>
              <Link href="/account/inquiries">{t("Help & support", "고객센터")}</Link>
            </nav>
          </MobileMenu>
          <LanguageToggle className="lang-button" />
          {viewer ? (
            <>
              {workspace && <Link href={workspace.href} className="hidden rounded-md px-3 py-2 text-[13px] font-medium hover:bg-[#f3f3f0] lg:inline-flex">{workspace.label}</Link>}
              <Link href="/account/wishlist" aria-label={t("Wishlist", "관심 상품")} title={t("Wishlist", "관심 상품")} className="hidden size-10 items-center justify-center rounded-md text-[#555751] hover:bg-[#f3f3f0] sm:inline-flex"><Heart size={18} aria-hidden /></Link>
              <Link href="/account/library" aria-label={t("Library", "라이브러리")} title={t("Library", "라이브러리")} className="hidden size-10 items-center justify-center rounded-md text-[#555751] hover:bg-[#f3f3f0] sm:inline-flex"><Library size={18} aria-hidden /></Link>
              <Link href="/account" className="inline-flex h-10 items-center gap-2 rounded-[7px] border border-[#dcded7] bg-white px-3 text-sm text-[#252821] sm:px-4"><User size={16} aria-hidden /><span className="max-sm:sr-only">{t("My account", "내 계정")}</span></Link>
            </>
          ) : (
            <Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-[7px] border border-[#dcded7] bg-white px-4 text-sm text-[#252821]">{t("Log in", "로그인")}<ArrowUpRight size={15} aria-hidden /></Link>
          )}
        </div>
      </header>
    </>
  );
}

export async function SiteFooter() {
  const { t } = await getT();
  return (
    <footer className="site-footer shell">
      <div>
        <Link href="/" className="brand"><img src="/favicon.svg" alt="" />ringo</Link>
        <p>{t("Digital goods. Human creativity.", "디지털 콘텐츠. 사람의 창의성.")}</p>
      </div>
      <div className="flex-wrap">
        <span>© {new Date().getFullYear()} Ringo</span>
        <Link href="/notices">{t("Notices", "공지사항")}</Link>
        <Link href="/sell">{t("Become a seller", "판매자 입점")}</Link>
        <Link href="/account/inquiries">{t("Help & support", "고객센터")}</Link>
        <Link href="/terms">{t("Terms", "이용약관")}</Link>
        <Link href="/privacy">{t("Privacy", "개인정보 처리방침")}</Link>
      </div>
    </footer>
  );
}
