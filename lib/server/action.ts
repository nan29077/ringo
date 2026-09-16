import "server-only";
import { ZodError } from "zod";
import { CommerceError } from "./commerce";
import { getT } from "./i18n-server";
import type { Lang } from "../i18n";
import { logError } from "./audit";
import { getDb } from "./db";

export type ActionResult = { ok: true; message?: string; redirect?: string; data?: unknown } | { ok: false; error: string };

const messages: Record<string, [string, string]> = {
  not_found: ["Not found or no permission.", "대상을 찾을 수 없거나 권한이 없습니다."],
  forbidden: ["You do not have permission.", "권한이 없습니다."],
  invalid_state: ["This action is not available in the current status.", "현재 상태에서는 처리할 수 없습니다."],
  product_unavailable: ["This product is not available for purchase.", "구매할 수 없는 상품입니다."],
  own_product: ["You cannot buy your own product.", "본인 상품은 구매할 수 없습니다."],
  already_owned: ["You already own this product. Check your library.", "이미 보유한 상품입니다. 라이브러리를 확인하세요."],
  brief_required: ["Please describe your request.", "제작 요청 내용을 입력하세요."],
  coupon_invalid: ["Invalid coupon code.", "유효하지 않은 쿠폰입니다."],
  coupon_not_started: ["This coupon is not active yet.", "아직 사용할 수 없는 쿠폰입니다."],
  coupon_expired: ["This coupon has expired.", "만료된 쿠폰입니다."],
  coupon_not_applicable: ["This coupon cannot be used for this product.", "이 상품에 사용할 수 없는 쿠폰입니다."],
  coupon_exhausted: ["This coupon has reached its usage limit.", "사용 한도가 소진된 쿠폰입니다."],
  coupon_min_order: ["The order does not meet the coupon minimum.", "쿠폰 최소 주문 금액에 미달합니다."],
  coupon_used: ["You have already used this coupon.", "이미 사용한 쿠폰입니다."],
  order_not_payable: ["This order can no longer be paid.", "결제할 수 없는 주문 상태입니다."],
  provider_unavailable: ["This payment method is not available.", "사용할 수 없는 결제 수단입니다."],
  provider_error: ["The payment provider returned an error. Please try again.", "결제사 오류가 발생했습니다. 다시 시도하세요."],
  order_not_cancellable: ["This order cannot be cancelled.", "취소할 수 없는 주문입니다."],
  refund_not_allowed: ["A refund cannot be requested for this order.", "환불을 요청할 수 없는 주문입니다."],
  refund_window_passed: ["The refund period has ended.", "환불 가능 기간이 지났습니다."],
  refund_needs_request: ["Refunds can be processed after the buyer requests one.", "구매자 환불 요청 후 처리할 수 있습니다."],
  refund_provider_error: ["The provider could not refund automatically. Refund in the PG console, then record a manual refund.", "결제사 자동 환불에 실패했습니다. PG 관리자에서 환불 후 '수동 환불 기록'을 이용하세요."],
  reason_required: ["Please enter a reason.", "사유를 입력하세요."],
  note_required: ["Please enter delivery details.", "납품 내용을 입력하세요."],
  nothing_to_settle: ["No orders are eligible for settlement.", "정산 가능한 주문이 없습니다."],
  amount_mismatch: ["Payment amount does not match the order.", "결제 금액이 주문 금액과 다릅니다."],
  email_taken: ["An account with this email already exists.", "이미 가입된 이메일입니다."],
  invalid_credentials: ["Incorrect email or password.", "이메일 또는 비밀번호가 올바르지 않습니다."],
  too_many_attempts: ["Too many attempts. Try again in a few minutes.", "시도 횟수가 많습니다. 잠시 후 다시 시도하세요."],
  weak_password: ["Use 8+ characters with letters and numbers.", "비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다."],
  token_invalid: ["This link is invalid or has expired.", "유효하지 않거나 만료된 링크입니다."],
  slug_taken: ["This address is already in use.", "이미 사용 중인 주소입니다."],
  code_taken: ["This code is already in use.", "이미 사용 중인 코드입니다."],
  file_required: ["Please attach a file.", "파일을 첨부하세요."],
  in_use: ["This item is in use and cannot be deleted.", "사용 중인 항목이라 삭제할 수 없습니다."],
};

export async function errorMessage(code: string, fallbackLang: Lang = "en") {
  const { t } = await getT(fallbackLang);
  const m = messages[code];
  return m ? t(m[0], m[1]) : code;
}

export class ActionError extends Error {}

/**
 * Wraps a server action body: maps domain / validation errors into a localized ActionResult.
 * `fallbackLang` is used when the viewer has no language cookie (consoles default to "ko").
 */
export async function run(fn: () => Promise<ActionResult | void>, fallbackLang: Lang = "en"): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
    const { t } = await getT(fallbackLang);
    if (err instanceof CommerceError) return { ok: false, error: (await errorMessage(err.code, fallbackLang)) + (err.code.endsWith("_error") && err.message !== err.code ? ` (${err.message})` : "") };
    if (err instanceof ActionError) return { ok: false, error: messages[err.message] ? await errorMessage(err.message, fallbackLang) : err.message };
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      return { ok: false, error: t(`Check the "${issue.path.join(".")}" field: ${issue.message}`, `"${issue.path.join(".")}" 항목을 확인하세요: ${issue.message}`) };
    }
    console.error(err);
    try { await logError(await getDb(), "action", err instanceof Error ? err.stack || err.message : String(err)); } catch {}
    return { ok: false, error: t("Something went wrong. Please try again.", "처리 중 오류가 발생했습니다. 다시 시도하세요.") };
  }
}
