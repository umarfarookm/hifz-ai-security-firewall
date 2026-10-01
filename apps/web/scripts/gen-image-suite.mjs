// Renders datasets/images/manifest.jsonl into PNG/JPEG files with headless Chromium (Playwright).
// Run: node apps/web/scripts/gen-image-suite.mjs
// The texts and styles are original to this project (see datasets/images/README.md); no external image data.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../../../datasets/images");
const rows = readFileSync(path.join(dir, "manifest.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
for (const r of rows) {
  const s = r.style;
  const body = s.card
    ? `<div style="font-size:12px;color:#5f6368;margin-bottom:10px">From: notifications@service-desk.test &nbsp; To: you@example.test</div><div style="font-weight:600;margin-bottom:8px">Message</div>${esc(r.text)}`
    : esc(r.text).replace(/\n/g, "<br>");
  const mono = s.font === "Courier New";
  await page.setContent(`<body style="margin:0;background:#888"><div style="padding:40px;display:inline-block;background:#888">
    <div id="card" style="background:${s.bg};color:${s.fg};font:${s.size}px/${Math.round(s.size * 1.45)}px '${s.font}',sans-serif;
      width:${s.size < 15 ? 360 : 520}px;padding:26px 30px;transform:rotate(${s.rotate ?? 0}deg);${mono ? "white-space:pre-wrap;" : ""}">${body}</div></div></body>`);
  const fmt = s.fmt === "jpg" ? "jpeg" : "png";
  const file = `${r.id}.${s.fmt === "jpg" ? "jpg" : "png"}`;
  await page.locator("body > div").screenshot({ path: path.join(dir, file), type: fmt, ...(fmt === "jpeg" ? { quality: 70 } : {}) });
  const kb = Math.round(statSync(path.join(dir, file)).size / 1024);
  if (kb > 70) console.warn(`${file} is ${kb} KB (limit 75 KB file)`);
  r.file = file;
}
await browser.close();
writeFileSync(path.join(dir, "manifest.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`rendered ${rows.length} images into ${dir}`);
