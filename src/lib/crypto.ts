import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { getEnv } from "@/lib/env";

function keyBytes(): Buffer {
  const raw = getEnv().TOKEN_ENCRYPTION_KEY;
  return createHash("sha256").update(raw).digest();
}

/** Encrypt plaintext for DB storage (AES-256-GCM). Empty → empty. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return "";
  if (!ciphertext.startsWith("v1:")) {
    // Legacy / plaintext fallback for local dev
    return ciphertext;
  }
  const [, ivB64, tagB64, dataB64] = ciphertext.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyBytes(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
