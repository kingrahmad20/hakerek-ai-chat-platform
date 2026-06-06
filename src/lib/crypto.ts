import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Symmetric encryption for secrets at rest (OAuth refresh/access tokens for
// knowledge-base connectors). Uses AES-256-GCM with a key derived from
// NEXTAUTH_SECRET — the same secret that protects sessions — so no extra env
// var is required. The serialized form is `v1:<iv>:<tag>:<ciphertext>` (all
// base64), and `decryptSecret` round-trips it. A version prefix is included so
// the scheme can be rotated later without ambiguity.

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length

function getKey(): Buffer {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
        throw new Error("NEXTAUTH_SECRET is required to encrypt connector tokens");
    }
    // Derive a stable 32-byte key from the (arbitrary-length) secret.
    return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(serialized: string): string {
    const parts = serialized.split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error("Malformed encrypted secret");
    }
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

// Convenience helpers that tolerate null/undefined so callers can map optional
// token fields without branching.
export function encryptNullable(plaintext: string | null | undefined): string | null {
    return plaintext == null ? null : encryptSecret(plaintext);
}

export function decryptNullable(serialized: string | null | undefined): string | null {
    return serialized == null ? null : decryptSecret(serialized);
}
