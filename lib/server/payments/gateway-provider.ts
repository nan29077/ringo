import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentNotConfiguredError, type PaymentProvider } from "./types";

/**
 * Adapter skeleton for Philippine PG contracts (PearPay, NextPay).
 * The HTTP calls must be written against the official API specification delivered with the merchant contract.
 * Until then the provider reports "not available" and checkout falls back to other enabled providers.
 *
 * Required environment (per provider, e.g. PEARPAY_*):
 *   <P>_API_BASE_URL, <P>_MERCHANT_ID, <P>_API_KEY, <P>_WEBHOOK_SECRET, <P>_IMPLEMENTED=true (after wiring the calls below)
 */
export function gatewayProvider(id: "pearpay" | "nextpay", label: string): PaymentProvider {
  const env = (name: string) => process.env[`${id.toUpperCase()}_${name}`];
  const missing = () => ["API_BASE_URL", "MERCHANT_ID", "API_KEY", "WEBHOOK_SECRET"].filter((k) => !env(k));
  return {
    id,
    label,
    isAvailable() {
      return missing().length === 0 && env("IMPLEMENTED") === "true";
    },
    unavailableReason() {
      const m = missing();
      if (m.length) return `Missing ${m.map((k) => `${id.toUpperCase()}_${k}`).join(", ")}`;
      if (env("IMPLEMENTED") !== "true") return "API calls not implemented yet — waiting for the official API specification.";
      return null;
    },
    async createCheckout() {
      // TODO(PG spec): POST {API_BASE_URL}/checkout with amount, currency, reference=paymentId, redirect/webhook URLs.
      throw new PaymentNotConfiguredError(`${label} checkout is not implemented yet`);
    },
    async parseWebhook(request, rawBody) {
      const secret = env("WEBHOOK_SECRET");
      const signature = request.headers.get("x-signature") || "";
      if (!secret) throw new PaymentNotConfiguredError("Webhook secret missing");
      // TODO(PG spec): confirm the signature header name and algorithm. HMAC-SHA256(hex) is assumed here.
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const ok = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!ok) throw new Error("Invalid webhook signature");
      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      // TODO(PG spec): map the provider's event fields.
      const status = String(payload.status || "").toLowerCase();
      return {
        eventId: String(payload.event_id ?? payload.id ?? ""),
        type: String(payload.type ?? "payment"),
        paymentId: payload.reference ? String(payload.reference) : undefined,
        providerRef: payload.transaction_id ? String(payload.transaction_id) : undefined,
        status: status === "paid" || status === "succeeded" ? "succeeded" : status === "failed" ? "failed" : status === "refunded" ? "refunded" : "ignored",
        raw: payload,
      };
    },
    async refund() {
      // TODO(PG spec): POST {API_BASE_URL}/refunds
      throw new PaymentNotConfiguredError(`${label} refunds are not implemented yet — refund manually in the PG merchant console, then record it here.`);
    },
  };
}
