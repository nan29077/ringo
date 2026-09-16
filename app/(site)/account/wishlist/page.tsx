import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Heart } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { pick } from "@/lib/server/storefront";
import { formatMoney } from "@/lib/i18n";
import { WishlistButton } from "@/components/store/wishlist-button";
import { AccountHeader, Empty } from "@/components/store/account-ui";

export const metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const viewer = await requireViewer("/account/wishlist");
  const { t, lang } = await getT();
  const db = await getDb();
  const rows = await db
    .select({ product: s.products, seller: s.sellers, savedAt: s.wishlists.createdAt })
    .from(s.wishlists)
    .innerJoin(s.products, eq(s.products.id, s.wishlists.productId))
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .where(eq(s.wishlists.userId, viewer.user.id))
    .orderBy(desc(s.wishlists.createdAt));
  const owned = new Set(
    (await db.select({ id: s.entitlements.productId }).from(s.entitlements).where(and(eq(s.entitlements.userId, viewer.user.id), eq(s.entitlements.status, "active")))).map((r) => r.id),
  );

  return (
    <>
      <AccountHeader title={t("Wishlist", "관심 상품")} description={t("Products you’ve saved for later.", "나중에 보려고 저장한 상품입니다.")} />
      {rows.length === 0 ? (
        <div className="sf-card"><Empty icon={Heart} title={t("Nothing saved yet", "저장한 상품이 없어요")} body={t("Tap the heart on any product to save it here.", "상품의 하트를 눌러 이곳에 저장하세요.")} action={<Link href="/#catalog" className="sf-btn sf-btn-primary sf-btn-sm">{t("Browse products", "상품 둘러보기")}</Link>} /></div>
      ) : (
        <ul className="sf-card sf-list">
          {rows.map(({ product: p, seller }) => {
            const available = p.status === "published" && p.visible && seller.status === "active";
            const isOwned = owned.has(p.id) && p.deliveryType !== "service";
            return (
              <li key={p.id} className="sf-row">
                <img src={mediaUrl(p.coverKey)} alt="" className="sf-thumb" />
                <div className="min-w-0 flex-1">
                  {available ? <Link href={`/p/${p.slug}`} className="block font-semibold text-[#20211f] hover:underline">{pick(lang, p.titleEn, p.titleKo)}</Link> : <span className="block font-semibold text-[#7a7e73]">{pick(lang, p.titleEn, p.titleKo)}</span>}
                  <p className="text-[13px] text-[#6b7065]">{seller.displayName}{!available && ` · ${t("No longer available", "판매 종료")}`}</p>
                </div>
                <strong className="text-[15px]">{formatMoney(p.priceCents, p.currency, lang)}</strong>
                <div className="flex items-center gap-2">
                  {isOwned ? <Link href="/account/library" className="sf-btn sf-btn-outline sf-btn-sm">{t("In library", "보유 중")}</Link> : available && <Link href={`/checkout?product=${p.slug}`} className="sf-btn sf-btn-primary sf-btn-sm">{t("Buy", "구매")}</Link>}
                  <WishlistButton productId={p.id} saved signedIn next="/account/wishlist" className="sf-btn sf-btn-ghost sf-btn-sm sf-wish-remove" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
