import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, processImage, sniffImage, storagePathFromPublicUrl } from "@/lib/admin/image-upload";

const png = (w = 40, h = 30) => sharp({ create: { width: w, height: h, channels: 3, background: "#c04f28" } }).png().toBuffer();

describe("processImage", () => {
  it("re-encodes a PNG as WebP", async () => {
    const r = await processImage(await png());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.subarray(0, 4).toString()).toBe("RIFF");
      expect(r.data.subarray(8, 12).toString()).toBe("WEBP");
    }
  });
  it("shrinks very large images to 2000 px", async () => {
    const r = await processImage(await png(4000, 3000));
    expect(r.ok && r.width).toBe(2000);
    expect(r.ok && r.height).toBe(1500);
  });
  it("strips embedded metadata such as GPS location", async () => {
    const withExif = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#000" } })
      .jpeg().withExif({ IFD0: { Copyright: "secret-owner" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined(); // the input really has metadata
    const r = await processImage(withExif);
    expect(r.ok).toBe(true);
    if (r.ok) expect((await sharp(r.data).metadata()).exif).toBeUndefined();
  });
  it("rejects SVG, HTML, executables, empty files and corrupt images regardless of name", async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    for (const bad of [enc("<svg xmlns='http://www.w3.org/2000/svg' onload='x()'/>"), enc("<html><script>alert(1)</script></html>"), enc("MZ\u0090\u0000\u0003 executable bytes here"), new Uint8Array()]) {
      expect((await processImage(bad)).ok).toBe(false);
    }
    const truncated = (await png()).subarray(0, 30); // valid header, broken body
    expect((await processImage(truncated)).ok).toBe(false);
  });
  it("enforces the per-file size limit", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r = await processImage(big);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/8 MB/);
  });
});

describe("sniffImage", () => {
  it("recognizes only jpeg, png and webp", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("jpg");
    expect(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))).toBeNull(); // GIF
  });
});

describe("storagePathFromPublicUrl", () => {
  const base = "https://abc.supabase.co";
  it("extracts our own object paths and refuses everything else", () => {
    expect(storagePathFromPublicUrl(`${base}/storage/v1/object/public/project-images/projects/a.webp`, base, "project-images")).toBe("projects/a.webp");
    expect(storagePathFromPublicUrl("https://evil.test/storage/v1/object/public/project-images/a.webp", base, "project-images")).toBeNull();
    expect(storagePathFromPublicUrl(`${base}/storage/v1/object/public/other-bucket/a.webp`, base, "project-images")).toBeNull();
    expect(storagePathFromPublicUrl(`${base}/storage/v1/object/public/project-images/../secret`, base, "project-images")).toBeNull();
  });
});
