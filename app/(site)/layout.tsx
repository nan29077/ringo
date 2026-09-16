import { SiteFooter, SiteHeader } from "@/components/site/site-header";
import { getT } from "@/lib/server/i18n-server";
import "../storefront.css";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow">{t("Skip to content", "본문 바로가기")}</a>
      <SiteHeader />
      <div id="main">{children}</div>
      <SiteFooter />
    </>
  );
}
