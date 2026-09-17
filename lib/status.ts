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
  receipt_resent: m("Receipt re-sent", "영수증 재발송", "gray"),
  note: m("Admin note", "관리자 메모", "gray"),
};

export function label(map: Record<string, Entry>, key: string | null | undefined, lang: "en" | "ko") {
  const e = key ? map[key] : undefined;
  return e ? (lang === "ko" ? e.ko : e.en) : key ?? "—";
}
