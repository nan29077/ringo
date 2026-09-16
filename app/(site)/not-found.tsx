import Link from "next/link";
import { Compass } from "lucide-react";
import { getT } from "@/lib/server/i18n-server";

export default async function StoreNotFound() {
  const { t } = await getT();
  return (
    <main className="access shell">
      <Compass size={44} aria-hidden />
      <p className="sf-kicker">404</p>
      <h1>{t("We couldn’t find that page", "페이지를 찾을 수 없습니다")}</h1>
      <p>{t("The link may be broken, or the product may no longer be available.", "링크가 잘못되었거나 더 이상 판매하지 않는 상품일 수 있습니다.")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/#catalog" className="sf-btn sf-btn-primary">{t("Browse products", "상품 둘러보기")}</Link>
        <Link href="/account/inquiries/new" className="sf-btn sf-btn-outline">{t("Contact support", "고객센터 문의")}</Link>
      </div>
    </main>
  );
}
