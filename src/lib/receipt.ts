// SPDX-License-Identifier: Apache-2.0
// receipt.ts — the mesh's system of record.
// Design rule (§4.3): no agent action without a receipt, no receipt without
// a signature. The ReceiptLog is append-only JSONL; if our database vanished,
// every identity, payment, and reputation could be rebuilt from receipts.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { KeyPair, newId, seal, verifyPayload, Envelope } from "./crypto.js";

export type ReceiptKind =
  | "identity-issued"
  | "skill-receipt"
  | "match-made"
  | "listing-posted"
  | "bond-posted"
  | "bond-slashed"
  | "escrow-funded"
  | "escrow-released"
  | "escrow-refunded"
  | "payout-settled"
  | "work-verified"
  | "warrant-issued"
  | "fraud-killed"
  | "dispute-ruled"
  | "reputation-appended"
  | "treasury-funded"
  | "treasury-swept"
  | "toll-charged"
  | "dm-sent";

export interface ReceiptBody {
  id: string;
  kind: ReceiptKind;
  agent: string; // agent name that filed it
  agentKeyId: string;
  ts: string; // ISO-8601
  payload: Record<string, unknown>;
}

export type Receipt = Envelope<ReceiptBody>;

export function fileReceipt(
  keys: KeyPair,
  agent: string,
  kind: ReceiptKind,
  payload: Record<string, unknown>
): Receipt {
  const body: ReceiptBody = {
    id: newId("rcpt"),
    kind,
    agent,
    agentKeyId: keys.keyId,
    ts: new Date().toISOString(),
    payload,
  };
  return seal(keys, body);
}

export function verifyReceipt(receipt: Receipt, publicPem: string): boolean {
  return verifyPayload(publicPem, receipt.body, receipt.sig);
}

/** Append-only JSONL receipt log. */
export class ReceiptLog {
  private file: string;
  private cache: Receipt[] = [];
  private loaded = false;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "receipts.jsonl");
  }

  append(receipt: Receipt): Receipt {
    appendFileSync(this.file, JSON.stringify(receipt) + "\n");
    this.cache.push(receipt);
    return receipt;
  }

  all(): Receipt[] {
    if (!this.loaded) {
      this.loaded = true;
      if (existsSync(this.file)) {
        for (const line of readFileSync(this.file, "utf8").split("\n")) {
          const t = line.trim();
          if (t) this.cache.push(JSON.parse(t) as Receipt);
        }
      }
    }
    return [...this.cache];
  }

  byKind(kind: ReceiptKind): Receipt[] {
    return this.all().filter((r) => r.body.kind === kind);
  }

  /** Rebuild per-worker earnings from receipts alone (the Yaad invariant). */
  earningsFor(workerKeyId: string): { gigs: number; earnedPaise: number; disputes: number } {
    let gigs = 0;
    let earnedPaise = 0;
    let disputes = 0;
    for (const r of this.all()) {
      if (r.body.kind === "payout-settled" && r.body.payload["workerKeyId"] === workerKeyId) {
        gigs += 1;
        earnedPaise += Number(r.body.payload["netPaise"] ?? 0);
      }
      if (r.body.kind === "dispute-ruled" && r.body.payload["workerKeyId"] === workerKeyId) {
        disputes += 1;
      }
    }
    return { gigs, earnedPaise, disputes };
  }

  countByKind(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.all()) out[r.body.kind] = (out[r.body.kind] ?? 0) + 1;
    return out;
  }
}

export const RECEIPT_LOG_PATH = (dir: string) => join(dir, "receipts.jsonl");
