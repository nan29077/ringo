import "server-only";
import path from "node:path";
import fs from "node:fs";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { bootstrapDatabase } from "./bootstrap";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

type Holder = { db?: DB; ready?: Promise<DB>; driver?: "postgres" | "pglite" };
const g = globalThis as unknown as { __ringoDb?: Holder };
const holder: Holder = (g.__ringoDb ??= {});

export function databaseDriver() {
  return process.env.DATABASE_URL ? "postgres" : "pglite";
}

async function connect(): Promise<DB> {
  const migrationsFolder = path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");
  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const ssl = process.env.DATABASE_SSL === "require" ? "require" : undefined;
    const client = postgres(process.env.DATABASE_URL, {
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      ssl,
      onnotice: () => {},
    });
    const db = drizzle(client, { schema });
    if (process.env.DATABASE_AUTO_MIGRATE !== "false") await migrate(db, { migrationsFolder });
    holder.driver = "postgres";
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder });
  holder.driver = "pglite";
  return db;
}

/** Returns a ready (migrated + bootstrapped) database. Safe to call from any server code. */
export function getDb(): Promise<DB> {
  if (holder.db) return Promise.resolve(holder.db);
  holder.ready ??= connect()
    .then(async (db) => {
      await bootstrapDatabase(db);
      holder.db = db;
      return db;
    })
    .catch((err) => {
      holder.ready = undefined;
      throw err;
    });
  return holder.ready;
}

export { schema };
