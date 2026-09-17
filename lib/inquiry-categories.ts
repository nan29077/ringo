/** Inquiry categories (see newInquiryInput in lib/server/inquiries.ts). */
export const inquiryCategories: Record<string, [string, string]> = {
  general: ["General", "일반"],
  order: ["Order", "주문"],
  product: ["Product", "상품"],
  payment: ["Payment", "결제"],
  refund: ["Refund", "환불"],
  account: ["Account", "계정"],
  seller: ["Selling on Ringo", "입점·판매"],
};
