// SPDX-License-Identifier: Apache-2.0
// crypto.ts — signing primitives for the Rozgar mesh.
// Every identity is an ES256 (ECDSA P-256) keypair; every rider, warrant,
// and receipt is a signed JSON envelope. No agent trusts another's word —
// only signatures.
import {
  createHash,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";

export interface KeyPair {
  /** PEM-encoded PKCS8 private key */
  privatePem: string;
  /** PEM-encoded SPKI public key */
  publicPem: string;
  /** sha256(publicPem) — stable public identifier */
  keyId: string;
}

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { privatePem, publicPem, keyId: sha256Hex(publicPem) };
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function canonicalJson(obj: unknown): string {
  // Deterministic serialization: sorted keys, no whitespace.
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`
  );
  return `{${pairs.join(",")}}`;
}

export function signPayload(privatePem: string, payload: unknown): string {
  const sign = createSign("SHA256");
  sign.update(canonicalJson(payload));
  sign.end();
  return sign.sign(privatePem, "base64url");
}

export function verifyPayload(
  publicPem: string,
  payload: unknown,
  signature: string
): boolean {
  const verify = createVerify("SHA256");
  verify.update(canonicalJson(payload));
  verify.end();
  return verify.verify(publicPem, signature, "base64url");
}

/** Signed envelope: { body, sig, kid }. Everything the mesh passes is one of these. */
export interface Envelope<T> {
  body: T;
  sig: string;
  kid: string; // keyId of the signer
}

export function seal<T>(keys: KeyPair, body: T): Envelope<T> {
  return { body, sig: signPayload(keys.privatePem, body), kid: keys.keyId };
}

export function openEnvelope<T>(
  publicPem: string,
  env: Envelope<T>
): T | null {
  if (sha256Hex(publicPem) !== env.kid) return null;
  return verifyPayload(publicPem, env.body, env.sig) ? env.body : null;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
