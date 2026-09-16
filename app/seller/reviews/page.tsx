import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Star } from "lucide-react";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, StatCard, Badge } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";

export const metadata = { title: "Reviews" };

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`size-3.5 ${i <= n ? "fill-[#f5a623] text-[#f5a623]" : "text-[#d9dbe3]"}`} />)}
    </span>
  );
}

export default async function SellerReviews({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const own = eq(s.products.sellerId, viewer.seller.id);
  const where: (SQL | undefined)[] = [own, periodWhere(s.productReviews.createdAt, sp)];
  const rating = Number(one(sp, "rating"));
  if (rating >= 1 && rating <= 5) where.push(eq(s.productReviews.rating, rating));
  if (one(sp, "product")) where.push(eq(s.productReviews.productId, one(sp, "product")));
  if (q) where.push(or(ilike(s.productReviews.body, likeQ(q)), ilike(s.users.name, likeQ(q))));
  const cond = and(...where);
  const [rows, [{ total }], [summary], products] = await Promise.all([
    db
      .select({ r: s.productReviews, buyer: s.users.name, productId: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo })
      .from(s.productReviews)
      .innerJoin(s.products, eq(s.products.id, s.productReviews.productId))
      .innerJoin(s.users, eq(s.users.id, s.productReviews.userId))
      .where(cond)
      .orderBy(desc(s.productReviews.createdAt))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.productReviews).innerJoin(s.products, eq(s.products.id, s.productReviews.productId)).innerJoin(s.users, eq(s.users.id, s.productReviews.userId)).where(cond),
    db
      .select({ n: sql<number>`count(*)::int`, avg: sql<number>`coalesce(avg(${s.productReviews.rating}),0)::float`, low: sql<number>`count(*) filter (where ${s.productReviews.rating} <= 2)::int`, recent: sql<number>`count(*) filter (where ${s.productReviews.createdAt} > now() - interval '30 days')::int` })
      .from(s.productReviews)
      .innerJoin(s.products, eq(s.products.id, s.productReviews.productId))
      .where(and(own, eq(s.productReviews.hidden, false))),
    db.select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.products).where(own).orderBy(s.products.titleEn),
  ]);
  return (
    <>
      <PageHeader title={t("Reviews", "구매평")} description={t("Buyer reviews on your products. Contact support if a review violates the guidelines.", "내 상품에 작성된 구매평입니다. 운영 정책에 어긋나는 구매평은 고객센터로 신고하세요.")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Average rating", "평균 평점")} value={summary.n ? summary.avg.toFixed(1) : "—"} hint={t(`${summary.n} visible reviews`, `공개 구매평 ${summary.n}개`)} />
        <StatCard label={t("Last 30 days", "최근 30일")} value={summary.recent} />
        <StatCard label={t("1–2 star reviews", "1–2점 구매평")} value={summary.low} tone={summary.low ? "warn" : "default"} />
        <StatCard label={t("Products", "상품 수")} value={products.length} />
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Review text or buyer", "구매평 내용 또는 작성자"] },
          { type: "select", name: "rating", label: ["Rating", "평점"], options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), en: `${n}★`, ko: `${n}점` })) },
          { type: "select", name: "product", label: ["Product", "상품"], options: products.map((p) => ({ value: p.id, en: p.titleEn, ko: p.titleKo })) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Reviews", "구매평")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable head={[t("Rating", "평점"), t("Review", "내용"), t("Product", "상품"), t("Buyer", "작성자"), t("Date", "작성일")]} empty={<EmptyState title={t("No reviews yet", "아직 구매평이 없습니다")} />} footer={<Pagination total={total} page={page} size={size} />}>
          {rows.map((x) => (
            <tr key={x.r.id}>
              <td className="whitespace-nowrap"><Stars n={x.r.rating} /></td>
              <td className="max-w-[420px]"><p className="line-clamp-3 whitespace-pre-wrap text-sm">{x.r.body || <span className="text-[#b3b5bc]">{t("(no text)", "(내용 없음)")}</span>}</p>{x.r.hidden && <Badge tone="gray">{t("Hidden by marketplace", "운영자 숨김")}</Badge>}</td>
              <td className="max-w-[200px] truncate text-xs"><Link href={`/seller/products/${x.productId}`} className="hover:underline">{lang === "ko" ? x.titleKo : x.titleEn}</Link></td>
              <td className="whitespace-nowrap">{x.buyer}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(x.r.createdAt, lang)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
