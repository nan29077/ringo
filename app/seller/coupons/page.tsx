import Link from "next/link";
import { and, count, desc, eq, gt, ilike, isNull, lte, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { likeQ, listParams, one, type SP } from "@/lib/server/list";
import { formatDate, formatMoney } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, Badge } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { ActionButton } from "@/components/common/action-form";
import { sellerToggleCoupon } from "./actions";

export const metadata = { title: "Coupons" };

export default async function SellerCoupons({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const currency = (await getSettings(db)).site.currency;
  const now = new Date();
  const where: (SQL | undefined)[] = [eq(s.coupons.sellerId, viewer.seller.id)];
  if (q) where.push(or(ilike(s.coupons.code, likeQ(q)), ilike(s.coupons.name, likeQ(q))));
  const state = one(sp, "state");
  if (state === "inactive") where.push(eq(s.coupons.active, false));
  if (state === "expired") where.push(lte(s.coupons.endsAt, now));
  if (state === "active") where.push(eq(s.coupons.active, true), or(isNull(s.coupons.endsAt), gt(s.coupons.endsAt, now)));
  const cond = and(...where);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ c: s.coupons, titleEn: s.products.titleEn, titleKo: s.products.titleKo }).from(s.coupons).leftJoin(s.products, eq(s.products.id, s.coupons.productId)).where(cond).orderBy(desc(s.coupons.createdAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.coupons).where(cond),
  ]);

  return (
    <>
      <PageHeader
        title={t("Coupons", "쿠폰")}
        description={t("Discount codes for your own products. The discount is deducted from your sale amount.", "내 상품에만 적용되는 할인 코드입니다. 할인 금액은 판매 금액에서 차감됩니다.")}
        actions={<Link href="/seller/coupons/new" className="rc-btn rc-btn-brand"><Plus />{t("Create coupon", "쿠폰 만들기")}</Link>}
      />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Code or name", "쿠폰 코드 또는 이름"] },
          { type: "select", name: "state", label: ["State", "상태"], options: [{ value: "active", en: "Active", ko: "사용 가능" }, { value: "inactive", en: "Inactive", ko: "비활성" }, { value: "expired", en: "Ended", ko: "기간 종료" }] },
        ]}
      />
      <Panel title={<>{t("Coupons", "쿠폰")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Coupon", "쿠폰"), t("Discount", "할인"), t("Applies to", "적용 상품"), t("Conditions", "조건"), t("Period", "기간"), t("Used", "사용"), t("State", "상태"), ""]}
          empty={<EmptyState title={t("No coupons yet", "쿠폰이 없습니다")} action={<Link href="/seller/coupons/new" className="rc-btn rc-btn-outline rc-btn-sm"><Plus />{t("Create coupon", "쿠폰 만들기")}</Link>} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ c, titleEn, titleKo }) => {
            const ended = !!c.endsAt && c.endsAt <= now;
            const upcoming = !!c.startsAt && c.startsAt > now;
            const exhausted = c.usageLimit != null && c.usedCount >= c.usageLimit;
            return (
              <tr key={c.id}>
                <td><Link href={`/seller/coupons/${c.id}`} className="font-mono font-semibold hover:underline">{c.code}</Link><div className="text-[11px] text-[#8a8d96]">{c.name}</div></td>
                <td className="whitespace-nowrap font-medium">{c.kind === "percent" ? `${c.value}%` : formatMoney(c.value, currency, lang)}{c.maxDiscountCents != null && <div className="text-[11px] text-[#8a8d96]">{t("max", "최대")} {formatMoney(c.maxDiscountCents, currency, lang)}</div>}</td>
                <td className="max-w-[180px] truncate text-xs">{c.productId ? (lang === "ko" ? titleKo : titleEn) : t("All my products", "내 모든 상품")}</td>
                <td className="text-[11px] text-[#5b5e68]"><div>{c.minOrderCents ? t(`Min ${formatMoney(c.minOrderCents, currency, lang)}`, `최소 ${formatMoney(c.minOrderCents, currency, lang)}`) : t("No minimum", "최소 금액 없음")}</div><div>{t(`${c.perUserLimit}× per buyer`, `1인 ${c.perUserLimit}회`)}</div></td>
                <td className="whitespace-nowrap text-[11px] text-[#5b5e68]">{c.startsAt || c.endsAt ? `${formatDate(c.startsAt, lang)} ~ ${formatDate(c.endsAt, lang)}` : t("Always", "상시")}</td>
                <td className="whitespace-nowrap">{c.usedCount}{c.usageLimit != null && <span className="text-[#8a8d96]"> / {c.usageLimit}</span>}</td>
                <td>{!c.active ? <Badge>{t("Inactive", "비활성")}</Badge> : ended ? <Badge tone="gray">{t("Ended", "기간 종료")}</Badge> : exhausted ? <Badge tone="amber">{t("Used up", "한도 소진")}</Badge> : upcoming ? <Badge tone="blue">{t("Scheduled", "시작 전")}</Badge> : <Badge tone="green">{t("Active", "사용 가능")}</Badge>}</td>
                <td className="whitespace-nowrap text-right">
                  <Link href={`/seller/coupons/${c.id}`} className="rc-btn rc-btn-outline rc-btn-sm mr-1">{t("Edit", "수정")}</Link>
                  <ActionButton action={sellerToggleCoupon.bind(null, c.id)}>{c.active ? t("Deactivate", "비활성화") : t("Activate", "활성화")}</ActionButton>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
