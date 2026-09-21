import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { appOrigin } from "@/lib/server/request";
import { getSettings } from "@/lib/server/settings";
import { linkState, linkStats } from "@/lib/server/links";
import { isUuid, toLocalInput } from "@/lib/server/seller-center";
import { formatDate, formatMoney } from "@/lib/i18n";
import { orderStatus } from "@/lib/status";
import { PageHeader, Panel, StatCard, Badge, DataTable, EmptyState, Notice } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton } from "@/components/common/action-form";
import { CopyButton } from "@/components/console/copy-button";
import { LinkForm } from "../link-form";
import { linkFormOptions } from "../load";
import { sellerToggleLink } from "../actions";
import NextLink from "next/link";

export const metadata = { title: "Sales link" };

export default async function SellerLinkDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSeller();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [link] = await db.select().from(s.deepLinks).where(and(eq(s.deepLinks.id, id), eq(s.deepLinks.sellerId, viewer.seller.id)));
  if (!link) notFound();
  const origin = await appOrigin();
  const url = `${origin}/l/${link.code}`;
  const [{ products, coupons }, stats, orders, [clicks7]] = await Promise.all([
    linkFormOptions(db, viewer.seller.id, { productId: link.productId, couponCode: link.couponCode }),
    linkStats(db, [link.id]),
    db.select().from(s.orders).where(and(eq(s.orders.linkId, link.id), eq(s.orders.sellerId, viewer.seller.id))).orderBy(desc(s.orders.createdAt)).limit(10),
    db.select({ n: sql<number>`count(*)::int` }).from(s.linkClicks).where(and(eq(s.linkClicks.linkId, link.id), sql`${s.linkClicks.createdAt} > now() - interval '7 days'`)),
  ]);
  const stat = stats.get(link.id) ?? { orders: 0, cents: 0 };
  // The link itself may be active while its product is paused or hidden; visitors then land on "not available".
  const [product] = await db.select({ status: s.products.status, visible: s.products.visible }).from(s.products).where(eq(s.products.id, link.productId));
  const productOff = !product || product.status !== "published" || !product.visible;
  const st = linkState(link);
  const tone = { active: "green", paused: "gray", expired: "amber" }[st];
  const label = { active: t("Active", "활성"), paused: t("Paused", "일시중지"), expired: t("Expired", "만료") }[st];

  return (
    <>
      <PageHeader
        title={link.name}
        crumbs={[{ href: "/seller/links", label: t("Sales links", "판매 링크") }, { label: link.name }]}
        actions={<><Badge tone={tone}>{label}</Badge><ActionButton action={sellerToggleLink.bind(null, link.id)}>{link.status === "active" ? t("Pause link", "링크 중지") : t("Resume link", "링크 재개")}</ActionButton></>}
      />
      {productOff && <div className="mb-4"><Notice tone="warn">{t("The product for this link is not on sale right now, so visitors see a \"not available\" message. Resume the product to use this link.", "이 링크의 상품이 현재 판매중이 아니어서, 링크로 들어온 방문자에게는 \"구매할 수 없음\" 안내가 표시됩니다. 상품 판매를 재개해야 링크를 쓸 수 있습니다.")}</Notice></div>}
      <Panel className="mb-4" bodyClass="flex flex-wrap items-center gap-3 p-4">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-[#f3f4f7] px-3 py-2 text-sm">{url}</code>
        <CopyButton value={url} label={t("Copy link", "링크 복사")} />
      </Panel>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Clicks", "클릭")} value={link.clicks.toLocaleString()} hint={t(`${clicks7.n} in the last 7 days`, `최근 7일 ${clicks7.n}회`)} />
        <StatCard label={t("Paid orders", "결제 주문")} value={stat.orders} />
        <StatCard label={t("Conversion", "전환율")} value={link.clicks ? `${((stat.orders / link.clicks) * 100).toFixed(1)}%` : "—"} />
        <StatCard label={t("Revenue", "매출")} value={formatMoney(stat.cents, (await getSettings(db)).site.currency, lang)} tone="good" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <LinkForm t={t} lang={lang} products={products} coupons={coupons} link={link} expiresValue={toLocalInput(link.expiresAt)} origin={origin} />
        <Panel title={t("Orders from this link", "이 링크로 들어온 주문")} bodyClass="p-0" className="self-start">
          <DataTable head={[t("Order", "주문번호"), t("Amount", "금액"), t("Status", "상태")]} empty={<EmptyState title={t("No orders yet", "아직 주문이 없습니다")} />}>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="whitespace-nowrap"><NextLink href={`/seller/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</NextLink><div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div></td>
                <td className="whitespace-nowrap">{formatMoney(o.totalCents, o.currency, lang)}</td>
                <td><StatusBadge map={orderStatus} value={o.status} lang={lang} /></td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </>
  );
}
