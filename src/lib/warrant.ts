// SPDX-License-Identifier: Apache-2.0
// warrant.ts — G4 signed spending permissions.
// A worker signs a warrant capping their own exposure ("I will never pay to
// work"); the mesh refuses any flow that would move worker money.
import { Envelope, KeyPair, newId, seal, verifyPayload } from "./crypto.js";

export interface WarrantBody {
  id: string;
  issuer: string; // agent/worker name
  issuerKeyId: string;
  subject: string; // what the warrant covers
  maxSpendPaise: number; // hard cap; 0 = "I pay nothing"
  issuedAt: string;
  expiresAt: string;
}

export type Warrant = Envelope<WarrantBody>;

export function issueWarrant(
  keys: KeyPair,
  issuer: string,
  subject: string,
  maxSpendPaise: number,
  ttlMinutes = 60 * 48
): Warrant {
  const now = new Date();
  const body: WarrantBody = {
    id: newId("wrn"),
    issuer,
    issuerKeyId: keys.keyId,
    subject,
    maxSpendPaise,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
  };
  return seal(keys, body);
}

/** Returns null when valid, otherwise the reason it fails. */
export function checkWarrant(
  warrant: Warrant,
  issuerPublicPem: string,
  plannedSpendPaise: number,
  now = new Date()
): string | null {
  if (!verifyPayload(issuerPublicPem, warrant.body, warrant.sig))
    return "warrant signature invalid";
  if (new Date(warrant.body.expiresAt) < now) return "warrant expired";
  if (plannedSpendPaise > warrant.body.maxSpendPaise)
    return `warrant cap exceeded: planned ${plannedSpendPaise} paise > cap ${warrant.body.maxSpendPaise}`;
  return null;
}
