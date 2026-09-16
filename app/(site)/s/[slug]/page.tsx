import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, Globe, MessageCircle, Package } from "lucide-react";
import * as s from "@/db/schema";
import { getViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { appOrigin } from "@/lib/server/request";
import { one, type SP } from "@/lib/server/list";
import { listCatalog, wishlistIds } from "@/lib/server/storefront";
import { formatDate } from "@/lib/i18n";
import { ProductCard } from "@/components/store/product-card";
import { SortLinks } from "./sort-links";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

async function activeSeller(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(slug)) return null;
  const db = await getDb();
  const [seller] = await db.select().from(s.sellers).where(and(eq(s.sellers.slug, slug.toLowerCase()), eq(s.sellers.status, "active")));
  return seller ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const seller = await activeSeller(slug);
  if (!seller) return { title: "Store not found", robots: { index: false } };
  const origin = await appOrigin();
  const description = (seller.bio || `Digital products by ${seller.displayName} on Ringo.`).slice(0, 160);
  return {
    title: seller.displayName,
    description,
    alternates: { canonical: `${origin}/s/${seller.slug}` },
    openGraph: { title: `${seller.displayName} on Ringo`, description, images: seller.avatarKey ? [new URL(mediaUrl(seller.avatarKey), origin).toString()] : undefined },
  };
}

/** Safe external website link (http/https only). */
function websiteHref(raw: string | null) {
  if (!raw) return null;
  const v = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export default async function SellerStore({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const seller = await activeSeller(slug);
  if (!seller) notFound();
  const db = await getDb();
  const [{ t, lang }, viewer] = await Promise.all([getT(), getViewer()]);
  const sort = one(sp, "sort") || "popular";
  const catalog = await listCatalog(db, { sellerId: seller.id, sort, limit: 60 });
  const saved = await wishlistIds(db, viewer?.user.id, catalog.rows.map((p) => p.id));
  const site = websiteHref(seller.website);
  const initials = seller.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();

  return (
    <main className="ringo-home">
      <div className="rh-shell sf-page">
        <Link href="/#creators" className="!mb-6 inline-flex items-center gap-2 text-sm text-[#6b7065] hover:text-[#20211f]"><ArrowLeft size={16} aria-hidden />{t("All creators", "전체 크리에이터")}</Link>
        <section className="sf-card sf-card-pad mt-6 flex flex-wrap items-center gap-6 !bg-[#faf7f1]" aria-labelledby="store-title">
          {seller.avatarKey ? <img src={mediaUrl(seller.avatarKey)} alt="" className="size-24 rounded-full object-cover" /> : <span className="rh-studio-monogram ink !size-24 !text-[30px]" aria-hidden>{initials}</span>}
          <div className="min-w-0 flex-1">
            <p className="sf-kicker">{t("CREATOR STORE", "크리에이터 스토어")}</p>
            <h1 id="store-title" className="sf-h1">{seller.displayName}</h1>
            {seller.bio && <p className="!mt-3 max-w-[640px] whitespace-pre-line text-[16px] leading-relaxed text-[#55594f]">{seller.bio}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#6b7065]">
              <span className="inline-flex items-center gap-1.5"><Package size={16} aria-hidden />{t(`${catalog.total} ${catalog.total === 1 ? "product" : "products"}`, `상품 ${catalog.total}개`)}</span>
              <span>{t(`On Ringo since ${formatDate(seller.reviewedAt ?? seller.createdAt, lang)}`, `${formatDate(seller.reviewedAt ?? seller.createdAt, lang)}부터 링고에서 판매`)}</span>
              {site && <a href={site.toString()} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 sf-link"><Globe size={16} aria-hidden />{site.hostname}</a>}
            </div>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e7e3] pb-3">
          <h2 className="sf-h2">{t("Products", "상품")}</h2>
          <SortLinks slug={seller.slug} sort={catalog.sort} />
        </div>
        {catalog.rows.length ? (
          <div className="product-grid mt-6">
            {catalog.rows.map((p, i) => <ProductCard key={p.id} p={p} lang={lang} t={t} saved={saved.has(p.id)} signedIn={!!viewer} priority={i < 3} />)}
          </div>
        ) : (
          <div className="sf-empty"><Package aria-hidden /><h3>{t("No products on sale right now", "현재 판매 중인 상품이 없습니다")}</h3><p>{t("Check back soon for new releases.", "곧 새로운 상품이 올라올 예정이에요.")}</p></div>
        )}
        {catalog.rows[0] && (
          <p className="!mt-12 flex items-center gap-2 text-sm text-[#6b7065]"><MessageCircle size={16} aria-hidden />{t("Questions about a product? Use “Ask the seller” on its page.", "상품이 궁금하다면 상품 페이지의 ‘판매자에게 문의’를 이용하세요.")}</p>
        )}
      </div>
    </main>
  );
}
