import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Pencil, Plus, Trash2 } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { one, type SP } from "@/lib/server/list";
import { deliveryType } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Badge, Field, Notice } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { deleteCategory, saveCategory, toggleCategory } from "./actions";

export const metadata = { title: "Categories" };

export default async function AdminCategories({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const counts = db
    .select({
      categoryId: s.products.categoryId,
      total: sql<number>`count(*)::int`.as("total"),
      onSale: sql<number>`count(*) filter (where ${s.products.status} = 'published')::int`.as("on_sale"),
    })
    .from(s.products)
    .groupBy(s.products.categoryId)
    .as("counts");
  const rows = await db
    .select({ c: s.categories, total: sql<number>`coalesce(${counts.total},0)::int`, onSale: sql<number>`coalesce(${counts.onSale},0)::int` })
    .from(s.categories)
    .leftJoin(counts, eq(counts.categoryId, s.categories.id))
    .orderBy(asc(s.categories.sort), asc(s.categories.id));
  const editId = one(sp, "edit");
  const editing = rows.find((r) => r.c.id === editId);
  const nextSort = (rows.at(-1)?.c.sort ?? 0) + 10;

  return (
    <>
      <PageHeader
        title={t("Categories", "분류 관리")}
        description={t("Storefront categories. The delivery type decides how buyers receive products in the category.", "스토어 분류입니다. 제공 방식에 따라 구매자가 상품을 받는 방법이 정해집니다.")}
        actions={editing && <Link href="/admin/categories" className="rc-btn rc-btn-primary"><Plus />{t("Add category", "분류 추가")}</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title={<>{t("Categories", "분류")} <span className="ml-1 text-[#8a8d96]">{rows.length}</span></>} bodyClass="p-0">
          <DataTable head={[t("Order", "순서"), t("ID (slug)", "ID (주소)"), t("Name", "이름"), t("Delivery", "제공 방식"), t("Products", "상품 수"), t("State", "상태"), ""]} empty={<EmptyState title={t("No categories", "분류가 없습니다")} />}>
            {rows.map(({ c, total, onSale }) => (
              <tr key={c.id} className={c.id === editId ? "[&>td]:!bg-[#f1f4fe]" : ""}>
                <td className="text-[#6b6e78]">{c.sort}</td>
                <td><code className="rounded bg-[#f3f4f7] px-1.5 py-0.5 text-xs">{c.id}</code></td>
                <td><div className="font-semibold">{c.nameKo}</div><div className="text-[11px] text-[#8a8d96]">{c.nameEn}</div></td>
                <td><StatusBadge map={deliveryType} value={c.deliveryType} lang={lang} /></td>
                <td className="whitespace-nowrap">
                  <Link href={`/admin/products?category=${c.id}`} className="font-medium text-[#2f4ac2] hover:underline">{total}</Link>
                  <div className="text-[11px] text-[#8a8d96]">{t(`${onSale} on sale`, `판매중 ${onSale}`)}</div>
                </td>
                <td><ActionButton size="xs" variant="ghost" action={toggleCategory.bind(null, c.id)}>{c.active ? <Badge tone="green">{t("Active", "사용")}</Badge> : <Badge>{t("Inactive", "미사용")}</Badge>}</ActionButton></td>
                <td className="whitespace-nowrap text-right">
                  <Link href={`/admin/categories?edit=${c.id}`} className="rc-btn rc-btn-outline rc-btn-sm mr-1"><Pencil />{t("Edit", "수정")}</Link>
                  {total === 0 ? (
                    <ActionButton action={deleteCategory.bind(null, c.id)} confirm={t(`Delete category "${c.nameEn}"?`, `"${c.nameKo}" 분류를 삭제할까요?`)} className="text-[#c0362c]"><Trash2 />{t("Delete", "삭제")}</ActionButton>
                  ) : (
                    <span className="inline-block w-[62px] text-center text-[11px] text-[#b3b5bc]" title={t("In use by products — deactivate instead", "상품이 있어 삭제할 수 없습니다. 비활성화하세요.")}>{t("In use", "사용중")}</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>

        <Panel title={editing ? t("Edit category", "분류 수정") : t("Add category", "분류 추가")} className="self-start">
          <ActionForm key={editing?.c.id ?? "new"} action={saveCategory} className="grid gap-4" resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="originalId" value={editing.c.id} />}
            <Field label={t("ID (slug)", "ID (주소)")} required={!editing} hint={editing ? t("The ID cannot be changed after creation.", "ID는 생성 후 변경할 수 없습니다.") : t("Lowercase letters, numbers and hyphens. Used in store URLs (?category=…).", "영문 소문자, 숫자, 하이픈. 스토어 주소(?category=…)에 사용됩니다.")}>
              {editing ? <input className="rc-input bg-[#f6f7f9]" value={editing.c.id} disabled /> : <input name="id" className="rc-input" required minLength={2} maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="templates" />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("Name (Korean)", "이름 (한국어)")} required><input name="nameKo" className="rc-input" required maxLength={60} defaultValue={editing?.c.nameKo ?? ""} /></Field>
              <Field label={t("Name (English)", "이름 (영문)")} required><input name="nameEn" className="rc-input" required maxLength={60} defaultValue={editing?.c.nameEn ?? ""} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("Delivery type", "제공 방식")} required>
                {editing && editing.total > 0 && <input type="hidden" name="deliveryType" value={editing.c.deliveryType} />}
                <select name={editing && editing.total > 0 ? undefined : "deliveryType"} disabled={!!editing && editing.total > 0} className="rc-select" defaultValue={editing?.c.deliveryType ?? "download"}>
                  {Object.entries(deliveryType).map(([v, e]) => <option key={v} value={v}>{lang === "ko" ? e.ko : e.en}</option>)}
                </select>
              </Field>
              <Field label={t("Sort order", "정렬 순서")} hint={t("Lower comes first", "작을수록 앞")}><input name="sort" type="number" min={0} max={100000} className="rc-input" required defaultValue={editing?.c.sort ?? nextSort} /></Field>
            </div>
            {editing && editing.total > 0 && <Notice tone="warn">{t(`${editing.total} products use this category, so the delivery type is locked.`, `상품 ${editing.total}개가 사용 중이라 제공 방식은 변경할 수 없습니다.`)}</Notice>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing?.c.active ?? true} /><span className="font-medium">{t("Active (shown in store and product forms)", "사용 (스토어 및 상품 등록에 노출)")}</span></label>
            <div className="flex justify-end gap-2">
              {editing && <Link href="/admin/categories" className="rc-btn rc-btn-outline">{t("Cancel", "취소")}</Link>}
              <button className="rc-btn rc-btn-primary min-w-[120px]">{editing ? t("Save changes", "변경사항 저장") : t("Add category", "분류 추가")}</button>
            </div>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
