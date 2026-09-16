import "server-only";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB } from "./db";
import { hashPassword } from "./password";
import { products as sampleProducts } from "@/lib/ringo/data";

export const DEMO_PASSWORD = "ringo1234!";
export const demoAccounts = {
  admin: "admin@ringo.local",
  seller: "studio@ringo.local",
  seller2: "formfield@ringo.local",
  buyer: "buyer@ringo.local",
};

const day = 86400000;

/** Local development sample data. Never runs in production unless RINGO_DEMO_SEED=true. */
export async function seedDemoData(db: DB) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = Date.now();
  const verified = new Date();
  const insertUser = async (email: string, name: string, role: s.UserRole, locale: "en" | "ko" = "en") => {
    const [row] = await db.insert(s.users).values({ email, name, role, passwordHash, locale, emailVerifiedAt: verified, createdAt: new Date(now - 40 * day) }).onConflictDoNothing().returning();
    return row ?? (await db.select().from(s.users).where(eq(s.users.email, email)))[0];
  };
  await insertUser(demoAccounts.admin, "링고 운영자", "admin", "ko");
  const u1 = await insertUser(demoAccounts.seller, "Studio North", "seller");
  const u2 = await insertUser(demoAccounts.seller2, "Form & Field", "seller");
  const buyer = await insertUser(demoAccounts.buyer, "Alex Morgan", "buyer");
  const buyer2 = await insertUser("jamie@ringo.local", "Jamie Park", "buyer");
  const buyer3 = await insertUser("taylor@ringo.local", "Taylor Lee", "buyer");
  const applicant = await insertUser("applicant@ringo.local", "Maria Santos", "buyer");

  const [sn] = await db.insert(s.sellers).values({ userId: u1.id, slug: "studio-north", displayName: "Studio North", bio: "Independent design studio making tools for creative practice.", status: "active", payoutMethod: "bank", payoutBankName: "BDO", payoutAccountName: "Studio North Inc.", payoutAccountNumber: "0012-3456-7890", reviewedAt: new Date(now - 39 * day) }).returning();
  const [ff] = await db.insert(s.sellers).values({ userId: u2.id, slug: "form-field", displayName: "Form & Field", bio: "Editorial systems and creative workflow courses.", status: "active", commissionBps: 800, payoutMethod: "gcash", payoutAccountName: "Form Field", payoutAccountNumber: "0917-000-0000", reviewedAt: new Date(now - 38 * day) }).returning();
  await db.insert(s.sellers).values({ userId: applicant.id, slug: "maria-creates", displayName: "Maria Creates", bio: "Manila-based illustrator selling Procreate brushes.", status: "pending", applicationNote: "I sell brush packs and illustration courses. Portfolio: behance.net/example" });

  const sellerMap: Record<string, string> = { "studio-north": sn.id, "form-field": ff.id, "james-june": sn.id };
  const idMap: Record<string, string> = {};
  for (const [i, p] of sampleProducts.entries()) {
    const delivery = p.delivery ?? "download";
    const [row] = await db.insert(s.products).values({
      sellerId: sellerMap[p.sellerId] ?? sn.id,
      slug: p.slug,
      categoryId: p.category,
      deliveryType: delivery,
      deliveryDays: p.deliveryDays ?? null,
      titleEn: p.title,
      titleKo: p.ko,
      summaryEn: p.details.split(". ")[0] + ".",
      summaryKo: p.detailsKo.split(". ")[0] + ".",
      descriptionEn: p.details,
      descriptionKo: p.detailsKo,
      formatLabel: p.format,
      priceCents: Math.round(p.price * 100),
      status: "published",
      featured: i < 4,
      coverKey: "preset:" + p.image,
      lessons: delivery === "course" ? [
        { title: "Introduction / 시작하기", minutes: 8, preview: true },
        { title: "Research & direction / 리서치와 방향", minutes: 18 },
        { title: "Build the system / 시스템 만들기", minutes: 24 },
        { title: "Launch checklist / 출시 체크리스트", minutes: 12 },
      ] : [],
      ratingAvg: Math.round(p.rating * 10),
      publishedAt: new Date(now - (30 - i) * day),
      createdAt: new Date(now - (31 - i) * day),
    }).returning();
    idMap[p.id] = row.id;
  }
  await db.insert(s.products).values({
    sellerId: ff.id, slug: "brand-voice-workbook", categoryId: "ebooks", deliveryType: "download",
    titleEn: "Brand Voice Workbook", titleKo: "브랜드 보이스 워크북", descriptionEn: "Guided exercises to define how your brand speaks.", descriptionKo: "브랜드의 말투를 정의하는 가이드 실습.",
    formatLabel: "PDF · 40 pages", priceCents: 1800, status: "pending_review", coverKey: "preset:book", submittedAt: new Date(now - day),
  });

  const [link] = await db.insert(s.deepLinks).values({ code: "mgw-insta", productId: idMap.p1, sellerId: sn.id, name: "Make Good Work · Instagram", source: "instagram", medium: "social", campaign: "creative-start", clicks: 42 }).returning();
  await db.insert(s.deepLinks).values({ code: "type-news", productId: idMap.p2, sellerId: sn.id, name: "Studio kit · Newsletter", source: "newsletter", medium: "email", campaign: "studio-edit", destination: "checkout", clicks: 17 });

  await db.insert(s.coupons).values([
    { code: "WELCOME10", name: "Welcome 10% off", kind: "percent", value: 10, usageLimit: 1000, perUserLimit: 1 },
    { code: "STUDIO5", name: "Studio North $5 off", sellerId: sn.id, kind: "fixed", value: 500, minOrderCents: 2000 },
  ]);

  const buyers = [buyer, buyer2, buyer3];
  const plan: [string, number, number][] = [["p1", 0, 1], ["p2", 1, 2], ["p3", 2, 3], ["p7", 0, 5], ["p9", 1, 6], ["p5", 2, 9], ["p8", 0, 12], ["p11", 1, 15], ["p4", 2, 20], ["p6", 0, 26]];
  let n = 1000;
  for (const [pid, bi, ago] of plan) {
    const product = (await db.select().from(s.products).where(eq(s.products.id, idMap[pid])))[0];
    const b = buyers[bi];
    const seller = product.sellerId === ff.id ? ff : sn;
    const bps = seller.commissionBps ?? 1000;
    const commission = Math.round(product.priceCents * bps / 10000);
    const at = new Date(now - ago * day);
    const service = product.deliveryType === "service";
    const [order] = await db.insert(s.orders).values({
      orderNo: `RG-DEMO-${++n}`, buyerId: b.id, productId: product.id, sellerId: product.sellerId, productTitle: product.titleEn,
      status: "paid", currency: "USD", subtotalCents: product.priceCents, totalCents: product.priceCents, commissionBps: bps,
      commissionCents: commission, sellerNetCents: product.priceCents - commission, buyerEmail: b.email, buyerName: b.name,
      source: pid === "p1" ? "instagram" : "storefront", linkId: pid === "p1" ? link.id : null, campaign: pid === "p1" ? "creative-start" : null,
      fulfillmentStatus: service ? "pending" : "not_required", brief: service ? "Launch campaign for a new ceramics shop in Makati. 3 square creatives, warm tone." : null,
      dueAt: service ? new Date(at.getTime() + (product.deliveryDays ?? 5) * day) : null,
      refundStatus: pid === "p6" ? "requested" : "none", refundReason: pid === "p6" ? "Purchased the wrong collection by mistake." : null,
      idempotencyKey: `demo-${n}`, paidAt: at, createdAt: at, updatedAt: at,
    }).returning();
    await db.insert(s.payments).values({ orderId: order.id, provider: "test", providerRef: `test_${n}`, status: "succeeded", amountCents: order.totalCents, currency: "USD", method: "test", createdAt: at });
    await db.insert(s.entitlements).values({ userId: b.id, productId: product.id, orderId: order.id, createdAt: at });
    await db.insert(s.orderEvents).values([
      { orderId: order.id, type: "created", message: "Order created", actorId: b.id, actorRole: "buyer", createdAt: at },
      { orderId: order.id, type: "paid", message: "Payment succeeded (test)", createdAt: at },
    ]);
    await db.update(s.products).set({ salesCount: product.salesCount + 1 }).where(eq(s.products.id, product.id));
  }

  const [inq] = await db.insert(s.inquiries).values({ userId: buyer.id, sellerId: sn.id, productId: idMap.p2, subject: "Does the kit include Korean fonts?", category: "product" }).returning();
  await db.insert(s.inquiryMessages).values({ inquiryId: inq.id, authorId: buyer.id, authorRole: "buyer", body: "Hi! Before buying, I want to check whether the Figma templates support Hangul fonts." });
  const [inq2] = await db.insert(s.inquiries).values({ userId: buyer2.id, subject: "How do I change my account email?", category: "account" }).returning();
  await db.insert(s.inquiryMessages).values({ inquiryId: inq2.id, authorId: buyer2.id, authorRole: "buyer", body: "I'd like to use my work email for receipts." });

  await db.insert(s.notices).values([
    { audience: "sellers", title: "정산 일정 안내 / Payout schedule", body: "Payouts are processed every Monday for orders older than the refund window.", pinned: true },
    { audience: "all", title: "Welcome to Ringo", body: "Ringo is now open for creators in the Philippines." },
  ]);

  await db.insert(s.banners).values([
    { titleEn: "Small downloads. Big possibilities.", titleKo: "작은 콘텐츠, / 더 큰 가능성.", subtitleEn: "Ideas worth keeping. Stories worth sharing. Discover your next favorite eBook on Ringo.", subtitleKo: "간직하고 싶은 아이디어와 나누고 싶은 이야기를 링고에서 만나보세요.", ctaEn: "Find your next read", ctaKo: "전자책 둘러보기", imageKey: "preset:banner-books-v2", linkUrl: "/?category=ebooks#catalog", sort: 1 },
    { titleEn: "A new skill. A whole new you.", titleKo: "오늘의 배움이 / 내일의 가능성으로.", subtitleEn: "Learn from independent creators and turn a little curiosity into your next great idea.", subtitleKo: "독립 크리에이터와 함께 호기심을 새로운 기술과 아이디어로 키워보세요.", ctaEn: "Explore courses", ctaKo: "강의 둘러보기", imageKey: "preset:banner-course-v2", linkUrl: "/?category=courses#catalog", sort: 2 },
    { titleEn: "Create your thing. Share it with Ringo.", titleKo: "좋은 아이디어를 / 세상과 연결하세요.", subtitleEn: "Digital tools, creative services and curated collections. Everything to bring your vision to life.", subtitleKo: "디지털 도구와 창작 서비스, 엄선한 컬렉션으로 당신의 아이디어를 완성해 보세요.", ctaEn: "Discover collections", ctaKo: "기획전 둘러보기", imageKey: "preset:banner-design-v2", linkUrl: "/?category=collections#catalog", sort: 3 },
  ]);

  console.info(`[ringo] Demo data created. Accounts (password: ${DEMO_PASSWORD}): ${Object.values(demoAccounts).join(", ")}`);
}
