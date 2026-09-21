/** Shared status labels & badge tones (client + server). */
type Entry = { en: string; ko: string; tone: string };
const m = (en: string, ko: string, tone: string): Entry => ({ en, ko, tone });

export const orderStatus: Record<string, Entry> = {
  pending_payment: m("Awaiting payment", "결제 대기", "amber"),
  paid: m("Paid", "결제 완료", "green"),
  refunded: m("Refunded", "환불 완료", "gray"),
  cancelled: m("Cancelled", "주문 취소", "gray"),
  expired: m("Expired", "결제 기한 만료", "gray"),
};
export const fulfillmentStatus: Record<string, Entry> = {
  not_required: m("Instant access", "즉시 이용", "gray"),
  pending: m("Awaiting production", "제작 대기", "amber"),
  in_progress: m("In production", "제작 중", "blue"),
  delivered: m("Delivered", "납품 완료", "green"),
};
export const refundStatus: Record<string, Entry> = {
  none: m("—", "—", "gray"),
  requested: m("Refund requested", "환불 요청", "red"),
  rejected: m("Refund rejected", "환불 거절", "gray"),
  refunded: m("Refunded", "환불 완료", "gray"),
};
export const productStatus: Record<string, Entry> = {
  draft: m("Draft", "임시저장", "gray"),
  pending_review: m("In review", "심사 대기", "amber"),
  published: m("On sale", "판매중", "green"),
  rejected: m("Rejected", "반려", "red"),
  suspended: m("Suspended", "판매 중지", "red"),
  archived: m("Archived", "보관", "gray"),
};
export const sellerStatus: Record<string, Entry> = {
  pending: m("Applied", "입점 심사중", "amber"),
  active: m("Active", "운영중", "green"),
  rejected: m("Rejected", "반려", "red"),
  suspended: m("Suspended", "정지", "red"),
};
export const userStatus: Record<string, Entry> = {
  active: m("Active", "정상", "green"),
  suspended: m("Suspended", "정지", "red"),
  withdrawn: m("Withdrawn", "탈퇴", "gray"),
};
export const roleLabel: Record<string, Entry> = {
  admin: m("Super admin", "최고 관리자", "violet"),
  seller: m("Seller", "판매자", "blue"),
  buyer: m("Buyer", "구매자", "gray"),
};
export const paymentStatus: Record<string, Entry> = {
  pending: m("Pending", "대기", "amber"),
  succeeded: m("Succeeded", "성공", "green"),
  failed: m("Failed", "실패", "red"),
  cancelled: m("Cancelled", "취소", "gray"),
  refunded: m("Refunded", "환불", "gray"),
};
export const settlementStatus: Record<string, Entry> = {
  pending: m("Awaiting transfer", "지급 대기", "amber"),
  paid: m("Paid out", "지급 완료", "green"),
  cancelled: m("Cancelled", "취소", "gray"),
};
export const inquiryStatus: Record<string, Entry> = {
  open: m("Open", "답변 대기", "amber"),
  answered: m("Answered", "답변 완료", "green"),
  closed: m("Closed", "종료", "gray"),
};
export const deliveryType: Record<string, Entry> = {
  download: m("Download", "다운로드", "gray"),
  course: m("Course", "강의", "blue"),
  service: m("Service", "제작 서비스", "violet"),
  collection: m("Collection", "기획전 패키지", "amber"),
};

/** Order timeline event types (consoles). The stored English message stays as the detail line. */
export const orderEventType: Record<string, Entry> = {
  created: m("Order placed", "주문 접수", "gray"),
  payment_started: m("Payment started", "결제 시작", "blue"),
  paid: m("Payment completed", "결제 완료", "green"),
  payment_failed: m("Payment failed", "결제 실패", "red"),
  expired: m("Payment window elapsed", "결제 시간 만료", "gray"),
  cancelled: m("Cancelled", "주문 취소", "gray"),
  in_progress: m("Production started", "제작 시작", "blue"),
  delivered: m("Delivered", "납품 완료", "green"),
  late_payment: m("Late payment", "지연 결제", "red"),
  refund_requested: m("Refund requested", "환불 요청", "amber"),
  refund_rejected: m("Refund declined", "환불 거절", "red"),
  refunded: m("Refunded", "환불 완료", "red"),
  settlement_adjusted: m("Settlement adjusted", "정산 조정", "amber"),
  deliverable_uploaded: m("Delivery file uploaded", "납품 파일 업로드", "blue"),
  admin_grant: m("Granted by an operator", "운영자 수동 지급", "violet"),
  entitlement_revoked: m("Access revoked by an operator", "운영자 이용 권한 회수", "red"),
  receipt_resent: m("Receipt re-sent", "영수증 재발송", "gray"),
  note: m("Admin note", "관리자 메모", "gray"),
};

/**
 * Order-event detail lines are stored in English: they are an audit trail, and the stored text stays the
 * source of truth. This renders them in the viewer's language by matching the templates the server
 * writes (lib/server/commerce.ts, admin-ops.ts, the upload route and admin actions). Anything it does
 * not recognise — an operator's free-text reason, a future template — is shown unchanged.
 */
const statusKo: Record<string, string> = { expired: "결제 만료", cancelled: "취소", refunded: "환불 완료", pending_payment: "결제 대기", paid: "결제 완료" };
/** The default refund reason the consoles write when the approver adds no note of their own. */
const approvedKo = (reason: string) => reason.replace(/^(Seller|Admin) approved buyer request: /, (_, who) => `${who === "Seller" ? "판매자" : "운영자"}가 구매자 요청을 승인함: `);

const eventDetailKo: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Order created · (.+)$/, (m) => `주문 생성 · ${m[1]}`],
  [/^Order created$/, () => "주문 생성"],
  [/^Order cancelled before payment$/, () => "결제 전에 주문을 취소했습니다"],
  [/^Payment started via (.+)$/, (m) => `${m[1]}(으)로 결제를 시작했습니다`],
  [/^Payment succeeded \((.+)\)$/, (m) => `결제 성공 (${m[1]})`],
  [/^Payment (failed|cancelled): ([\s\S]*)$/, (m) => `결제 ${m[1] === "failed" ? "실패" : "취소"}: ${m[2]}`],
  [/^Payment window (?:passed|elapsed)$/, () => "결제 가능 시간이 지났습니다"],
  [/^Payment received while order was (\w+)\. Refund manually\.$/, (m) => `주문이 ${statusKo[m[1]] ?? m[1]} 상태일 때 결제가 들어왔습니다. 수동으로 환불하세요.`],
  [/^Product or store was unavailable at payment time\. Nothing was delivered — refund this order\.$/, () => "결제 완료 시점에 상품 또는 스토어가 판매 중지 상태였습니다. 아무것도 전달되지 않았으니 환불하세요."],
  [/^Production started$/, () => "제작을 시작했습니다"],
  [/^Delivery sent to buyer$/, () => "구매자에게 납품했습니다"],
  [/^File uploaded: ([\s\S]+)$/, (m) => `파일 업로드: ${m[1]}`],
  [/^Refund requested: ([\s\S]*)$/, (m) => `환불 요청: ${m[1]}`],
  [/^Refund rejected: ([\s\S]*)$/, (m) => `환불 거절: ${m[1]}`],
  [/^Refunded (\S+) \(manual\): ([\s\S]*)$/, (m) => `${m[1]} 수동 환불: ${approvedKo(m[2])}`],
  [/^Refunded (\S+): ([\s\S]*)$/, (m) => `${m[1]} 환불: ${approvedKo(m[2])}`],
  [/^Removed from pending settlement (\w+)$/, (m) => `지급 대기 정산서 ${m[1]}에서 제외했습니다`],
  [/^Refund after payout: (\S+) will be deducted from the next payout \(adjustment (\w+)\)$/, (m) => `지급 후 환불: ${m[1]}이(가) 다음 정산에서 차감됩니다 (조정 ${m[2]})`],
  [/^Access granted manually by admin: ([\s\S]*)$/, (m) => `운영자가 이용 권한을 수동으로 지급: ${m[1]}`],
  [/^Access revoked by admin: ([\s\S]*)$/, (m) => `운영자가 이용 권한을 회수: ${m[1]}`],
  [/^Receipt re-sent to (.+)$/, (m) => `${m[1]}(으)로 영수증을 다시 보냈습니다`],
];

export function eventDetail(message: string | null | undefined, lang: "en" | "ko") {
  if (!message) return null;
  if (lang !== "ko") return message;
  for (const [re, render] of eventDetailKo) {
    const match = message.match(re);
    if (match) return render(match);
  }
  return message;
}

export function label(map: Record<string, Entry>, key: string | null | undefined, lang: "en" | "ko") {
  const e = key ? map[key] : undefined;
  return e ? (lang === "ko" ? e.ko : e.en) : key ?? "—";
}
