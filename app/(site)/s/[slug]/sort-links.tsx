import Link from "next/link";
import { getT } from "@/lib/server/i18n-server";

export async function SortLinks({ slug, sort }: { slug: string; sort: string }) {
  const { t } = await getT();
  const opts: [string, string][] = [["popular", t("Popular", "인기순")], ["newest", t("Newest", "최신순")], ["price-low", t("Price ↑", "낮은 가격")], ["price-high", t("Price ↓", "높은 가격")]];
  return (
    <nav className="sf-tabs !mb-0" aria-label={t("Sort products", "상품 정렬")}>
      {opts.map(([v, l]) => <Link key={v} href={`/s/${slug}${v === "popular" ? "" : `?sort=${v}`}`} className={sort === v ? "active" : ""} aria-current={sort === v ? "true" : undefined} scroll={false}>{l}</Link>)}
    </nav>
  );
}
