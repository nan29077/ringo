import "server-only";
import { storage } from "./storage";

export async function streamDownload(key: string, filename: string, contentType: string, opts: { inline?: boolean } = {}) {
  const driver = await storage();
  const signed = await driver.signedUrl(key, filename, 60, { ...opts, contentType });
  if (signed) return Response.redirect(signed, 302);
  const obj = await driver.get(key);
  if (!obj) return new Response("File missing", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": contentType || "application/octet-stream",
      "content-disposition": `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...(obj.size ? { "content-length": String(obj.size) } : {}),
    },
  });
}
