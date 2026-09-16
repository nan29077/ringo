import "server-only";
import type { PaymentProvider } from "./types";
import { testProvider } from "./test-provider";
import { gatewayProvider } from "./gateway-provider";

export const paymentProviders: PaymentProvider[] = [
  gatewayProvider("pearpay", "PearPay"),
  gatewayProvider("nextpay", "NextPay"),
  testProvider,
];

export function getProvider(id: string) {
  return paymentProviders.find((p) => p.id === id) ?? null;
}

export function providerStatus() {
  return paymentProviders.map((p) => ({ id: p.id, label: p.label, available: p.isAvailable(), reason: p.unavailableReason() }));
}

/** Providers buyers can choose right now (available + enabled in settings). */
export function checkoutProviders(enabled: string[]) {
  return paymentProviders.filter((p) => p.isAvailable() && enabled.includes(p.id));
}

export { PaymentNotConfiguredError } from "./types";
export type { PaymentProvider } from "./types";
