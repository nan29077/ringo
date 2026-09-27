import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { safePage, listParams } from "../../lib/server/list";

for (const value of ["", "Infinity", "NaN", "1.5", "1e99", "-1", "100001", "0"]) assert.equal(safePage(value), 1, value);
assert.equal(safePage("27"), 27);
assert.equal(listParams({ page: "Infinity" }).offset, 0);

const root = path.join(process.cwd(), ".data", "route-regression-files");
process.env.UPLOAD_DIR = root;
await mkdir(root, { recursive: true });
await writeFile(path.join(root, "sample.txt"), "0123456789");
const { streamDownload } = await import("../../lib/server/downloads");
const partial = await streamDownload("sample.txt", "sample.txt", "text/plain", { inline: true, range: "bytes=2-5" });
assert.equal(partial.status, 206);
assert.equal(partial.headers.get("content-range"), "bytes 2-5/10");
assert.equal(partial.headers.get("content-length"), "4");
assert.equal(await partial.text(), "2345");
const suffix = await streamDownload("sample.txt", "sample.txt", "text/plain", { range: "bytes=-3" });
assert.equal(suffix.status, 206);
assert.equal(await suffix.text(), "789");
const invalid = await streamDownload("sample.txt", "sample.txt", "text/plain", { range: "bytes=99-100" });
assert.equal(invalid.status, 416);
assert.equal(invalid.headers.get("content-range"), "bytes */10");
const full = await streamDownload("sample.txt", "sample.txt", "text/plain");
assert.equal(full.status, 200);
assert.equal(await full.text(), "0123456789");

const origin = process.env.BASE_URL;
if (origin) {
  for (const query of ["Infinity", "1.5", "1e99", "-1"]) {
    const response: Response = await fetch(`${origin}/?page=${encodeURIComponent(query)}`);
    assert.equal(response.status, 200, query);
  }
}
console.log("PASS pagination and local Range requests");
