import { randomBytes } from "node:crypto";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(length: number) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
export function newOrderNo() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `RG-${ymd}-${randomCode(6)}`;
}
export function slugify(input: string) {
  return input.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "item";
}
