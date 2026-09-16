"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, LayoutDashboard, Library, LogOut, MessageCircle, Receipt, Shield, Store, UserRound } from "lucide-react";
import { useLang } from "@/components/common/lang-provider";
import { signOut } from "@/app/actions";

export function AccountNav({ name, email, role }: { name: string; email: string; role: "admin" | "seller" | "applicant" | "buyer" }) {
  const { t } = useLang();
  const path = usePathname();
  const items = [
    { href: "/account", label: t("Overview", "개요"), icon: LayoutDashboard, exact: true },
    { href: "/account/library", label: t("Library", "라이브러리"), icon: Library },
    { href: "/account/orders", label: t("Orders", "주문 내역"), icon: Receipt },
    { href: "/account/wishlist", label: t("Wishlist", "관심 상품"), icon: Heart },
    { href: "/account/inquiries", label: t("Inquiries", "문의 내역"), icon: MessageCircle },
    { href: "/account/profile", label: t("Profile & security", "프로필 · 보안"), icon: UserRound },
  ];
  return (
    <nav className="sf-account-nav">
      <div className="sf-account-user"><strong>{name}</strong><span>{email}</span></div>
      {items.map((i) => {
        const active = i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/");
        return <Link key={i.href} href={i.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><i.icon aria-hidden />{i.label}</Link>;
      })}
      <hr />
      {role === "admin" && <Link href="/admin"><Shield aria-hidden />{t("Admin console", "관리자 콘솔")}</Link>}
      {role === "seller" && <Link href="/seller"><Store aria-hidden />{t("Seller center", "판매자 센터")}</Link>}
      {role === "applicant" && <Link href="/sell/status"><Store aria-hidden />{t("Seller application", "입점 신청 현황")}</Link>}
      {role === "buyer" && <Link href="/sell"><Store aria-hidden />{t("Become a seller", "판매자 되기")}</Link>}
      <form action={signOut} className="contents"><button type="submit"><LogOut aria-hidden />{t("Sign out", "로그아웃")}</button></form>
    </nav>
  );
}
