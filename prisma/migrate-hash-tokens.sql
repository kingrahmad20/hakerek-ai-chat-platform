-- Migration: hash existing plaintext API tokens
-- Run this BEFORE `prisma db push` to preserve existing tokens.
-- Requires PostgreSQL 11+ (sha256 built-in).

BEGIN;

-- Add the new hashed column
ALTER TABLE "ApiToken" ADD COLUMN "tokenHash" TEXT;

-- Populate it from the existing plaintext values
UPDATE "ApiToken"
SET "tokenHash" = encode(sha256("token"::bytea), 'hex');

-- Enforce non-null and uniqueness
ALTER TABLE "ApiToken" ALTER COLUMN "tokenHash" SET NOT NULL;
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- Drop old plaintext column and its index
DROP INDEX IF EXISTS "ApiToken_token_key";
ALTER TABLE "ApiToken" DROP COLUMN "token";

COMMIT;
