-- Image inputs (OCR). Additive and safe to run once; IF NOT EXISTS makes a re-run harmless.
-- Apply to dev first, then demo, only when the image feature is being released.
alter type content_type add value if not exists 'image';
