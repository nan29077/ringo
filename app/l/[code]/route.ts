import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { encodeAttribution, linkState } from "@/lib/server/links";
import { appOrigin, clientIpFrom } from "@/lib/server/request";
import { LANG_COOKIE } from "@/lib/i18n";
import { zonedDateKey } from "@/lib/time";

export const runtime = "nodejs";

/** Short selling link: /l/{code} → record click → remember attribution (30 days) → product page or checkout. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Public origin (APP_URL or forwarded host) so redirects never point at an internal host behind a proxy.
  const base = await appOrigin();
  if (!/^[a-z0-9-]{3,40}$/i.test(code)) return NextResponse.redirect(new URL("/", base));
  const db = await getDb();
  const [row] = await db
    .select({ link: s.deepLinks, product: s.products, sellerStatus: s.sellers.status })
    .from(s.deepLinks)
    .innerJoin(s.products, eq(s.products.id, s.deepLinks.productId))
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .where(eq(s.deepLinks.code, code.toLowerCase()));
  if (!row) return NextResponse.redirect(new URL("/?link=invalid", base));
  const state = linkState(row.link);
  const purchasable = row.product.status === "published" && row.product.visible && row.sellerStatus === "active";
  if (!purchasable) {
    // Hidden / suspended products have no public page: explain on the home page instead of a bare 404.
    return NextResponse.redirect(new URL("/?link=unavailable", base));
  }
  if (state !== "active") return NextResponse.redirect(new URL(`/p/${row.product.slug}?link=${state}`, base));
  const ip = clientIpFrom(request.headers) || "";
  const ua = request.headers.get("user-agent") || "";
  const visitorHash = createHash("sha256").update(`${ip}|${ua}|${zonedDateKey()}`).digest("hex").slice(0, 32);
  await db.insert(s.linkClicks).values({ linkId: row.link.id, visitorHash, referrer: request.headers.get("referer")?.slice(0, 300) });
  await db.update(s.deepLinks).set({ clicks: sql`${s.deepLinks.clicks} + 1` }).where(eq(s.deepLinks.id, row.link.id));

  const dest = new URL(`/p/${row.product.slug}`, base);
  if (row.link.destination === "checkout") dest.searchParams.set("buy", "1");
  if (row.link.couponCode) dest.searchParams.set("coupon", row.link.couponCode);
  const res = NextResponse.redirect(dest, 302);
  const cookie = encodeAttribution({ linkId: row.link.id, productId: row.product.id, source: row.link.source, medium: row.link.medium, campaign: row.link.campaign, coupon: row.link.couponCode });
  res.cookies.set(cookie.name, cookie.value, { maxAge: cookie.maxAge, httpOnly: true, sameSite: "lax", path: "/", secure: base.startsWith("https") });
  // The link's language is a default for new visitors; a language the visitor already chose is kept.
  const hasLang = (request.headers.get("cookie") || "").split(";").some((c) => c.trim().startsWith(`${LANG_COOKIE}=`));
  if (!hasLang) res.cookies.set(LANG_COOKIE, row.link.locale, { maxAge: 31536000, sameSite: "lax", path: "/" });
  return res;
}
