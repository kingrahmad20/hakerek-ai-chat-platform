-- Approximate-nearest-neighbour index for semantic chat search.
-- Backs the cosine query in src/app/api/search/route.ts (mode=semantic):
--   1 - (m.embedding <=> '[...]'::vector)
-- Run once against the PostgreSQL database:
--   psql $DATABASE_URL -f scripts/setup-vector-search.sql

-- pgvector must already be installed (the Message.embedding vector(1536) column needs it).
CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW index with cosine distance (vector_cosine_ops) so the `<=>` ORDER BY
-- uses the index instead of scanning every message. HNSW gives better recall
-- than ivfflat and needs no training step / row-count tuning.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_embedding_hnsw_idx"
ON "Message" USING hnsw (embedding vector_cosine_ops);
