-- Full-text search setup for Message table
-- Run once against the PostgreSQL database:
--   psql $DATABASE_URL -f scripts/setup-fts.sql

-- Enable pg_trgm for partial/fuzzy matching as a fallback
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on a functional tsvector so queries like:
--   to_tsvector('simple', content) @@ plainto_tsquery('simple', ...)
-- are fast without altering the Message schema.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_content_fts_idx"
ON "Message" USING gin(to_tsvector('simple', content));

-- Trigram index for short queries (< 3 chars) and LIKE-based fallback
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_content_trgm_idx"
ON "Message" USING gin(content gin_trgm_ops);
