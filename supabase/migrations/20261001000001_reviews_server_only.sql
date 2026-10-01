-- Close a gap in the review queue's row-level security.
--
-- The initial schema let ANY signed-in user (auth.role() = 'authenticated') read and update `reviews`
-- directly through Supabase's REST API. The comment said "reviewer-only", but the policy never checked the
-- reviewer role, and the update policy had no column restriction. A signed-in non-reviewer could approve a
-- review without ever touching POST /api/v1/reviews/{id}/decision, whose server-side reviewer check was
-- therefore not a real boundary. Reproduced on the dev project on 2026-10-01.
--
-- Nothing legitimate needs this access: the review queue page reads through GET /api/v1/reviews and
-- decides through POST /api/v1/reviews/{id}/decision, both of which use the server-only service key, which
-- bypasses row-level security. Dropping the policies leaves the table with no direct access for anon or
-- authenticated users, which matches the rest of the design ("the browser never writes to the database").
drop policy if exists reviews_reviewer_read on reviews;
drop policy if exists reviews_reviewer_update on reviews;
