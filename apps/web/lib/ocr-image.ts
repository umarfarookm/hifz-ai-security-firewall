import { existsSync } from "node:fs";
import path from "node:path";
import type { Worker } from "tesseract.js";
import { IngestError, type MapIngestAdapter } from "@hifz/firewall-core";

/**
 * image adapter: reads the text in a PNG or JPEG with tesseract.js (WebAssembly, no network, model files bundled in
 * ocr-assets/). OCR is deterministic code, not a model, so a picture that says "ignore previous instructions" cannot
 * talk its way past the extractor, and an image costs no LLM tokens. Lives in apps/web rather than firewall-core
 * because it needs the bundled model files and a worker; the extracted text then goes through the same pipeline.
 *
 * Demo inputs are small by design: 100 KB of base64 (checked by the caller), at most 1600 x 1600 px, one OCR job at
 * a time on one reused worker (about 220 MB resident), and a hard time limit.
 */
export const MAX_IMAGE_PIXELS_SIDE = 1600;
const OCR_TIMEOUT_MS = 20_000;

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function assetRoot(): string {
  const candidates = [path.join(process.cwd(), "ocr-assets"), path.join(process.cwd(), "apps/web/ocr-assets")];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new IngestError("Image reading is not available on this server.");
  return found;
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const root = assetRoot();
      return createWorker("eng", 1, {
        // All local: if a file were missing the worker would fail instead of downloading anything.
        corePath: path.join(root, "core"),
        langPath: path.join(root, "lang"),
        cachePath: "/tmp",
        gzip: true,
        // Without a handler tesseract.js rethrows worker errors as an uncaught exception, which kills the process.
        // With one, the error rejects the job that caused it and we rebuild the worker next time.
        errorHandler: () => {
          workerPromise = null;
        },
      });
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

export const ingestImage: MapIngestAdapter = async (raw) => {
  const bytes = Buffer.from(raw, "base64");
  const { width, height } = imageSize(bytes);
  if (width > MAX_IMAGE_PIXELS_SIDE || height > MAX_IMAGE_PIXELS_SIDE) {
    throw new IngestError(`The image is ${width} x ${height} px; the demo accepts at most ${MAX_IMAGE_PIXELS_SIDE} x ${MAX_IMAGE_PIXELS_SIDE}.`);
  }
  const text = await runOcr(bytes);
  return { visibleText: text, hiddenSegments: [] };
};

function runOcr(bytes: Buffer): Promise<string> {
  const job = queue.then(async () => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const worker = await getWorker();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          workerPromise = null;
          void worker.terminate();
          reject(new IngestError("Reading the image took too long."));
        }, OCR_TIMEOUT_MS);
      });
      const { data } = await Promise.race([worker.recognize(bytes), timeout]);
      return data.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    } catch (err) {
      if (err instanceof IngestError) throw err;
      throw new IngestError("The image could not be read.");
    } finally {
      clearTimeout(timer);
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Width and height from the file header; also the format check (PNG or JPEG only, by magic bytes). */
export function imageSize(b: Buffer): { width: number; height: number } {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      // SOF0..SOF15 except DHT (c4), JPG (c8) and DAC (cc) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
    throw new IngestError("The JPEG is damaged (no frame header found).");
  }
  throw new IngestError("Only PNG and JPEG images are accepted.");
}
