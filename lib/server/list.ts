import "server-only";
import { and, gte, lt, type SQL, type AnyColumn } from "drizzle-orm";

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
    return {
      from: from ? new Date(from + "T00:00:00") : undefined,
      to: to ? new Date(new Date(to + "T00:00:00").getTime() + 86400000) : undefined,
    };
  }
  const p = one(sp, "period");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days: Record<string, number> = { today: 0, "7d": 7, "1m": 30, "3m": 90, "1y": 365 };
  if (!(p in days)) return {};
  return { from: new Date(startOfToday.getTime() - days[p] * 86400000) };
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
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function csvResponse(filename: string, rows: unknown[][]) {
  const body = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` } });
}
