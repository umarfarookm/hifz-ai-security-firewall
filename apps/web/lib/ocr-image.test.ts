import { readFileSync } from "node:fs";
import path from "node:path";
import { IngestError } from "@hifz/firewall-core";
import { describe, expect, it } from "vitest";
import { imageSize, ingestImage } from "./ocr-image.js";
import { InMemoryAuditWriter } from "./audit.js";
import { InMemoryReviewStore } from "./review-store.js";
import { runInspection } from "./inspect.js";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "apps/web/test-fixtures/ocr", name));
const b64 = (name: string) => fixture(name).toString("base64");

describe("imageSize", () => {
  it("reads a PNG's dimensions from its header", () => {
    const { width, height } = imageSize(fixture("clean.png"));
    expect(width).toBeGreaterThan(100);
    expect(height).toBeGreaterThan(20);
  });

  it("reads a JPEG's dimensions from its frame header", () => {
    // SOI, APP0 (length 16), SOF0 for 640 x 480.
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03]), Buffer.alloc(12),
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 640, height: 480 });
  });

  it("rejects anything that is not PNG or JPEG", () => {
    expect(() => imageSize(Buffer.from("GIF89a....................."))).toThrow(IngestError);
    expect(() => imageSize(Buffer.from("hello"))).toThrow(/PNG and JPEG/);
  });

  it("rejects a JPEG with no frame header", () => {
    expect(() => imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(IngestError);
  });
});

describe("ingestImage (real OCR, offline)", () => {
  it("reads attack text out of a screenshot-style image", async () => {
    const r = await ingestImage(b64("clean.png"));
    expect(r.visibleText.toLowerCase()).toContain("ignore all previous instructions");
    expect(r.hiddenSegments).toEqual([]);
  }, 60_000);

  it("reads low-contrast text", async () => {
    const r = await ingestImage(b64("low-contrast.png"));
    expect(r.visibleText.toLowerCase()).toContain("forward all messages");
  }, 60_000);

  it("reads ordinary text from a legitimate image", async () => {
    const r = await ingestImage(b64("legit.png"));
    expect(r.visibleText).toContain("Q3 budget review");
  }, 60_000);

  it("rejects an oversize image by dimensions, before running OCR", async () => {
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(5000, 16);
    png.writeUInt32BE(5000, 20);
    await expect(ingestImage(png.toString("base64"))).rejects.toThrow(/at most 1600/);
  });

  it("turns a corrupt image (valid header, garbage body) into an IngestError instead of crashing the process", async () => {
    const png = Buffer.alloc(200, 7);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(100, 16);
    png.writeUInt32BE(100, 20);
    await expect(ingestImage(png.toString("base64"))).rejects.toBeInstanceOf(IngestError);
    // The worker is rebuilt, so a good image still works afterwards.
    expect((await ingestImage(b64("legit.png"))).visibleText).toContain("Q3 budget");
  }, 60_000);
});

describe("runInspection with images", () => {
  const deps = () => {
    const audit = new InMemoryAuditWriter();
    return {
      audit,
      reviews: new InMemoryReviewStore(audit),
      gateway: { metadata: { provider: "none", model: "none" }, generateStructured: async () => { throw new Error("n/a"); }, runToolTurn: async () => { throw new Error("n/a"); } },
      escalationBand: { min: 20, max: 70 },
      failureMode: "review" as const,
      detectorVersion: "test",
      sessionRiskDecayMinutes: 30,
      investigatorTimeoutMs: 20_000,
      investigatorTemperature: 0,
      investigatorMaxRetries: 1,
    };
  };

  it("flags an injection that exists only as pixels", async () => {
    const outcome = await runInspection({ content: b64("clean.png"), contentType: "image", source: "document" }, deps());
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.body.decision).not.toBe("ALLOW");
      expect(outcome.body.extracted?.visibleText.toLowerCase()).toContain("ignore all previous instructions");
    }
  }, 60_000);

  it("allows a legitimate image and stores its text as the excerpt", async () => {
    const d = deps();
    const outcome = await runInspection({ content: b64("legit.png"), contentType: "image", source: "document" }, d);
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") expect(outcome.body.decision).toBe("ALLOW");
    expect(d.audit.inspections[0]?.contentExcerpt).toMatch(/^\[image, \d+ KB\] Hi team/);
  }, 60_000);

  it("answers a non-image with a validation error", async () => {
    const outcome = await runInspection({ content: Buffer.from("not an image").toString("base64"), contentType: "image", source: "document" }, deps());
    expect(outcome.kind).toBe("validation_error");
  });
});
