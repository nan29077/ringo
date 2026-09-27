import "server-only";
import { storage } from "./storage";

export async function streamDownload(key: string, filename: string, contentType: string, opts: { inline?: boolean; range?: string | null } = {}) {
  const driver = await storage();
  const signed = await driver.signedUrl(key, filename, 60, { ...opts, contentType });
  if (signed) return Response.redirect(signed, 302);
  const obj = await driver.get(key);
  if (!obj) return new Response("File missing", { status: 404 });
  let body = obj.body;
  let start = 0, end = (obj.size ?? 0) - 1;
  const range = opts.range;
  if (range && obj.size !== undefined) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      await body.cancel();
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${obj.size}` } });
    }
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, obj.size - suffix);
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), obj.size - 1) : obj.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= obj.size) {
      await body.cancel();
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${obj.size}` } });
    }
    await body.cancel();
    body = (await driver.get(key, { start, end }))!.body;
  }
  return new Response(body, {
    status: range && obj.size !== undefined ? 206 : 200,
    headers: {
      "content-type": contentType || "application/octet-stream",
      "content-disposition": `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...(obj.size !== undefined ? { "accept-ranges": "bytes", "content-length": String(range ? end - start + 1 : obj.size) } : {}),
      ...(range && obj.size !== undefined ? { "content-range": `bytes ${start}-${end}/${obj.size}` } : {}),
    },
  });
}
