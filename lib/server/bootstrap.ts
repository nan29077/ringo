import "server-only";
import { count, eq } from "drizzle-orm";
import { categories, users } from "@/db/schema";
import type { DB } from "./db";
import { hashPassword } from "./password";

export const defaultCategories = [
  { id: "courses", nameEn: "Courses", nameKo: "강의", deliveryType: "course" as const, sort: 10 },
  { id: "advertising", nameEn: "Advertising", nameKo: "광고 제작", deliveryType: "service" as const, sort: 20 },
  { id: "digital", nameEn: "Digital content", nameKo: "디지털 콘텐츠", deliveryType: "download" as const, sort: 30 },
  { id: "collections", nameEn: "Collections", nameKo: "기획전", deliveryType: "collection" as const, sort: 40 },
  { id: "ebooks", nameEn: "eBooks & guides", nameKo: "전자책 · 가이드", deliveryType: "download" as const, sort: 50 },
  { id: "design", nameEn: "Design resources", nameKo: "디자인 리소스", deliveryType: "download" as const, sort: 60 },
  { id: "photo", nameEn: "Photography", nameKo: "사진 · 프리셋", deliveryType: "download" as const, sort: 70 },
  { id: "audio", nameEn: "Audio & music", nameKo: "오디오 · 음원", deliveryType: "download" as const, sort: 80 },
];

/** Idempotent start-up tasks: default categories, env-provided super admin, optional demo data. */
export async function bootstrapDatabase(db: DB) {
  // Runs on every start so a default added in a later release also reaches databases that already
  // hold categories; onConflictDoNothing leaves any name or sort an operator has edited alone.
  await db.insert(categories).values(defaultCategories).onConflictDoNothing();

  const adminEmail = process.env.RINGO_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.RINGO_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail));
    if (!existing.length) {
      await db.insert(users).values({
        email: adminEmail,
        name: process.env.RINGO_ADMIN_NAME || "Ringo Admin",
        passwordHash: await hashPassword(adminPassword),
        role: "admin",
        locale: "ko",
        emailVerifiedAt: new Date(),
      });
      console.info(`[ringo] Super admin account created for ${adminEmail}`);
    }
  }

  const demoWanted = process.env.RINGO_DEMO_SEED
    ? process.env.RINGO_DEMO_SEED === "true"
    : process.env.NODE_ENV !== "production";
  if (demoWanted) {
    const [{ value: userCount }] = await db.select({ value: count() }).from(users);
    if (!userCount || (adminEmail && userCount === 1)) {
      const { seedDemoData } = await import("./seed-demo");
      await seedDemoData(db);
    }
  }
}
