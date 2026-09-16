import "server-only";
import { checkoutProviders, providerStatus } from "./payments";
import type { T } from "../i18n";

export type PaymentOption = { id: string; label: string; note: string | null; available: boolean };

/** Payment methods for checkout: enabled + available first, then enabled-but-not-ready ones (shown disabled). */
export function paymentOptions(enabled: string[], t: T): PaymentOption[] {
  const ready = checkoutProviders(enabled).map((p) => p.id);
  const known = providerStatus().filter((p) => enabled.includes(p.id));
  const label = (id: string, fallback: string) => (id === "test" ? t("Test payment (sandbox)", "테스트 결제 (샌드박스)") : fallback);
  const note = (id: string) => (id === "test" ? t("No money is charged. For testing only.", "실제 금액이 청구되지 않는 테스트용 결제입니다.") : null);
  return [
    ...known.filter((p) => ready.includes(p.id)).map((p) => ({ id: p.id, label: label(p.id, p.label), note: note(p.id), available: true })),
    ...known.filter((p) => !ready.includes(p.id)).map((p) => ({ id: p.id, label: label(p.id, p.label), note: t("Coming soon", "준비 중"), available: false })),
  ];
}
