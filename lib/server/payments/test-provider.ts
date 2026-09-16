import type { PaymentProvider } from "./types";

/** Built-in sandbox. Buyers approve/decline on /pay/test/[paymentId]. Never moves money. */
export const testProvider: PaymentProvider = {
  id: "test",
  label: "Test payment (sandbox)",
  isAvailable() {
    return process.env.NODE_ENV !== "production" || process.env.PAYMENT_TEST_MODE === "true";
  },
  unavailableReason() {
    return this.isAvailable() ? null : "Test payments are disabled in production (set PAYMENT_TEST_MODE=true to allow).";
  },
  async createCheckout(input) {
    return { checkoutUrl: `/pay/test/${input.paymentId}`, providerRef: `test_${input.paymentId.slice(0, 8)}` };
  },
  async parseWebhook() {
    throw new Error("The test provider does not use webhooks");
  },
  async refund() {
    return { providerRef: `test_refund_${Date.now()}` };
  },
};
