// SPDX-License-Identifier: Apache-2.0
// mesh-agent.ts — the base every Rozgar agent extends.
//
// Each agent holds its own Rider identity + signing keypair, its own toll
// budget, and files a signed receipt for every action. Narrow contracts:
// defined inputs, defined outputs, nothing else.
import { KeyPair, generateKeyPair } from "../lib/crypto.js";
import { Receipt, ReceiptKind, ReceiptLog, fileReceipt } from "../lib/receipt.js";
import { RiderClient, RiderIdentity, createRiderClient } from "../lib/rider.js";
import { TollCharge, chargeToll, TollGate } from "../lib/tolls.js";

export interface MeshContext {
  rider: RiderClient;
  receipts: ReceiptLog;
  dataDir: string;
}

export abstract class MeshAgent {
  readonly name: string;
  readonly keys: KeyPair;
  readonly identity: RiderIdentity;
  protected ctx: MeshContext;
  private tolls: TollCharge[] = [];

  constructor(name: string, displayName: string, ctx: MeshContext) {
    this.name = name;
    this.ctx = ctx;
    this.keys = generateKeyPair();
    // Each agent mints its own identity at boot — its signed seat in the mesh.
    this.identity = ctx.rider.importIdentity(
      `mesh_${name}`,
      `Rozgar/${displayName}`,
      this.keys
    );
  }

  /** Charge a toll gate and receipt it. The mesh never spends silently. */
  protected toll(gate: TollGate["id"], basisValueUsd: number, basis: string): TollCharge {
    const charge = chargeToll(gate, this.name, basisValueUsd, basis);
    this.tolls.push(charge);
    this.ctx.receipts.append(
      fileReceipt(this.keys, this.name, "toll-charged", {
        gate: charge.gate,
        usd: charge.usd,
        paise: charge.paise,
        basis: charge.basis,
      })
    );
    return charge;
  }

  protected receipt(kind: ReceiptKind, payload: Record<string, unknown>): Receipt {
    const r = fileReceipt(this.keys, this.name, kind, payload);
    return this.ctx.receipts.append(r);
  }

  tollsPaid(): TollCharge[] {
    return [...this.tolls];
  }

  async dm(to: string, text: string): Promise<void> {
    const res = await this.ctx.rider.dm(to, `[${this.name}] ${text}`);
    this.receipt("dm-sent", { to, via: res.via, chars: text.length });
  }

  async verifyCounterparty(riderJwt: string): Promise<boolean> {
    return (await this.ctx.rider.verify(riderJwt)).valid;
  }
}

export function makeContext(dataDir: string, rider?: RiderClient): MeshContext {
  return {
    rider: rider ?? createRiderClient(),
    receipts: new ReceiptLog(dataDir),
    dataDir,
  };
}
