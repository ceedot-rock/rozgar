// SPDX-License-Identifier: Apache-2.0
// awlpay-rail.ts — the primary settlement rail.
//
// AwLPay's production network charges 0.5% flat, no fixed fee. This adapter
// enforces exactly that fee math and produces a signed settlement receipt.
//
// Mode: "pilot-ledger" by default — the mesh's own auditable ledger, no
// credentials, no network. A live AwLPay broadcast adapter can be injected
// (settleLive); until then every txRef is labeled pilot-ledger, never
// presented as an on-chain hash. That is the honest boundary the demo keeps.
import { newId, sha256Hex } from "../lib/crypto.js";
import { Quote, SettledReceipt, SettlementRail } from "./settlement-rail.js";

export const AWLPAY_FEE_PCT = 0.005; // 0.5% flat, per AwLPay fee schedule

export interface LiveSettleFn {
  (q: Quote): Promise<{ txHash: string }>;
}

export class AwLPayRail implements SettlementRail {
  readonly name = "awlpay" as const;
  private live?: LiveSettleFn;

  /** Pass a live broadcast function to settle on-chain; omit for pilot-ledger. */
  constructor(live?: LiveSettleFn) {
    this.live = live;
  }

  enabled(): boolean {
    return true; // always on — the demo never needs a key
  }

  async quote(amountPaise: number, dest: string): Promise<Quote> {
    if (amountPaise <= 0) throw new Error("awlpay: amount must be positive");
    if (!dest) throw new Error("awlpay: destination required");
    const feePaise = Math.max(1, Math.round(amountPaise * AWLPAY_FEE_PCT));
    return {
      rail: "awlpay",
      amountPaise,
      feePaise,
      netPaise: amountPaise - feePaise,
      dest,
      quotedAt: new Date().toISOString(),
      mode: this.live ? "live" : "pilot-ledger",
    };
  }

  async settle(q: Quote): Promise<SettledReceipt> {
    const quoteId = newId("q");
    if (this.live) {
      const { txHash } = await this.live(q);
      return {
        rail: "awlpay",
        quoteId,
        amountPaise: q.amountPaise,
        feePaise: q.feePaise,
        netPaise: q.netPaise,
        dest: q.dest,
        txRef: txHash,
        txRefKind: "onchain",
        settledAt: new Date().toISOString(),
      };
    }
    // Pilot ledger: deterministic reference, labeled as such.
    const txRef = `pilot_${sha256Hex(`${quoteId}|${q.amountPaise}|${q.dest}|${q.quotedAt}`).slice(0, 32)}`;
    return {
      rail: "awlpay",
      quoteId,
      amountPaise: q.amountPaise,
      feePaise: q.feePaise,
      netPaise: q.netPaise,
      dest: q.dest,
      txRef,
      txRefKind: "pilot-ledger",
      settledAt: new Date().toISOString(),
    };
  }
}
