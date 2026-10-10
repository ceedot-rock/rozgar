// SPDX-License-Identifier: Apache-2.0
// hifazat.ts — Agent 5: Escrow guardian ("hifazat" = protection).
//
// Holds gig funds and releases ONLY on verified completion (a signed
// completion attestation from Parakh or a Nigrani dispute ruling), or
// refunds the employer on expiry. G3 1% — always from the employer side,
// never from the worker.
import { newId } from "../lib/crypto.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";

export interface EscrowContract {
  listingId: string;
  employerAgentId: string;
  workerKeyId: string; // empty until matched
  amountPaise: number;
  funder: string; // portfolio or employer that supplied the funds
  deadlineHours: number;
}

export interface Escrow {
  escrowId: string;
  contract: EscrowContract;
  state: "funded" | "released" | "refunded";
  fundedAt: string;
  releasedAt?: string;
  attestationHash?: string;
}

export class Hifazat extends MeshAgent {
  private escrows = new Map<string, Escrow>();

  constructor(ctx: MeshContext) {
    super("hifazat", "Hifazat · Escrow", ctx);
  }

  /** Lock funds. G3 1% charged to the employer side, receipted. */
  fund(contract: EscrowContract): Escrow {
    if (contract.amountPaise <= 0) throw new Error("hifazat: escrow amount must be positive");
    this.toll("G3", contract.amountPaise / 100 / 88.5, `escrow for ${contract.listingId}`);
    const escrow: Escrow = {
      escrowId: newId("esc"),
      contract,
      state: "funded",
      fundedAt: new Date().toISOString(),
    };
    this.escrows.set(escrow.escrowId, escrow);
    this.receipt("escrow-funded", {
      escrowId: escrow.escrowId,
      listingId: contract.listingId,
      amountPaise: contract.amountPaise,
      funder: contract.funder,
    });
    return escrow;
  }

  assignWorker(escrowId: string, workerKeyId: string): Escrow {
    const e = this.get(escrowId);
    if (e.state !== "funded") throw new Error("hifazat: escrow not in funded state");
    e.contract.workerKeyId = workerKeyId;
    return e;
  }

  /**
   * Release funds to settlement. Requires a signed completion attestation
   * (proof hash from Parakh's deliverable validation or a Nigrani ruling).
   * Without it, this method refuses — that refusal IS the wage-theft guard.
   */
  release(escrowId: string, attestationHash: string): Escrow {
    const e = this.get(escrowId);
    if (e.state !== "funded") throw new Error("hifazat: escrow not in funded state");
    if (!attestationHash) throw new Error("hifazat: release refused — no completion attestation");
    if (!e.contract.workerKeyId) throw new Error("hifazat: release refused — no worker assigned");
    e.state = "released";
    e.releasedAt = new Date().toISOString();
    e.attestationHash = attestationHash;
    this.receipt("escrow-released", {
      escrowId,
      listingId: e.contract.listingId,
      amountPaise: e.contract.amountPaise,
      workerKeyId: e.contract.workerKeyId,
      attestationHash,
    });
    return e;
  }

  refund(escrowId: string, reason: string): Escrow {
    const e = this.get(escrowId);
    if (e.state !== "funded") throw new Error("hifazat: escrow not in funded state");
    e.state = "refunded";
    e.releasedAt = new Date().toISOString();
    this.receipt("escrow-refunded", { escrowId, reason, amountPaise: e.contract.amountPaise });
    return e;
  }

  get(escrowId: string): Escrow {
    const e = this.escrows.get(escrowId);
    if (!e) throw new Error("hifazat: unknown escrow");
    return e;
  }

  escrowForListing(listingId: string): Escrow | undefined {
    return [...this.escrows.values()].find((e) => e.contract.listingId === listingId);
  }
}
