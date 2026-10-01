import { NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

// SPIKE ONLY (feat/document-image-inputs, task T0): proves tesseract.js can run offline inside a Next.js
// route on Vercel. Throwaway: removed or replaced by the real image adapter in T9.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const root = process.cwd();
const FILES = ["clean.png", "email-card.png", "low-contrast.png", "rotated-stylised.png", "legit.png"];

export async function GET(req: Request) {
  const mem = () => Math.round(process.memoryUsage().rss / 1048576);
  const t0 = performance.now();
  try {
    const worker = await createWorker("eng", 1, {
      // Everything local: no CDN. If an asset is missing the worker fails instead of silently downloading.
      workerPath: path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js"),
      corePath: path.join(root, "ocr-assets/core"),
      langPath: path.join(root, "ocr-assets/lang"),
      cachePath: "/tmp",
      gzip: true,
    });
    const ready = performance.now() - t0;
    const only = new URL(req.url).searchParams.get("file");
    const results = [];
    for (const f of only ? [only] : FILES) {
      const t = performance.now();
      const buf = await readFile(path.join(root, "public/spike", f));
      const { data } = await worker.recognize(buf);
      results.push({ file: f, ms: Math.round(performance.now() - t), confidence: Math.round(data.confidence), text: data.text.replace(/\s+/g, " ").trim() });
    }
    await worker.terminate();
    return NextResponse.json({ ok: true, workerReadyMs: Math.round(ready), totalMs: Math.round(performance.now() - t0), rssMb: mem(), node: process.version, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), totalMs: Math.round(performance.now() - t0), rssMb: mem() }, { status: 500 });
  }
}
