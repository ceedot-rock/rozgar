// SPDX-License-Identifier: Apache-2.0
// yaad.ts — Agent 8: Memory/Reputation ("yaad" = memory).
//
// The portable, signed earnings record — the credit on-ramp. Every receipt
// the mesh files is appended to the worker's ledger; the worker owns it,
// can carry it anywhere, and can one day show it to a lender. G7 ($0.02)
// covers a hosted export of the full signed history to any other platform.
//
// The invariant: the ledger is rebuildable from the receipt log alone
// (ReceiptLog.earningsFor). Yaad's index is a convenience, not the truth.
import { newId } from "../lib/crypto.js";
import { Receipt } from "../lib/receipt.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";

export interface WorkerLedger {
  workerKeyId: string;
  displayName: string;
  receipts: string[]; // receipt ids, in order
  gigsCompleted: number;
  earnedPaise: number;
  disputes: number;
  skillReceipts: Array<{ skill: string; score100: number; proofHash: string }>;
}

export class Yaad extends MeshAgent {
  private ledgers = new Map<string, WorkerLedger>();

  constructor(ctx: MeshContext) {
    super("yaad", "Yaad · Memory", ctx);
  }

  private ledgerFor(workerKeyId: string, displayName = "worker"): WorkerLedger {
    let l = this.ledgers.get(workerKeyId);
    if (!l) {
      l = {
        workerKeyId,
        displayName,
        receipts: [],
        gigsCompleted: 0,
        earnedPaise: 0,
        disputes: 0,
        skillReceipts: [],
      };
      this.ledgers.set(workerKeyId, l);
    }
    return l;
  }

  /** Append any mesh receipt to a worker's ledger. */
  append(workerKeyId: string, displayName: string, receipt: Receipt): WorkerLedger {
    const l = this.ledgerFor(workerKeyId, displayName);
    l.displayName = displayName;
    l.receipts.push(receipt.body.id);
    const p = receipt.body.payload;
    switch (receipt.body.kind) {
      case "payout-settled":
        l.gigsCompleted += 1;
        l.earnedPaise += Number(p["netPaise"] ?? 0);
        break;
      case "dispute-ruled":
        l.disputes += 1;
        break;
      case "skill-receipt":
        l.skillReceipts.push({
          skill: String(p["skill"] ?? ""),
          score100: Number(p["score100"] ?? 0),
          proofHash: String(p["proofHash"] ?? ""),
        });
        break;
    }
    this.receipt("reputation-appended", {
      workerKeyId,
      receiptKind: receipt.body.kind,
      receiptId: receipt.body.id,
      gigsCompleted: l.gigsCompleted,
      earnedPaise: l.earnedPaise,
    });
    return l;
  }

  ledger(workerKeyId: string): WorkerLedger | undefined {
    return this.ledgers.get(workerKeyId);
  }

  /** Public, verifiable earnings page data — the QR-linked reputation page. */
  publicPage(workerKeyId: string): (WorkerLedger & { verified: boolean }) | null {
    const l = this.ledgers.get(workerKeyId);
    if (!l) return null;
    // Cross-check against the receipt log: the index must match the truth.
    const truth = this.ctx.receipts.earningsFor(workerKeyId);
    const verified =
      truth.gigs === l.gigsCompleted &&
      truth.earnedPaise === l.earnedPaise &&
      truth.disputes === l.disputes;
    return { ...l, verified };
  }

  /**
   * Export the worker's full signed history (G7 $0.02 hosted transfer).
   * Returns a portable bundle the worker owns — importable anywhere.
   */
  exportHistory(workerKeyId: string): { bundleId: string; receiptCount: number; exportedAt: string } {
    const l = this.ledgers.get(workerKeyId);
    if (!l) throw new Error("yaad: unknown worker");
    this.toll("G7", 0, `hosted memory transfer for ${l.displayName}`);
    const ids = new Set(l.receipts);
    const receipts = this.ctx.receipts.all().filter((r) => ids.has(r.body.id));
    return {
      bundleId: newId("bundle"),
      receiptCount: receipts.length,
      exportedAt: new Date().toISOString(),
    };
  }
}
