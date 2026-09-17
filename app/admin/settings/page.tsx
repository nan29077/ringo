import Link from "next/link";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { formatDate } from "@/lib/i18n";
import { PageHeader, Panel, Field, Notice } from "@/components/console/ui";
import { ActionForm } from "@/components/common/action-form";
import { adminSaveSettings } from "./actions";

export const metadata = { title: "Preferences" };

export default async function AdminSettings() {
  await requireAdmin();
  const db = await getDb();
  const { t } = await getT("ko");
  const [settings, rows] = await Promise.all([
    getSettings(db),
    db.select({ key: s.settings.key, updatedAt: s.settings.updatedAt, email: s.users.email }).from(s.settings).leftJoin(s.users, eq(s.users.id, s.settings.updatedBy)),
  ]);
  const meta = new Map(rows.map((r) => [r.key, r]));
  const updated = (key: string) => {
    const m = meta.get(key);
    return m ? t(`Last changed ${formatDate(m.updatedAt, "en", true)}${m.email ? ` by ${m.email}` : ""}`, `최근 변경 ${formatDate(m.updatedAt, "ko", true)}${m.email ? ` · ${m.email}` : ""}`) : t("Using defaults", "기본값 사용 중");
  };
  const { site, commerce, moderation } = settings;
  const save = (label: string) => <div className="flex justify-end"><button className="rc-btn rc-btn-primary min-w-[120px]">{label}</button></div>;

  return (
    <>
      <PageHeader title={t("Preferences", "환경 설정")} description={t("Marketplace-wide settings. Every change is recorded in the audit log.", "쇼핑몰 전체 설정입니다. 모든 변경은 관리 작업 로그에 기록됩니다.")} actions={<Link href="/admin/settings/payments" className="rc-btn rc-btn-outline">{t("Payment providers", "결제 연동")}</Link>} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("Site", "기본 정보")} description={updated("site")}>
          <ActionForm action={adminSaveSettings} className="grid gap-4">
            <input type="hidden" name="section" value="site" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("Marketplace name", "쇼핑몰 이름")} required><input name="name" className="rc-input" required maxLength={60} defaultValue={site.name} /></Field>
              <Field label={t("Support email", "고객센터 이메일")} required><input name="supportEmail" type="email" className="rc-input" required maxLength={200} defaultValue={site.supportEmail} /></Field>
              <Field label={t("Currency", "통화")} required hint={t("Ringo runs in a single currency. It can only be changed before any product or order exists.", "링고는 단일 통화로 운영됩니다. 상품이나 주문이 생기기 전에만 변경할 수 있습니다.")}>
                <select name="currency" className="rc-select" defaultValue={site.currency}>
                  <option value="USD">USD · US Dollar</option>
                  <option value="PHP">PHP · Philippine Peso</option>
                  <option value="KRW">KRW · 원</option>
                </select>
              </Field>
              <Field label={t("Default store language", "스토어 기본 언어")} required>
                <select name="defaultLocale" className="rc-select" defaultValue={site.defaultLocale}>
                  <option value="en">English</option>
                  <option value="ko">한국어</option>
                </select>
              </Field>
            </div>
            <Field label={t("Business information (footer)", "사업자 정보 (하단 표시)")} hint={t("Company name, registration number, address, contact…", "상호, 사업자등록번호, 주소, 연락처 등")}>
              <textarea name="businessInfo" className="rc-textarea" maxLength={2000} defaultValue={site.businessInfo} />
            </Field>
            {save(t("Save", "저장"))}
          </ActionForm>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title={t("Commerce", "판매 · 정산")} description={updated("commerce")}>
            <ActionForm action={adminSaveSettings} className="grid gap-4">
              <input type="hidden" name="section" value="commerce" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Default commission (%)", "기본 수수료율 (%)")} required hint={t("Used for sellers without a custom rate. Applies to new orders.", "개별 수수료가 없는 판매자에게 적용되며 새 주문부터 반영됩니다.")}>
                  <input name="commissionPercent" type="number" min={0} max={100} step={0.01} className="rc-input" required defaultValue={commerce.defaultCommissionBps / 100} />
                </Field>
                <Field label={t("Refund window (days)", "환불 가능 기간 (일)")} required hint={t("Buyers can request refunds within this period; payouts wait until it ends.", "이 기간 안에 환불 요청이 가능하며, 정산은 기간이 지난 주문만 포함됩니다.")}>
                  <input name="refundWindowDays" type="number" min={0} max={365} step={1} className="rc-input" required defaultValue={commerce.refundWindowDays} />
                </Field>
                <Field label={t("Pending payment expiry (minutes)", "결제 대기 만료 (분)")} required>
                  <input name="pendingPaymentMinutes" type="number" min={5} max={10080} step={1} className="rc-input" required defaultValue={commerce.pendingPaymentMinutes} />
                </Field>
                <Field label={t(`Minimum payout (${site.currency})`, `최소 정산 금액 (${site.currency})`)} required>
                  <input name="minPayout" type="number" min={0} step={0.01} className="rc-input" required defaultValue={(commerce.minPayoutCents / 100).toFixed(2)} />
                </Field>
              </div>
              {save(t("Save", "저장"))}
            </ActionForm>
          </Panel>

          <Panel title={t("Moderation", "심사 정책")} description={updated("moderation")}>
            <ActionForm action={adminSaveSettings} className="grid gap-4">
              <input type="hidden" name="section" value="moderation" />
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="autoApproveSellers" defaultChecked={moderation.autoApproveSellers} className="mt-1" />
                <span><b>{t("Auto-approve seller applications", "입점 신청 자동 승인")}</b><span className="block text-xs text-[#8a8d96]">{t("New applicants become active sellers immediately.", "신청 즉시 판매자로 활성화됩니다.")}</span></span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="autoApproveProducts" defaultChecked={moderation.autoApproveProducts} className="mt-1" />
                <span><b>{t("Auto-approve products", "상품 자동 승인")}</b><span className="block text-xs text-[#8a8d96]">{t("Products go on sale as soon as sellers submit them, skipping the review queue.", "판매자가 심사 요청하면 심사 없이 바로 판매됩니다.")}</span></span>
              </label>
              {(moderation.autoApproveProducts || moderation.autoApproveSellers) && <Notice tone="warn">{t("Auto-approval is on. Check new sellers and products regularly.", "자동 승인이 켜져 있습니다. 새 판매자와 상품을 주기적으로 점검하세요.")}</Notice>}
              {save(t("Save", "저장"))}
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
