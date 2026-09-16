import Link from "next/link";
import { Star } from "lucide-react";
import type { CardProduct } from "@/lib/server/storefront";
import { mediaUrl } from "@/lib/server/storage";
import { formatMoney, type Lang, type T } from "@/lib/i18n";
import { WishlistButton } from "./wishlist-button";

/** Storefront product card (server-rendered; only the heart is interactive). */
export function ProductCard({ p, lang, t, saved, signedIn, tag, priority }: { p: CardProduct; lang: Lang; t: T; saved: boolean; signedIn: boolean; tag?: string; priority?: boolean }) {
  const title = lang === "ko" ? p.titleKo || p.titleEn : p.titleEn;
  const href = `/p/${p.slug}`;
  const onSale = p.compareAtCents != null && p.compareAtCents > p.priceCents;
  return (
    <article className="product-card">
      <div className="card-image">
        <Link className="image-link" href={href} tabIndex={-1} aria-hidden>
          <img src={mediaUrl(p.coverKey)} alt="" loading={priority ? "eager" : "lazy"} />
        </Link>
        {(tag || onSale) && <span className="product-tag">{tag ?? t("SALE", "할인")}</span>}
        <WishlistButton productId={p.id} saved={saved} signedIn={signedIn} next={href} />
      </div>
      <div className="card-meta">
        <span>{lang === "ko" ? p.categoryKo : p.categoryEn}</span>
        {p.ratingAvg != null && (
          <span aria-label={t(`Rated ${(p.ratingAvg / 10).toFixed(1)} out of 5`, `평점 5점 만점에 ${(p.ratingAvg / 10).toFixed(1)}점`)}>
            <Star size={13} fill="currentColor" aria-hidden />
            {(p.ratingAvg / 10).toFixed(1)}
          </span>
        )}
      </div>
      <Link className="product-title block" href={href}>{title}</Link>
      <div className="card-bottom">
        <span>{p.sellerName}</span>
        <strong>
          {onSale && <s className="sf-compare">{formatMoney(p.compareAtCents, p.currency, lang)}</s>}
          {p.priceCents === 0 ? t("Free", "무료") : formatMoney(p.priceCents, p.currency, lang)}
        </strong>
      </div>
    </article>
  );
}
