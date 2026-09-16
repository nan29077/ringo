"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "./lang-provider";

export type UploadResult = { id?: string; key: string; url?: string; filename: string; bytes: number };

export function uploadFile(file: File, fields: Record<string, string>, onProgress?: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fd.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { error?: string } & UploadResult;
      try { body = JSON.parse(xhr.responseText); } catch { body = { error: "Upload failed" } as never; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(fd);
  });
}

/** Image picker that uploads immediately and writes the storage key into a hidden form input. */
export function ImageUploadField({ name, kind, defaultKey, defaultUrl, presets }: { name: string; kind: "cover" | "banner" | "avatar"; defaultKey?: string | null; defaultUrl: string; presets?: { key: string; url: string; label: string }[] }) {
  const { t } = useLang();
  const [key, setKey] = useState(defaultKey ?? "");
  const [url, setUrl] = useState(defaultUrl);
  const [pct, setPct] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-3">
      <input type="hidden" name={name} value={key} />
      <div className="flex flex-wrap items-center gap-4">
        <img src={url} alt="" className="h-28 w-28 rounded-xl border border-[#e9ebef] object-cover" />
        <div className="grid gap-2">
          <button type="button" className="rc-btn rc-btn-outline rc-btn-sm" onClick={() => input.current?.click()} disabled={pct !== null}>
            <Upload />{pct !== null ? `${pct}%` : t("Upload image", "이미지 업로드")}
          </button>
          <span className="text-xs text-[#8a8d96]">{t("JPG, PNG, WebP · up to 10 MB", "JPG, PNG, WebP · 최대 10MB")}</span>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setPct(0);
          try {
            const r = await uploadFile(f, { kind }, setPct);
            setKey(r.key);
            setUrl(r.url!);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
          } finally {
            setPct(null);
            e.target.value = "";
          }
        }} />
      </div>
      {presets && (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button type="button" key={p.key} onClick={() => { setKey(p.key); setUrl(p.url); }} className={`overflow-hidden rounded-lg border-2 ${key === p.key ? "border-[#3b5bdb]" : "border-transparent"}`} title={p.label}>
              <img src={p.url} alt={p.label} className="h-12 w-12 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Uploads one or more private files tied to a product or order, then refreshes the page. */
export function FileUploadButton({ kind, productId, orderId, label, accept }: { kind: "product-asset" | "deliverable"; productId?: string; orderId?: string; label?: string; accept?: string }) {
  const { t } = useLang();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="rc-btn rc-btn-outline rc-btn-sm" disabled={!!status} onClick={() => input.current?.click()}>
        <Upload />{status ?? label ?? t("Upload file", "파일 업로드")}
      </button>
      <input ref={input} type="file" multiple hidden accept={accept} onChange={async (e) => {
        const files = Array.from(e.target.files ?? []);
        for (const [i, f] of files.entries()) {
          try {
            await uploadFile(f, { kind, ...(productId ? { productId } : {}), ...(orderId ? { orderId } : {}) }, (p) => setStatus(`${i + 1}/${files.length} · ${p}%`));
          } catch (err) {
            toast.error(`${f.name}: ${err instanceof Error ? err.message : "Upload failed"}`);
          }
        }
        setStatus(null);
        e.target.value = "";
        if (files.length) {
          toast.success(t("Upload complete", "업로드 완료"));
          router.refresh();
        }
      }} />
    </>
  );
}
