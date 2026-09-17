import "server-only";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB } from "./db";
import { hashPassword } from "./password";
import { products as sampleProducts } from "@/lib/ringo/data";
import { storage } from "./storage";
import { recomputeRating } from "./storefront";
import { randomUUID } from "node:crypto";

export const DEMO_PASSWORD = "ringo1234!";
export const demoAccounts = {
  admin: "admin@ringo.local",
  seller: "studio@ringo.local",
  seller2: "formfield@ringo.local",
  buyer: "buyer@ringo.local",
};

const day = 86400000;

const reviewBodies = [
  "Exactly what I needed — clear, practical and easy to apply the same week.",
  "차분하게 정리된 구성이 좋았습니다. 바로 적용해 볼 수 있었어요.",
  "Well made and thoughtfully put together. Worth the price.",
  "설명이 친절해서 처음 시작하는 사람에게도 어렵지 않습니다.",
  "Good value. I keep coming back to the templates.",
];

/** Minimal one-page PDF so demo download products actually deliver a file. */
function demoPdf(title: string, lines: string[]) {
  const esc = (v: string) => v.replace(/[()\\]/g, (m) => "\\" + m).replace(/[^\x20-\x7e]/g, "?");
  const text = [`BT /F1 18 Tf 60 760 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 11 Tf 60 ${720 - i * 18} Td (${esc(l)}) Tj ET`)].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/** Writes a demo file into storage and registers it on the product. */
async function seedAsset(db: DB, productId: string, filename: string, title: string, lines: string[], sort = 0) {
  const data = demoPdf(title, lines);
  const key = `products/${productId}/${randomUUID()}.pdf`;
  await (await storage()).put(key, data, "application/pdf");
  const [row] = await db.insert(s.productAssets).values({ productId, storageKey: key, filename, contentType: "application/pdf", bytes: data.length, sort }).returning();
  return row;
}

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

  const [sn] = await db.insert(s.sellers).values({ userId: u1.id, slug: "studio-north", displayName: "Studio North", bio: "Independent design studio making tools for creative practice.", status: "active", payoutMethod: "bank", payoutBankName: "BDO", payoutAccountName: "Studio North Inc.", payoutAccountNumber: "0012-3456-7890", reviewedAt: new Date(now - 39 * day), createdAt: new Date(now - 41 * day) }).returning();
  const [ff] = await db.insert(s.sellers).values({ userId: u2.id, slug: "form-field", displayName: "Form & Field", bio: "Editorial systems and creative workflow courses.", status: "active", commissionBps: 800, payoutMethod: "gcash", payoutAccountName: "Form Field", payoutAccountNumber: "0917-000-0000", reviewedAt: new Date(now - 38 * day), createdAt: new Date(now - 40 * day) }).returning();
  await db.insert(s.sellers).values({ userId: applicant.id, slug: "maria-creates", displayName: "Maria Creates", bio: "Manila-based illustrator selling Procreate brushes.", status: "pending", applicationNote: "I sell brush packs and illustration courses. Portfolio: behance.net/example", createdAt: new Date(now - 2 * day) });

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
        { title: "Introduction / 시작하기", minutes: 8, preview: true, body: "What this course covers, who it is for, and how to use the workbook.\n이 강의가 다루는 내용과 워크북 사용법을 소개합니다." },
        { title: "Research & direction / 리서치와 방향", minutes: 18, body: "How to gather references, interview users and pick a direction you can defend.\n레퍼런스 수집, 사용자 인터뷰, 방향 정하기." },
        { title: "Build the system / 시스템 만들기", minutes: 24, body: "Turning the direction into reusable components, tokens and templates.\n방향을 재사용 가능한 컴포넌트와 템플릿으로 만듭니다." },
        { title: "Launch checklist / 출시 체크리스트", minutes: 12, body: "Everything to verify before you ship, and how to collect feedback afterwards.\n출시 전 점검 항목과 출시 후 피드백 수집 방법." },
      ] : [],
      ratingAvg: null, // set from the seeded reviews below
      publishedAt: new Date(now - (30 - i) * day),
      createdAt: new Date(now - (31 - i) * day),
    }).returning();
    idMap[p.id] = row.id;
    // Published products must actually deliver something: a workbook PDF (and a second file for collections).
    if (delivery === "download" || delivery === "collection" || delivery === "course") {
      const asset = await seedAsset(db, row.id, `${p.slug}.pdf`, p.title, [p.details.slice(0, 90), "", "Ringo demo file — replace with the real product file."]);
      if (delivery === "collection") await seedAsset(db, row.id, `${p.slug}-bonus.pdf`, `${p.title} — bonus`, ["Bonus material included with this collection."], 1);
      if (delivery === "course") {
        await db.update(s.products).set({ lessons: (row.lessons ?? []).map((l, li) => (li === 0 ? { ...l, assetId: asset.id } : l)) }).where(eq(s.products.id, row.id));
      }
    }
  }
  await db.insert(s.products).values({
    sellerId: ff.id, slug: "brand-voice-workbook", categoryId: "ebooks", deliveryType: "download",
    titleEn: "Brand Voice Workbook", titleKo: "브랜드 보이스 워크북", descriptionEn: "Guided exercises to define how your brand speaks.", descriptionKo: "브랜드의 말투를 정의하는 가이드 실습.",
    formatLabel: "PDF · 40 pages", priceCents: 1800, status: "pending_review", coverKey: "preset:book", submittedAt: new Date(now - day),
  });

  const [link] = await db.insert(s.deepLinks).values({ code: "mgw-insta", productId: idMap.p1, sellerId: sn.id, name: "Make Good Work · Instagram", source: "instagram", medium: "social", campaign: "creative-start", createdAt: new Date(now - 25 * day) }).returning();
  const [link2] = await db.insert(s.deepLinks).values({ code: "type-news", productId: idMap.p2, sellerId: sn.id, name: "Studio kit · Newsletter", source: "newsletter", medium: "email", campaign: "studio-edit", destination: "checkout", createdAt: new Date(now - 22 * day) }).returning();
  // The click counter and the click log have to agree, or the deep-link report contradicts itself.
  for (const [row, count, referrer] of [[link, 42, "https://instagram.com/"], [link2, 17, "https://mail.example.com/"]] as const) {
    await db.insert(s.linkClicks).values(
      Array.from({ length: count }, (_, i) => ({
        linkId: row.id,
        visitorHash: `demo-${row.code}-${i % 23}`,
        referrer,
        createdAt: new Date(now - ((i % 20) + 1) * day),
      })),
    );
    await db.update(s.deepLinks).set({ clicks: count }).where(eq(s.deepLinks.id, row.id));
  }

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
    // A buyer review per purchase, so the shown rating always matches real review rows.
    if (!service && pid !== "p6") {
      const sample = sampleProducts.find((x) => x.id === pid);
      const rating = Math.max(1, Math.min(5, Math.round(sample?.rating ?? 5)));
      await db.insert(s.productReviews).values({
        productId: product.id,
        userId: b.id,
        orderId: order.id,
        rating,
        body: reviewBodies[ago % reviewBodies.length],
        createdAt: new Date(Math.min(at.getTime() + 2 * day, now - day)),
      });
      await recomputeRating(db, product.id);
    }
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
