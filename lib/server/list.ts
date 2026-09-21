import "server-only";
import { and, gte, ilike, inArray, lt, or, sql, type SQL, type AnyColumn } from "drizzle-orm";
import * as s from "@/db/schema";
import { addZonedDays, parseZonedInput, startOfZonedDaysAgo } from "@/lib/time";

export type SP = Record<string, string | string[] | undefined>;
export const one = (sp: SP, k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";

export function listParams(sp: SP, defaultSize = 20) {
  const page = Math.max(1, Number(one(sp, "page")) || 1);
  const size = [10, 20, 50, 100].includes(Number(one(sp, "size"))) ? Number(one(sp, "size")) : defaultSize;
  return { page, size, offset: (page - 1) * size, q: one(sp, "q").trim().slice(0, 100) };
}

/** Period presets (today, 7d, 1m, 3m, 1y, all) or explicit from/to (YYYY-MM-DD, inclusive). */
export function periodRange(sp: SP): { from?: Date; to?: Date } {
  const from = one(sp, "from");
  const to = one(sp, "to");
  if (from || to) {
    const toStart = parseZonedInput(to);
    return {
      from: parseZonedInput(from) ?? undefined,
      // `to` is inclusive, so the exclusive bound is the start of the next calendar day.
      to: toStart ? addZonedDays(toStart, 1) : undefined,
    };
  }
  const p = one(sp, "period");
  const days: Record<string, number> = { today: 0, "7d": 7, "1m": 30, "3m": 90, "1y": 365 };
  if (!(p in days)) return {};
  return { from: startOfZonedDaysAgo(days[p]) };
}

export function periodWhere(col: AnyColumn, sp: SP): SQL | undefined {
  const r = periodRange(sp);
  return and(r.from ? gte(col, r.from) : undefined, r.to ? lt(col, r.to) : undefined);
}

export function likeQ(q: string) {
  return `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
}

export function csvCell(value: unknown) {
  let s = String(value ?? "");
  // Formula injection guard. A plain negative number (-58.50) is left alone so spreadsheets still sum it;
  // only a leading "-" followed by something that is not a number can start a formula.
  const numeric = /^-?\d+(\.\d+)?$/.test(s);
  if (!numeric && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function csvResponse(filename: string, rows: unknown[][]) {
  const body = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` } });
}

/**
 * Orders keep the English product title only (it is frozen at purchase time), so a search typed in
 * Korean found nothing. This also matches the product's Korean title, through a subquery so every
 * order list can use it without adding a join.
 */
export function orderProductTitleMatch(pattern: string) {
  return or(
    ilike(s.orders.productTitle, pattern),
    inArray(s.orders.productId, sql`(select ${s.products.id} from ${s.products} where ${s.products.titleKo} ilike ${pattern})`),
  );
}
