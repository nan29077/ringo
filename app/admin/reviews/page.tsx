import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { isUuid } from "@/lib/server/admin-catalog";
import { PageHeader, Panel, DataTable, EmptyState, StatCard, Badge } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { ActionButton } from "@/components/common/action-form";
import { Stars } from "./stars";
import { setReviewHidden } from "./actions";

export const metadata = { title: "Buyer reviews" };

export default async function AdminReviews({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const where: (SQL | undefined)[] = [periodWhere(s.productReviews.createdAt, sp)];
  const rating = Number(one(sp, "rating"));
  if (rating >= 1 && rating <= 5) where.push(eq(s.productReviews.rating, rating));
  if (one(sp, "hidden") === "yes") where.push(eq(s.productReviews.hidden, true));
  if (one(sp, "hidden") === "no") where.push(eq(s.productReviews.hidden, false));
  if (isUuid(one(sp, "seller"))) where.push(eq(s.products.sellerId, one(sp, "seller")));
  if (q) where.push(or(ilike(s.products.titleEn, likeQ(q)), ilike(s.products.titleKo, likeQ(q)), ilike(s.users.name, likeQ(q)), ilike(s.users.email, likeQ(q)), ilike(s.productReviews.body, likeQ(q))));
  const cond = and(...where);
  const base = () => db.select({ total: count() }).from(s.productReviews).innerJoin(s.products, eq(s.products.id, s.productReviews.productId)).innerJoin(s.users, eq(s.users.id, s.productReviews.userId));

  const [rows, [{ total }], [summary], sellers] = await Promise.all([
    db
      .select({ r: s.productReviews, buyer: s.users.name, buyerEmail: s.users.email, productId: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo, seller: s.sellers.displayName, orderNo: s.orders.orderNo })
      .from(s.productReviews)
      .innerJoin(s.products, eq(s.products.id, s.productReviews.productId))
      .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
      .innerJoin(s.users, eq(s.users.id, s.productReviews.userId))
      .leftJoin(s.orders, eq(s.orders.id, s.productReviews.orderId))
      .where(cond)
      .orderBy(desc(s.productReviews.createdAt))
      .limit(size)
      .offset(offset),
    base().where(cond),
    db
      .select({
        n: sql<number>`count(*)::int`,
        avg: sql<number>`coalesce(avg(${s.productReviews.rating}) filter (where not ${s.productReviews.hidden}),0)::float`,
        hidden: sql<number>`count(*) filter (where ${s.productReviews.hidden})::int`,
        low: sql<number>`count(*) filter (where ${s.productReviews.rating} <= 2 and not ${s.productReviews.hidden})::int`,
        recent: sql<number>`count(*) filter (where ${s.productReviews.createdAt} > now() - interval '7 days')::int`,
      })
      .from(s.productReviews),
    db.select({ id: s.sellers.id, name: s.sellers.displayName }).from(s.sellers).where(eq(s.sellers.status, "active")).orderBy(s.sellers.displayName),
  ]);

  return (
    <>
      <PageHeader title={t("Buyer reviews", "구매 후기")} description={t("All product reviews. Hidden reviews are removed from the store and excluded from the product rating.", "전체 상품 구매평입니다. 숨긴 구매평은 스토어에서 제외되고 상품 평점 계산에서도 빠집니다.")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Average rating (visible)", "평균 평점 (공개)")} value={summary.n - summary.hidden ? summary.avg.toFixed(2) : "—"} hint={t(`${summary.n} reviews total`, `전체 구매평 ${summary.n}개`)} />
        <StatCard label={t("New · 7 days", "최근 7일 등록")} value={summary.recent} />
        <StatCard label={t("Visible 1–2 star reviews", "공개 중인 1–2점")} value={summary.low} tone={summary.low ? "warn" : "default"} href="/admin/reviews?rating=1" />
        <StatCard label={t("Hidden", "숨김 처리")} value={summary.hidden} href="/admin/reviews?hidden=yes" />
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Product, buyer name/email or text", "상품명, 작성자 이름/이메일, 내용"] },
          { type: "select", name: "rating", label: ["Rating", "평점"], options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), en: `${n}★`, ko: `${n}점` })) },
          { type: "select", name: "hidden", label: ["Visibility", "공개 여부"], options: [{ value: "no", en: "Visible", ko: "공개" }, { value: "yes", en: "Hidden", ko: "숨김" }] },
          { type: "select", name: "seller", label: ["Seller", "판매자"], options: sellers.map((x) => ({ value: x.id, en: x.name, ko: x.name })) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Reviews", "구매평")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Rating", "평점"), t("Review", "내용"), t("Product", "상품"), t("Buyer", "작성자"), t("Date", "작성일"), t("Visibility", "공개"), ""]}
          empty={<EmptyState title={t("No reviews match these filters", "조건에 맞는 구매평이 없습니다")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map((x) => (
            <tr key={x.r.id} className={x.r.hidden ? "opacity-70" : ""}>
              <td className="whitespace-nowrap"><Stars n={x.r.rating} /></td>
              <td className="max-w-[380px]"><p className="line-clamp-3 whitespace-pre-wrap">{x.r.body || <span className="text-[#b3b5bc]">{t("(no text)", "(내용 없음)")}</span>}</p></td>
              <td className="max-w-[220px]">
                <Link href={`/admin/products/${x.productId}?tab=reviews`} className="block truncate font-medium hover:underline">{lang === "ko" ? x.titleKo : x.titleEn}</Link>
                <div className="truncate text-[11px] text-[#8a8d96]">{x.seller}</div>
              </td>
              <td className="whitespace-nowrap">{x.buyer}<div className="text-[11px] text-[#8a8d96]">{x.buyerEmail}</div>{x.orderNo && <Link href={`/admin/orders/${x.r.orderId}`} className="text-[11px] text-[#2f4ac2] hover:underline">{x.orderNo}</Link>}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(x.r.createdAt, lang, true)}</td>
              <td>{x.r.hidden ? <Badge>{t("Hidden", "숨김")}</Badge> : <Badge tone="green">{t("Visible", "공개")}</Badge>}</td>
              <td className="whitespace-nowrap text-right">
                <ActionButton action={setReviewHidden.bind(null, x.r.id, !x.r.hidden)} confirm={x.r.hidden ? undefined : t("Hide this review? It will disappear from the store and the rating is recalculated.", "이 구매평을 숨길까요? 스토어에서 사라지고 평점이 다시 계산됩니다.")}>
                  {x.r.hidden ? t("Unhide", "다시 공개") : t("Hide", "숨기기")}
                </ActionButton>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
