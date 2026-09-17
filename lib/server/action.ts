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
  coupon_invalid: ["That coupon code does not exist or is no longer active. Check the spelling and try again.", "존재하지 않거나 사용 중지된 쿠폰 코드입니다. 코드를 다시 확인해 주세요."],
  coupon_not_started: ["This coupon has not started yet. Check its start date.", "아직 사용 기간이 시작되지 않은 쿠폰입니다. 시작 일시를 확인하세요."],
  coupon_expired: ["This coupon has expired and can no longer be used.", "사용 기간이 끝난 쿠폰이라 적용할 수 없습니다."],
  coupon_not_applicable: ["This coupon only applies to other products or another seller\u2019s store.", "이 쿠폰은 다른 상품 또는 다른 판매자의 스토어에만 사용할 수 있습니다."],
  coupon_exhausted: ["This coupon has reached its total usage limit.", "전체 사용 한도가 모두 소진된 쿠폰입니다."],
  coupon_min_order: ["This order is below the coupon\u2019s minimum order amount.", "주문 금액이 쿠폰의 최소 주문 금액보다 적습니다."],
  coupon_used: ["You have already used this coupon the maximum number of times.", "이 쿠폰의 1인 사용 가능 횟수를 모두 사용했습니다."],
  order_not_payable: ["This order can no longer be paid.", "결제할 수 없는 주문 상태입니다."],
  order_expired: ["The payment window for this order has passed. Please order again.", "결제 가능 시간이 지난 주문입니다. 다시 주문해 주세요."],
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
  nothing_to_pay_out: ["This settlement has nothing to pay out.", "지급할 금액이 없는 정산서입니다."],
  reference_reserved: ["\"merged:\" is reserved for refund deductions. Use the bank or e-wallet transfer reference.", "\"merged:\"는 환불 차감 전용 표기입니다. 은행·전자지갑 송금 참조번호를 입력하세요."],
  adjustments_exceed_payout: ["Pending refund deductions exceed the payout amount. Settle again after more orders become eligible.", "환불 차감액이 정산 금액보다 큽니다. 정산 가능 주문이 더 쌓인 뒤 다시 시도하세요."],
  amount_mismatch: ["Payment amount does not match the order.", "결제 금액이 주문 금액과 다릅니다."],
  email_taken: ["An account with this email already exists.", "이미 가입된 이메일입니다."],
  invalid_credentials: ["Incorrect email or password.", "이메일 또는 비밀번호가 올바르지 않습니다."],
  too_many_attempts: ["Too many attempts. Try again in a few minutes.", "시도 횟수가 많습니다. 잠시 후 다시 시도하세요."],
  weak_password: ["Use 8+ characters with letters and numbers.", "비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다."],
  token_invalid: ["This link is invalid or has expired.", "유효하지 않거나 만료된 링크입니다."],
  slug_taken: ["This address is already in use. Choose another one.", "이미 사용 중인 주소입니다. 다른 주소를 입력하세요."],
  slug_invalid: ["The address must contain letters or numbers.", "주소에는 영문자나 숫자가 포함되어야 합니다."],
  compare_at_too_low: ["The list (compare-at) price must be higher than the sale price.", "정가는 판매가보다 커야 합니다."],
  delivery_type_locked: ["The delivery type of a product that was approved or sold cannot be changed. Create a new product instead.", "심사를 통과했거나 판매된 상품의 제공 방식(카테고리 유형)은 변경할 수 없습니다. 새 상품으로 등록하세요."],
  lessons_required: ["Add at least one lesson to the course.", "강의에는 최소 1개의 레슨이 필요합니다."],
  last_file_on_sale: ["A product on sale must keep at least one file. Upload the replacement first, then delete this one.", "판매 중인 상품에는 파일이 최소 1개 있어야 합니다. 새 파일을 먼저 업로드한 뒤 삭제하세요."],
  code_taken: ["This code is already in use. Enter a different one, or leave it blank to generate one.", "이미 사용 중인 코드입니다. 다른 코드를 입력하거나, 비워두면 자동으로 만들어집니다."],
  expiry_past: ["The expiry date must be in the future. To stop a link now, pause it instead.", "만료일은 현재 이후여야 합니다. 지금 중단하려면 일시중지를 사용하세요."],
  file_required: ["Please attach a file.", "파일을 첨부하세요."],
  in_use: ["This item is in use and cannot be deleted.", "사용 중인 항목이라 삭제할 수 없습니다."],
};

export async function errorMessage(code: string, fallbackLang: Lang = "en") {
  const { t } = await getT(fallbackLang);
  const m = messages[code];
  return m ? t(m[0], m[1]) : code;
}

export class ActionError extends Error {}

/** Korean wording for the most common Zod issues (the English message is used as-is in English). */
function zodMessageKo(issue: ZodError["issues"][number]): string {
  switch (issue.code) {
    case "too_small": {
      const min = String(issue.minimum);
      if (issue.type === "string") return Number(min) <= 1 ? "필수 입력입니다." : `${min}자 이상 입력하세요.`;
      if (issue.type === "number") return issue.inclusive ? `${min} 이상이어야 합니다.` : `${min}보다 커야 합니다.`;
      if (issue.type === "array") return `${min}개 이상 선택하세요.`;
      return "값이 너무 작습니다.";
    }
    case "too_big": {
      const max = String(issue.maximum);
      if (issue.type === "string") return `${max}자 이하로 입력하세요.`;
      if (issue.type === "number") return issue.inclusive ? `${max} 이하여야 합니다.` : `${max}보다 작아야 합니다.`;
      if (issue.type === "array") return `${max}개 이하로 선택하세요.`;
      return "값이 너무 큽니다.";
    }
    case "invalid_type":
      return issue.received === "undefined" || issue.received === "null" ? "필수 입력입니다." : issue.expected === "number" ? "숫자를 입력하세요." : "형식이 올바르지 않습니다.";
    case "invalid_string":
      return issue.validation === "email" ? "이메일 형식이 올바르지 않습니다." : issue.validation === "url" ? "URL 형식이 올바르지 않습니다." : issue.validation === "uuid" ? "식별자가 올바르지 않습니다." : "형식이 올바르지 않습니다.";
    case "invalid_enum_value":
      return "허용되지 않는 값입니다.";
    case "custom":
      return issue.message === "Invalid date" ? "날짜 형식이 올바르지 않습니다." : issue.message;
    default:
      return issue.message;
  }
}

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
      const field = issue.path.join(".");
      return { ok: false, error: t(`Check the "${field}" field: ${issue.message}`, `"${field}" 항목을 확인하세요: ${zodMessageKo(issue)}`) };
    }
    console.error(err);
    try { await logError(await getDb(), "action", err instanceof Error ? err.stack || err.message : String(err)); } catch {}
    return { ok: false, error: t("Something went wrong. Please try again.", "처리 중 오류가 발생했습니다. 다시 시도하세요.") };
  }
}
