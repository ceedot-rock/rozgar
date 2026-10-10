// SPDX-License-Identifier: Apache-2.0
// hisab.ts — Agent 6: Settlement ("hisab" = accounts).
//
// Pays the worker over the SettlementRail interface (AwLPayRail primary,
// always on; CoinbaseRail optional). Enforces the worker's Warrant cap:
// if the planned flow would cost the worker anything, it refuses.
import { checkWarrant, Warrant } from "../lib/warrant.js";
import { SettledReceipt, SettlementRail } from "../rails/settlement-rail.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";

export class Hisab extends MeshAgent {
  constructor(
    ctx: MeshContext,
    private rail: SettlementRail
  ) {
    super("hisab", "Hisab · Settlement", ctx);
  }

  /**
   * Settle a released escrow to the worker. The warrant check is the
   * "worker never pays to work" guarantee, enforced in code, not copy.
   */
  async settlePayout(args: {
    escrowId: string;
    amountPaise: number;
    workerKeyId: string;
    workerDest: string;
    workerWarrant: Warrant;
    workerPublicPem: string;
    attestationHash: string;
  }): Promise<SettledReceipt> {
    const warrantProblem = checkWarrant(args.workerWarrant, args.workerPublicPem, 0);
    if (warrantProblem) throw new Error(`hisab: ${warrantProblem}`);
    // The rail fee comes off the gross; the worker's warrant cap (₹0) covers
    // exactly this: the worker never pays a fee out of pocket — the employer
    // funded the gross and the rail deducts its fee from it.
    const quote = await this.rail.quote(args.amountPaise, args.workerDest);
    const settled = await this.rail.settle(quote);
    this.receipt("payout-settled", {
      escrowId: args.escrowId,
      rail: settled.rail,
      amountPaise: settled.amountPaise,
      feePaise: settled.feePaise,
      netPaise: settled.netPaise,
      workerKeyId: args.workerKeyId,
      txRef: settled.txRef,
      txRefKind: settled.txRefKind,
      attestationHash: args.attestationHash,
    });
    await this.dm(args.workerKeyId, `payout settled: ₹${(settled.netPaise / 100).toFixed(2)} via ${settled.rail} (${settled.txRefKind})`);
    return settled;
  }

  railName(): string {
    return this.rail.name;
  }
}
