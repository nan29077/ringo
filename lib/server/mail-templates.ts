import "server-only";
import { n, type Lang } from "../i18n";

/**
 * Transactional email copy, in English (default for buyers and sellers) and Korean (operators).
 * Plain text only — keep lines short and avoid markup so every client renders them the same.
 *
 * Each template takes its own variables and returns `{ subject, text }`. Call them through
 * `sendTemplateMail` in `mail.ts`, which resolves the recipient's language and records the send.
 */
export type MailContent = { subject: string; text: string };
type Template<V> = (v: V, lang: Lang) => MailContent;

/** Picks the language variant. Korean falls back to English when a template has no Korean copy. */
const pick = (lang: Lang, en: MailContent, ko: MailContent): MailContent => (lang === "ko" ? ko : en);

const lines = (...parts: (string | false | null | undefined)[]) => parts.filter((p) => typeof p === "string").join("\n");

export const mailTemplates = {
  verify_email: ((v: { name: string; url: string }, lang) =>
    pick(
      lang,
      {
        subject: "Verify your Ringo email",
        text: lines(`Hi ${v.name},`, "", "Confirm your email address to secure your account:", v.url, "", "This link expires in 3 days."),
      },
      {
        subject: "링고 이메일 인증",
        text: lines(`${v.name}님, 안녕하세요.`, "", "계정 보호를 위해 이메일 주소를 인증해 주세요:", v.url, "", "이 링크는 3일 후 만료됩니다."),
      },
    )) as Template<{ name: string; url: string }>,

  reset_password: ((v: { name: string; url: string; byOperator?: boolean }, lang) =>
    pick(
      lang,
      {
        subject: "Reset your Ringo password",
        text: lines(
          `Hi ${v.name},`,
          "",
          v.byOperator ? "A Ringo operator sent you a password reset link (valid for 1 hour):" : "Reset your password with this link (valid for 1 hour):",
          v.url,
          "",
          "If you did not expect this, you can ignore this email — your password stays unchanged.",
        ),
      },
      {
        subject: "링고 비밀번호 재설정",
        text: lines(
          `${v.name}님, 안녕하세요.`,
          "",
          v.byOperator ? "링고 운영자가 비밀번호 재설정 링크를 발송했습니다 (1시간 동안 유효):" : "아래 링크에서 비밀번호를 재설정하세요 (1시간 동안 유효):",
          v.url,
          "",
          "요청하지 않으셨다면 이 메일을 무시하셔도 됩니다. 비밀번호는 변경되지 않습니다.",
        ),
      },
    )) as Template<{ name: string; url: string; byOperator?: boolean }>,

  order_paid_buyer: ((v: { name: string; orderNo: string; product: string; subtotal?: string | null; discount?: string | null; coupon?: string | null; total: string; libraryUrl: string }, lang) =>
    pick(
      lang,
      {
        subject: `Your Ringo order ${v.orderNo}`,
        text: lines(
          `Hi ${v.name},`,
          "",
          `Thank you for your purchase of "${v.product}" (${v.total}).`,
          v.discount && v.subtotal ? `Price ${v.subtotal} − discount ${v.discount}${v.coupon ? ` (${v.coupon})` : ""} = ${v.total}` : null,
          `Open your library: ${v.libraryUrl}`,
          "",
          `Order: ${v.orderNo}`,
        ),
      },
      {
        subject: `링고 주문 ${v.orderNo}`,
        text: lines(
          `${v.name}님, 안녕하세요.`,
          "",
          `"${v.product}" 구매가 완료되었습니다 (${v.total}).`,
          v.discount && v.subtotal ? `상품 금액 ${v.subtotal} − 할인 ${v.discount}${v.coupon ? ` (${v.coupon})` : ""} = ${v.total}` : null,
          `라이브러리에서 바로 이용하세요: ${v.libraryUrl}`,
          "",
          `주문번호: ${v.orderNo}`,
        ),
      },
    )) as Template<{ name: string; orderNo: string; product: string; subtotal?: string | null; discount?: string | null; coupon?: string | null; total: string; libraryUrl: string }>,

  order_paid_seller: ((v: { store: string; orderNo: string; product: string; net: string; orderUrl: string }, lang) =>
    pick(
      lang,
      {
        subject: `New order ${v.orderNo}`,
        text: lines(`${v.store}, you have a new order for "${v.product}".`, `Net: ${v.net}`, v.orderUrl),
      },
      {
        subject: `새 주문 ${v.orderNo}`,
        text: lines(`${v.store} 스토어에 "${v.product}" 새 주문이 들어왔습니다.`, `정산 예정액: ${v.net}`, v.orderUrl),
      },
    )) as Template<{ store: string; orderNo: string; product: string; net: string; orderUrl: string }>,

  order_delivered: ((v: { orderNo: string; product: string; note: string; orderUrl: string }, lang) =>
    pick(
      lang,
      {
        subject: `Your order ${v.orderNo} has been delivered`,
        text: lines(`"${v.product}" is ready.`, "", v.note, "", v.orderUrl),
      },
      {
        subject: `주문 ${v.orderNo} 납품 완료`,
        text: lines(`"${v.product}" 작업물이 준비되었습니다.`, "", v.note, "", v.orderUrl),
      },
    )) as Template<{ orderNo: string; product: string; note: string; orderUrl: string }>,

  order_receipt: ((
    v: { name: string; orderNo: string; product: string; subtotal: string; discount?: string | null; coupon?: string | null; total: string; paidAt: string; refunded?: string | null; refundedAt?: string | null; orderUrl: string },
    lang,
  ) =>
    pick(
      lang,
      {
        subject: `Receipt for your Ringo order ${v.orderNo}`,
        text: lines(
          `Hi ${v.name},`,
          "",
          `Here is your receipt for order ${v.orderNo}.`,
          "",
          `Product: ${v.product}`,
          `Subtotal: ${v.subtotal}`,
          v.discount ? `Discount: -${v.discount}${v.coupon ? ` (${v.coupon})` : ""}` : null,
          `Total paid: ${v.total}`,
          `Paid at: ${v.paidAt}`,
          v.refunded ? `Refunded: ${v.refunded}${v.refundedAt ? ` (${v.refundedAt})` : ""}` : null,
          "",
          `Order details: ${v.orderUrl}`,
        ),
      },
      {
        subject: `링고 주문 ${v.orderNo} 영수증`,
        text: lines(
          `${v.name}님, 안녕하세요.`,
          "",
          `주문 ${v.orderNo}의 영수증입니다.`,
          "",
          `상품: ${v.product}`,
          `상품 금액: ${v.subtotal}`,
          v.discount ? `할인: -${v.discount}${v.coupon ? ` (${v.coupon})` : ""}` : null,
          `결제 금액: ${v.total}`,
          `결제일시: ${v.paidAt}`,
          v.refunded ? `환불 금액: ${v.refunded}${v.refundedAt ? ` (${v.refundedAt})` : ""}` : null,
          "",
          `주문 상세: ${v.orderUrl}`,
        ),
      },
    )) as Template<{ name: string; orderNo: string; product: string; subtotal: string; discount?: string | null; coupon?: string | null; total: string; paidAt: string; refunded?: string | null; refundedAt?: string | null; orderUrl: string }>,

  refund_rejected: ((v: { orderNo: string; reason: string }, lang) =>
    pick(
      lang,
      {
        subject: `Refund request for ${v.orderNo}`,
        text: lines("Your refund request was not approved.", `Reason: ${v.reason}`),
      },
      {
        subject: `주문 ${v.orderNo} 환불 요청 결과`,
        text: lines("환불 요청이 승인되지 않았습니다.", `사유: ${v.reason}`),
      },
    )) as Template<{ orderNo: string; reason: string }>,

  refund_completed: ((v: { orderNo: string; product: string; amount: string }, lang) =>
    pick(
      lang,
      {
        subject: `Refund completed for ${v.orderNo}`,
        text: `We refunded ${v.amount} for "${v.product}". Access to the content has been removed.`,
      },
      {
        subject: `주문 ${v.orderNo} 환불 완료`,
        text: `"${v.product}" 주문의 ${v.amount}을(를) 환불했습니다. 콘텐츠 이용 권한은 회수되었습니다.`,
      },
    )) as Template<{ orderNo: string; product: string; amount: string }>,

  payout_paid: ((v: { amount: string; orderCount: number; reference: string }, lang) =>
    pick(
      lang,
      {
        subject: "Ringo payout sent",
        text: lines(`A payout of ${v.amount} for ${n(v.orderCount, "order")} has been sent.`, `Reference: ${v.reference}`),
      },
      {
        subject: "링고 정산 지급 완료",
        text: lines(`주문 ${v.orderCount}건에 대한 정산금 ${v.amount}을(를) 지급했습니다.`, `송금 참조번호: ${v.reference}`),
      },
    )) as Template<{ amount: string; orderCount: number; reference: string }>,

  seller_review: ((v: { approved: boolean; store: string; reason?: string | null; sellerUrl: string; applyUrl: string }, lang) =>
    pick(
      lang,
      v.approved
        ? { subject: "Welcome to Ringo sellers", text: `Your store "${v.store}" is approved. Open the seller center: ${v.sellerUrl}` }
        : { subject: "Your Ringo seller application", text: lines("We could not approve your application.", `Reason: ${v.reason ?? ""}`, `You can update and re-apply at ${v.applyUrl}`) },
      v.approved
        ? { subject: "링고 판매자 입점이 승인되었습니다", text: `"${v.store}" 스토어 입점이 승인되었습니다. 판매자 센터에서 시작하세요: ${v.sellerUrl}` }
        : { subject: "링고 판매자 입점 심사 결과", text: lines("입점 신청이 승인되지 않았습니다.", `사유: ${v.reason ?? ""}`, `내용을 수정해 다시 신청하실 수 있습니다: ${v.applyUrl}`) },
    )) as Template<{ approved: boolean; store: string; reason?: string | null; sellerUrl: string; applyUrl: string }>,

  product_review: ((v: { approved: boolean; product: string; reason?: string | null }, lang) =>
    pick(
      lang,
      v.approved
        ? { subject: `"${v.product}" is now on sale`, text: "Your product was approved and is now visible on Ringo." }
        : { subject: `"${v.product}" needs changes`, text: lines("Your product was not approved.", `Reason: ${v.reason ?? ""}`, "Edit the product and submit it again.") },
      v.approved
        ? { subject: `"${v.product}" 판매가 시작되었습니다`, text: "상품 심사가 승인되어 링고에 노출되고 있습니다." }
        : { subject: `"${v.product}" 상품 수정이 필요합니다`, text: lines("상품 심사가 승인되지 않았습니다.", `사유: ${v.reason ?? ""}`, "내용을 수정한 뒤 다시 심사를 요청해 주세요.") },
    )) as Template<{ approved: boolean; product: string; reason?: string | null }>,

  inquiry_new: ((v: { subject: string; body: string; from: string; url: string }, lang) =>
    pick(
      lang,
      { subject: `New inquiry: ${v.subject}`, text: lines(`${v.from} sent a new inquiry on Ringo:`, "", v.body, "", `Reply here: ${v.url}`) },
      { subject: `새 문의: ${v.subject}`, text: lines(`${v.from}님이 링고에 새 문의를 남겼습니다:`, "", v.body, "", `답변하기: ${v.url}`) },
    )) as Template<{ subject: string; body: string; from: string; url: string }>,

  product_suspended: ((v: { product: string; reason: string; url: string }, lang) =>
    pick(
      lang,
      {
        subject: `"${v.product}" has been taken off sale`,
        text: lines(`A Ringo operator stopped the sale of "${v.product}".`, `Reason: ${v.reason}`, "", "Existing buyers keep access. Contact support if you think this is a mistake.", v.url),
      },
      {
        subject: `"${v.product}" 판매가 중지되었습니다`,
        text: lines(`링고 운영자가 "${v.product}" 상품의 판매를 중지했습니다.`, `사유: ${v.reason}`, "", "기존 구매자는 계속 이용할 수 있습니다. 착오라고 생각되시면 고객센터로 문의해 주세요.", v.url),
      },
    )) as Template<{ product: string; reason: string; url: string }>,

  seller_suspended: ((v: { store: string; reason: string; supportEmail: string }, lang) =>
    pick(
      lang,
      {
        subject: "Your Ringo store has been suspended",
        text: lines(`Your store "${v.store}" has been suspended, so it is no longer visible and cannot take new orders.`, `Reason: ${v.reason}`, "", `Existing buyers keep what they bought. To appeal, reply to ${v.supportEmail}.`),
      },
      {
        subject: "링고 스토어 운영이 중지되었습니다",
        text: lines(`"${v.store}" 스토어 운영이 중지되어 노출과 신규 주문이 모두 중단되었습니다.`, `사유: ${v.reason}`, "", `기존 구매자의 이용 권한은 유지됩니다. 이의가 있으시면 ${v.supportEmail}로 회신해 주세요.`),
      },
    )) as Template<{ store: string; reason: string; supportEmail: string }>,

  inquiry_reply: ((v: { subject: string; body: string; url: string }, lang) =>
    pick(
      lang,
      { subject: `Re: ${v.subject}`, text: lines("You have a new reply on Ringo:", "", v.body, "", v.url) },
      { subject: `Re: ${v.subject}`, text: lines("링고 문의에 새 답변이 등록되었습니다:", "", v.body, "", v.url) },
    )) as Template<{ subject: string; body: string; url: string }>,
} as const;

export type MailTemplateName = keyof typeof mailTemplates;
export type MailVars<K extends MailTemplateName> = Parameters<(typeof mailTemplates)[K]>[0];
