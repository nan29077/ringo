import { storage } from "@/lib/server/storage";

export const runtime = "nodejs";

const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/** Public media (covers, banners, avatars). Private keys are never served here. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  if (!path.startsWith("public/") || path.includes("..")) return new Response("Not found", { status: 404 });
  const driver = await storage();
  const obj = await driver.get(path);
  if (!obj) return new Response("Not found", { status: 404 });
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return new Response(obj.body, {
    headers: {
      "content-type": obj.contentType || types[ext] || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      ...(obj.size ? { "content-length": String(obj.size) } : {}),
    },
  });
}
