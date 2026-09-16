/** Apply migrations + bootstrap (categories, env admin, demo data in development). */
import { getDb, databaseDriver } from "@/lib/server/db";

const db = await getDb();
void db;
console.log(`[ringo] Database ready (${databaseDriver()})`);
process.exit(0);
