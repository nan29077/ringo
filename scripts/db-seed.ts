/** Force-insert demo data into an EMPTY database (e.g. a staging RDS). */
import { count } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/db/schema";
import { seedDemoData } from "@/lib/server/seed-demo";

process.env.RINGO_DEMO_SEED = "false";
const db = await getDb();
const [{ value }] = await db.select({ value: count() }).from(users);
if (value > 1) {
  console.error("Database already has users. Demo seed skipped.");
  process.exit(1);
}
await seedDemoData(db);
process.exit(0);
