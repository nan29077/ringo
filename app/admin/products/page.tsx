import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import * as s from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { mediaUrl } from "@/lib/server/storage";
import { adminProductWhere } from "@/lib/server/admin-catalog";
import { formatDate, formatMoney } from "@/lib/i18n";
import { deliveryType, productStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Badge } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton } from "@/components/common/action-form";
import { toggleProductFlag } from "./actions";

export const metadata = { title: "Products" };

export default async function AdminProducts({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const [cats, sellerRows] = await Promise.all([
    db.select().from(s.categories).orderBy(s.categories.sort),
    db.select({ id: s.sellers.id, name: s.sellers.displayName }).from(s.sellers).where(eq(s.sellers.status, "active")),
  ]);

  const cond = adminProductWhere(sp);

  const [rows, [{ total }]] = await Promise.all([
    db.select({ p: s.products, seller: s.sellers.displayName, category: lang === "ko" ? s.categories.nameKo : s.categories.nameEn })
      .from(s.products)
      .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
      .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
      .where(cond)
      .orderBy(desc(s.products.createdAt))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).where(cond),
  ]);

  return (
    <>
      <PageHeader
        title={t("Product list", "상품 목록")}
        description={t("Manage every product on the marketplace: status, visibility and featured placement.", "등록된 전체 상품의 판매 상태, 진열 여부, 추천 노출을 관리하세요.")}
        actions={<Link href="/admin/products/new" className="rc-btn rc-btn-primary"><Plus />{t("Add product", "상품 등록")}</Link>}
      />
      <FilterBar
        exportHref="/admin/products/export"
        fields={[
          { type: "search", name: "q", placeholder: ["Title, slug or seller", "상품명, 주소, 판매자 검색"] },
          { type: "select", name: "status", label: ["Status", "판매상태"], options: Object.entries(productStatus).map(([value, v]) => ({ value, en: v.en, ko: v.ko })) },
          { type: "select", name: "category", label: ["Category", "카테고리"], options: cats.map((c) => ({ value: c.id, en: c.nameEn, ko: c.nameKo })) },
          { type: "select", name: "seller", label: ["Seller", "판매자"], options: sellerRows.map((x) => ({ value: x.id, en: x.name, ko: x.name })) },
          { type: "select", name: "visible", label: ["Display", "진열상태"], options: [{ value: "yes", en: "Displayed", ko: "진열중" }, { value: "no", en: "Hidden", ko: "진열안함" }] },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Products", "상품")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Product", "상품"), t("Type", "상품타입"), t("Price", "판매가"), t("Sales", "판매"), t("Status", "상태"), t("Display", "진열"), t("Featured", "추천"), t("Created", "등록일")]}
          empty={<EmptyState title={t("No products match these filters.", "조건에 맞는 상품이 없습니다.")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ p, seller, category }) => (
            <tr key={p.id}>
              <td>
                <div className="flex items-center gap-3">
                  <img src={mediaUrl(p.coverKey)} alt="" className="rc-thumb" />
                  <div className="min-w-0">
                    <Link href={`/admin/products/${p.id}`} className="block max-w-[280px] truncate font-semibold hover:underline">{lang === "ko" ? p.titleKo : p.titleEn}</Link>
                    <div className="text-[11px] text-[#8a8d96]">{t("Seller", "판매자")}: {seller} · {category}</div>
                  </div>
                </div>
              </td>
              <td><StatusBadge map={deliveryType} value={p.deliveryType} lang={lang} /></td>
              <td className="whitespace-nowrap">
                <b>{formatMoney(p.priceCents, p.currency, lang)}</b>
                {p.compareAtCents && <div className="text-[11px] text-[#9a9ca5] line-through">{formatMoney(p.compareAtCents, p.currency, lang)}</div>}
              </td>
              <td>{p.salesCount}</td>
              <td><StatusBadge map={productStatus} value={p.status} lang={lang} /></td>
              <td>
                <ActionButton size="xs" variant="ghost" action={toggleProductFlag.bind(null, p.id, "visible")}>
                  {p.visible ? <Badge tone="green">{t("Shown", "진열중")}</Badge> : <Badge>{t("Hidden", "진열안함")}</Badge>}
                </ActionButton>
              </td>
              <td>
                <ActionButton size="xs" variant="ghost" action={toggleProductFlag.bind(null, p.id, "featured")}>
                  {p.featured ? <Badge tone="violet">{t("Featured", "추천")}</Badge> : <span className="text-xs text-[#b3b5bc]">—</span>}
                </ActionButton>
              </td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(p.createdAt, lang)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
