import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { formatDate, formatMoney } from "@/lib/i18n";
import { PageHeader, Panel, Field, Notice } from "@/components/console/ui";
import { ActionForm } from "@/components/common/action-form";
import { sellerUpdatePayout } from "../actions";

export const metadata = { title: "Payout account" };

export default async function SellerPayout() {
  const { seller } = await requireSeller();
  const { t, lang } = await getT("ko");
  const settings = await getSettings(await getDb());
  const registered = !!seller.payoutMethod && !!seller.payoutAccountNumber;
  return (
    <>
      <PageHeader title={t("Payout account", "정산 계좌")} description={t("Where your settlements are transferred.", "정산금을 받을 계좌 정보를 관리하세요.")} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <ActionForm action={sellerUpdatePayout} className="grid gap-4" confirm={registered ? t("Change the payout account? Pending payouts will be sent to the new account.", "정산 계좌를 변경할까요? 지급 대기 중인 정산금도 새 계좌로 지급됩니다.") : undefined}>
          {!registered && <Notice tone="warn">{t("No payout account yet. Register one to receive settlements.", "아직 정산 계좌가 없습니다. 정산을 받으려면 등록하세요.")}</Notice>}
          <Panel title={t("Account information", "계좌 정보")}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field className="content-start" label={t("Payout method", "지급 방식")} required>
                <select name="payoutMethod" className="rc-select" required defaultValue={seller.payoutMethod ?? "bank"}>
                  <option value="bank">{t("Bank transfer", "은행 송금")}</option>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="paypal">PayPal</option>
                  <option value="other">{t("Other", "기타")}</option>
                </select>
              </Field>
              <Field className="content-start" label={t("Bank / provider name", "은행 · 서비스명")} hint={t("Required for bank transfers.", "은행 송금 시 입력하세요.")}>
                <input name="payoutBankName" className="rc-input" maxLength={80} defaultValue={seller.payoutBankName ?? ""} />
              </Field>
              <Field className="content-start" label={t("Account holder name", "예금주")} required>
                <input name="payoutAccountName" className="rc-input" required maxLength={120} defaultValue={seller.payoutAccountName ?? ""} />
              </Field>
              <Field className="content-start" label={t("Account number / ID", "계좌번호 · 계정 ID")} required hint={t("Mobile number for GCash/Maya, email for PayPal.", "GCash/Maya는 휴대폰 번호, PayPal은 이메일.")}>
                <input name="payoutAccountNumber" className="rc-input" required minLength={3} maxLength={60} defaultValue={seller.payoutAccountNumber ?? ""} autoComplete="off" />
              </Field>
            </div>
          </Panel>
          <div className="flex justify-end"><button type="submit" className="rc-btn rc-btn-primary min-w-[140px]">{t("Save payout account", "정산 계좌 저장")}</button></div>
        </ActionForm>
        <Panel title={t("Payout policy", "정산 안내")} className="self-start">
          <ul className="grid list-disc gap-2 pl-4 text-sm text-[#3b3d46]">
            <li>{t(`Orders are payable ${settings.commerce.refundWindowDays} days after payment (refund window).`, `결제 후 ${settings.commerce.refundWindowDays}일(환불 가능 기간)이 지난 주문이 정산 대상입니다.`)}</li>
            <li>{t("Service orders must be delivered, and orders with an open refund request are held.", "제작 주문은 납품이 완료되어야 하며, 환불 요청 중인 주문은 보류됩니다.")}</li>
            {settings.commerce.minPayoutCents > 0 && <li>{t(`Minimum payout: ${formatMoney(settings.commerce.minPayoutCents, settings.site.currency, lang)}.`, `최소 지급액: ${formatMoney(settings.commerce.minPayoutCents, settings.site.currency, lang)}`)}</li>}
            <li>{t("The account holder name must match your store's legal owner.", "예금주는 스토어 운영자 명의와 일치해야 합니다.")}</li>
          </ul>
          <p className="!mt-4 text-xs text-[#8a8d96]">{t("Last updated", "최근 수정")}: {formatDate(seller.updatedAt, lang, true)}</p>
        </Panel>
      </div>
    </>
  );
}
