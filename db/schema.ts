/**
 * Ringo PostgreSQL schema (Drizzle ORM).
 * - Local development: embedded PGlite (no install) at .data/pglite
 * - Production (AWS RDS / Aurora PostgreSQL): DATABASE_URL
 * All money values are integer minor units (cents). All timestamps are timestamptz.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

export type UserRole = "buyer" | "seller" | "admin";
export type UserStatus = "active" | "suspended" | "withdrawn";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    phone: text("phone"),
    role: text("role").$type<UserRole>().notNull().default("buyer"),
    status: text("status").$type<UserStatus>().notNull().default("active"),
    locale: text("locale").$type<"en" | "ko">().notNull().default("en"),
    emailVerifiedAt: ts("email_verified_at"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    adminMemo: text("admin_memo"),
    lastLoginAt: ts("last_login_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email), index("users_role_idx").on(t.role, t.status)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: created(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<"verify_email" | "reset_password">().notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("auth_tokens_hash_key").on(t.tokenHash)],
);

export type SellerStatus = "pending" | "active" | "rejected" | "suspended";
export const sellers = pgTable(
  "sellers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    website: text("website"),
    avatarKey: text("avatar_key"),
    status: text("status").$type<SellerStatus>().notNull().default("pending"),
    commissionBps: integer("commission_bps"), // null → site default
    payoutMethod: text("payout_method"), // bank, gcash, maya, paypal …
    payoutAccountName: text("payout_account_name"),
    payoutAccountNumber: text("payout_account_number"),
    payoutBankName: text("payout_bank_name"),
    applicationNote: text("application_note"),
    rejectReason: text("reject_reason"),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    adminMemo: text("admin_memo"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("sellers_user_key").on(t.userId), uniqueIndex("sellers_slug_key").on(t.slug)],
);

export const categories = pgTable("categories", {
  id: text("id").primaryKey(), // slug
  nameEn: text("name_en").notNull(),
  nameKo: text("name_ko").notNull(),
  deliveryType: text("delivery_type").$type<DeliveryType>().notNull().default("download"),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

export type DeliveryType = "download" | "course" | "service" | "collection";
export type ProductStatus = "draft" | "pending_review" | "published" | "rejected" | "suspended" | "archived";
export type Lesson = { title: string; assetId?: string | null; minutes?: number | null; preview?: boolean };

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    slug: text("slug").notNull(),
    categoryId: text("category_id").notNull().references(() => categories.id),
    deliveryType: text("delivery_type").$type<DeliveryType>().notNull().default("download"),
    deliveryDays: integer("delivery_days"),
    titleEn: text("title_en").notNull(),
    titleKo: text("title_ko").notNull(),
    summaryEn: text("summary_en"),
    summaryKo: text("summary_ko"),
    descriptionEn: text("description_en").notNull().default(""),
    descriptionKo: text("description_ko").notNull().default(""),
    formatLabel: text("format_label"),
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),
    currency: text("currency").notNull().default("USD"),
    status: text("status").$type<ProductStatus>().notNull().default("draft"),
    visible: boolean("visible").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    coverKey: text("cover_key"), // storage key or "preset:book"
    lessons: jsonb("lessons").$type<Lesson[]>().notNull().default(sql`'[]'::jsonb`),
    rejectReason: text("reject_reason"),
    salesCount: integer("sales_count").notNull().default(0),
    ratingAvg: integer("rating_avg"), // ×10 (e.g. 48 = 4.8)
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    publishedAt: ts("published_at"),
    submittedAt: ts("submitted_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("products_slug_key").on(t.slug),
    index("products_seller_idx").on(t.sellerId, t.status),
    index("products_status_idx").on(t.status, t.visible),
  ],
);

export const productAssets = pgTable(
  "product_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("product_assets_product_idx").on(t.productId)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sellerId: uuid("seller_id").references(() => sellers.id), // null = platform coupon
    productId: uuid("product_id").references(() => products.id),
    kind: text("kind").$type<"percent" | "fixed">().notNull(),
    value: integer("value").notNull(), // percent: 1-100, fixed: cents
    minOrderCents: integer("min_order_cents").notNull().default(0),
    maxDiscountCents: integer("max_discount_cents"),
    usageLimit: integer("usage_limit"),
    perUserLimit: integer("per_user_limit").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("coupons_code_key").on(t.code)],
);

export const deepLinks = pgTable(
  "deep_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    productId: uuid("product_id").notNull().references(() => products.id),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    name: text("name").notNull(),
    source: text("source").notNull().default("direct"),
    medium: text("medium").notNull().default("link"),
    campaign: text("campaign"),
    destination: text("destination").$type<"product" | "checkout">().notNull().default("product"),
    locale: text("locale").$type<"en" | "ko">().notNull().default("en"),
    couponCode: text("coupon_code"),
    status: text("status").$type<"active" | "paused">().notNull().default("active"),
    expiresAt: ts("expires_at"),
    clicks: integer("clicks").notNull().default(0),
    createdBy: uuid("created_by"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("deep_links_code_key").on(t.code), index("deep_links_seller_idx").on(t.sellerId)],
);

export const linkClicks = pgTable(
  "link_clicks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    linkId: uuid("link_id").notNull().references(() => deepLinks.id, { onDelete: "cascade" }),
    visitorHash: text("visitor_hash"),
    referrer: text("referrer"),
    createdAt: created(),
  },
  (t) => [index("link_clicks_link_idx").on(t.linkId, t.createdAt)],
);

export type OrderStatus = "pending_payment" | "paid" | "refunded" | "cancelled" | "expired";
export type FulfillmentStatus = "not_required" | "pending" | "in_progress" | "delivered";
export type RefundStatus = "none" | "requested" | "rejected" | "refunded";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: text("order_no").notNull(),
    buyerId: uuid("buyer_id").notNull().references(() => users.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    productTitle: text("product_title").notNull(),
    status: text("status").$type<OrderStatus>().notNull().default("pending_payment"),
    currency: text("currency").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    commissionCents: integer("commission_cents").notNull().default(0),
    sellerNetCents: integer("seller_net_cents").notNull().default(0),
    couponId: uuid("coupon_id").references(() => coupons.id),
    couponCode: text("coupon_code"),
    linkId: uuid("link_id").references(() => deepLinks.id),
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    buyerEmail: text("buyer_email").notNull(),
    buyerName: text("buyer_name").notNull(),
    brief: text("brief"),
    fulfillmentStatus: text("fulfillment_status").$type<FulfillmentStatus>().notNull().default("not_required"),
    deliveryNote: text("delivery_note"),
    deliveredAt: ts("delivered_at"),
    dueAt: ts("due_at"),
    refundStatus: text("refund_status").$type<RefundStatus>().notNull().default("none"),
    refundReason: text("refund_reason"),
    refundRejectReason: text("refund_reject_reason"),
    refundedCents: integer("refunded_cents").notNull().default(0),
    refundedAt: ts("refunded_at"),
    settlementId: uuid("settlement_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    adminMemo: text("admin_memo"),
    paidAt: ts("paid_at"),
    cancelledAt: ts("cancelled_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("orders_no_key").on(t.orderNo),
    uniqueIndex("orders_idempotency_key").on(t.buyerId, t.idempotencyKey),
    index("orders_buyer_idx").on(t.buyerId, t.createdAt),
    index("orders_seller_idx").on(t.sellerId, t.status, t.createdAt),
    index("orders_status_idx").on(t.status, t.createdAt),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message"),
    actorId: uuid("actor_id"),
    actorRole: text("actor_role"),
    createdAt: created(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const orderDeliverables = pgTable("order_deliverables", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  bytes: integer("bytes").notNull(),
  uploadedBy: uuid("uploaded_by"),
  createdAt: created(),
});

export type PaymentStatus = "pending" | "succeeded" | "failed" | "cancelled" | "refunded";
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    method: text("method"),
    status: text("status").$type<PaymentStatus>().notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    checkoutUrl: text("checkout_url"),
    failureReason: text("failure_reason"),
    raw: jsonb("raw"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("payments_order_idx").on(t.orderId), index("payments_provider_ref_idx").on(t.provider, t.providerRef)],
);

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason"),
  status: text("status").$type<"pending" | "succeeded" | "failed">().notNull().default("pending"),
  providerRef: text("provider_ref"),
  processedBy: uuid("processed_by"),
  createdAt: created(),
});

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type"),
    payload: jsonb("payload"),
    processedAt: ts("processed_at"),
    error: text("error"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("payment_events_provider_event_key").on(t.provider, t.eventId)],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    status: text("status").$type<"active" | "revoked">().notNull().default("active"),
    createdAt: created(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("entitlements_order_key").on(t.orderId), index("entitlements_user_idx").on(t.userId, t.status)],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    lessonIndex: integer("lesson_index").notNull(),
    completedAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId, t.lessonIndex] })],
);

export const downloadLogs = pgTable("download_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull(),
  productId: uuid("product_id"),
  assetId: uuid("asset_id"),
  ip: text("ip"),
  createdAt: created(),
});

export const wishlists = pgTable(
  "wishlists",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id").notNull().references(() => sellers.id),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end").notNull(),
    currency: text("currency").notNull(),
    orderCount: integer("order_count").notNull(),
    grossCents: integer("gross_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    netCents: integer("net_cents").notNull(),
    status: text("status").$type<"pending" | "paid" | "cancelled">().notNull().default("pending"),
    reference: text("reference"),
    memo: text("memo"),
    paidAt: ts("paid_at"),
    createdBy: uuid("created_by"),
    createdAt: created(),
  },
  (t) => [index("settlements_seller_idx").on(t.sellerId, t.createdAt)],
);

export const banners = pgTable("banners", {
  id: uuid("id").primaryKey().defaultRandom(),
  titleEn: text("title_en").notNull(),
  titleKo: text("title_ko").notNull(),
  subtitleEn: text("subtitle_en"),
  subtitleKo: text("subtitle_ko"),
  ctaEn: text("cta_en"),
  ctaKo: text("cta_ko"),
  imageKey: text("image_key").notNull(), // storage key or "preset:banner-books"
  linkUrl: text("link_url"),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  createdAt: created(),
});

export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  audience: text("audience").$type<"all" | "sellers" | "buyers">().notNull().default("all"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  published: boolean("published").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: created(),
  updatedAt: updated(),
});

export type InquiryStatus = "open" | "answered" | "closed";
export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    sellerId: uuid("seller_id").references(() => sellers.id), // null → platform support
    productId: uuid("product_id").references(() => products.id),
    orderId: uuid("order_id").references(() => orders.id),
    category: text("category").notNull().default("general"),
    subject: text("subject").notNull(),
    status: text("status").$type<InquiryStatus>().notNull().default("open"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("inquiries_user_idx").on(t.userId), index("inquiries_seller_idx").on(t.sellerId, t.status)],
);

export const inquiryMessages = pgTable("inquiry_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull(),
  authorRole: text("author_role").$type<UserRole>().notNull(),
  body: text("body").notNull(),
  createdAt: created(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: updated(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    data: jsonb("data"),
    ip: text("ip"),
    createdAt: created(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_target_idx").on(t.targetType, t.targetId)],
);

export const errorLogs = pgTable("error_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
  createdAt: created(),
});

export const mailOutbox = pgTable("mail_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  template: text("template"),
  status: text("status").$type<"sent" | "logged" | "failed">().notNull(),
  error: text("error"),
  createdAt: created(),
});

export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    rating: integer("rating").notNull(),
    body: text("body"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: created(),
  },
  (t) => [uniqueIndex("product_reviews_order_key").on(t.orderId), index("product_reviews_product_idx").on(t.productId)],
);
