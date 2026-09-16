export type CheckoutInput = {
  paymentId: string;
  orderId: string;
  orderNo: string;
  amountCents: number;
  currency: string;
  description: string;
  buyer: { email: string; name: string };
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
};

export type WebhookResult = {
  eventId: string;
  type: string;
  paymentId?: string;
  providerRef?: string;
  status: "succeeded" | "failed" | "cancelled" | "refunded" | "ignored";
  raw: unknown;
};

export interface PaymentProvider {
  id: string;
  label: string;
  /** True when credentials are present and the adapter is implemented. */
  isAvailable(): boolean;
  unavailableReason(): string | null;
  createCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string; providerRef?: string }>;
  parseWebhook(request: Request, rawBody: string): Promise<WebhookResult>;
  refund(input: { providerRef: string | null; amountCents: number; currency: string; reason: string }): Promise<{ providerRef?: string }>;
}

export class PaymentNotConfiguredError extends Error {}
