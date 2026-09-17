import Link from "next/link";
import { Compass } from "lucide-react";
import { getT } from "@/lib/server/i18n-server";

/** Root 404: covers paths outside the storefront group (consoles, API-adjacent routes, typos). */
export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="access shell">
      <Compass size={44} aria-hidden />
      <p className="sf-kicker">404</p>
      <h1>{t("We couldn’t find that page", "페이지를 찾을 수 없습니다")}</h1>
      <p>{t("The link may be broken, or you may not have access to this area.", "링크가 잘못되었거나 접근 권한이 없는 영역일 수 있습니다.")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="sf-btn sf-btn-primary">{t("Go to the storefront", "쇼핑몰 홈으로")}</Link>
        <Link href="/account" className="sf-btn sf-btn-outline">{t("My account", "내 계정")}</Link>
      </div>
    </main>
  );
}
