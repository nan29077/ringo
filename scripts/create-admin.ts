/** Usage: pnpm admin:create <email> <password> [name] — creates or promotes a super admin. */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/db/schema";
import { hashPassword, passwordProblems } from "@/lib/server/password";

const [email, password, name = "Ringo Admin"] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: pnpm admin:create <email> <password> [name]");
  process.exit(1);
}
const problem = passwordProblems(password);
if (problem) {
  console.error("Password must be 8+ characters with letters and digits.");
  process.exit(1);
}
const db = await getDb();
const normalized = email.trim().toLowerCase();
const [existing] = await db.select().from(users).where(eq(users.email, normalized));
if (existing) {
  await db.update(users).set({ role: "admin", status: "active", passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, existing.id));
  console.log(`Promoted ${normalized} to super admin and reset the password.`);
} else {
  await db.insert(users).values({ email: normalized, name, role: "admin", locale: "ko", passwordHash: await hashPassword(password), emailVerifiedAt: new Date() });
  console.log(`Created super admin ${normalized}.`);
}
process.exit(0);
