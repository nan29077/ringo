import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { mediaUrl } from "@/lib/server/storage";
import { formatDate, formatMoney } from "@/lib/i18n";
import { deliveryType, productStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";
import { sellerProductWhere } from "./query";

export const metadata = { title: "Products" };

export default async function SellerProducts({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const cats = await db.select().from(s.categories).orderBy(s.categories.sort);
  const cond = sellerProductWhere(viewer.seller.id, sp);

  const [rows, [{ total }]] = await Promise.all([
    db.select({ p: s.products, category: lang === "ko" ? s.categories.nameKo : s.categories.nameEn })
      .from(s.products)
      .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
      .where(cond)
      .orderBy(desc(s.products.updatedAt))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.products).where(cond),
  ]);

  return (
    <>
      <PageHeader
        title={t("Product list", "상품 목록")}
        description={t("Manage your products, review status and files.", "내 상품의 판매 상태, 심사 결과, 파일을 관리하세요.")}
        actions={<Link href="/seller/products/new" className="rc-btn rc-btn-brand"><Plus />{t("Add product", "상품 등록")}</Link>}
      />
      <FilterBar
        exportHref="/seller/products/export"
        fields={[
          { type: "search", name: "q", placeholder: ["Title or slug", "상품명 또는 주소 검색"] },
          { type: "select", name: "status", label: ["Status", "판매상태"], options: Object.entries(productStatus).map(([value, v]) => ({ value, en: v.en, ko: v.ko })) },
          { type: "select", name: "category", label: ["Category", "카테고리"], options: cats.map((c) => ({ value: c.id, en: c.nameEn, ko: c.nameKo })) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Products", "상품")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Product", "상품"), t("Type", "상품타입"), t("Price", "판매가"), t("Sales", "판매"), t("Status", "상태"), t("Updated", "수정일"), ""]}
          empty={<EmptyState title={t("No products found.", "조건에 맞는 상품이 없습니다.")} action={<Link href="/seller/products/new" className="rc-btn rc-btn-outline rc-btn-sm"><Plus />{t("Add product", "상품 등록")}</Link>} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ p, category }) => (
            <tr key={p.id}>
              <td>
                <div className="flex items-center gap-3">
                  <img src={mediaUrl(p.coverKey)} alt="" className="rc-thumb" />
                  <div className="min-w-0">
                    <Link href={`/seller/products/${p.id}`} className="block max-w-[320px] truncate font-semibold hover:underline">{lang === "ko" ? p.titleKo : p.titleEn}</Link>
                    <div className="text-[11px] text-[#8a8d96]">{category} · /p/{p.slug}</div>
                    {(p.status === "rejected" || p.status === "suspended") && p.rejectReason && (
                      <div className="mt-1 max-w-[360px] text-[11px] text-[#c0362c]">{t("Reason", "사유")}: {p.rejectReason}</div>
                    )}
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
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(p.updatedAt, lang)}</td>
              <td className="text-right"><Link href={`/seller/products/${p.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Manage", "관리")}</Link></td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
