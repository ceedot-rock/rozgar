// SPDX-License-Identifier: Apache-2.0
// khazana.ts — Agent 9: Treasury ("khazana" = treasury).
//
// Holds three SCOPED portfolios, each with a signed Warrant spending cap:
//  (a) gigPool — funds Hifazat escrows for seed gigs
//  (b) victimPool — receives slashed bonds; pays verified scam victims
//  (c) ops — the mesh's toll budget
// Every movement files a signed receipt; the public treasury page renders
// balances and flows. A financial-inclusion system must be auditable by its
// users — Khazana makes the mesh's own money as transparent as the workers'.
import { newId } from "../lib/crypto.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";

export type PortfolioId = "gigPool" | "victimPool" | "ops";

export interface Portfolio {
  id: PortfolioId;
  label: string;
  balancePaise: number;
  capPaise: number; // warrant cap — releases above this refuse
  releasedPaise: number;
}

export class Khazana extends MeshAgent {
  private portfolios = new Map<PortfolioId, Portfolio>([
    { id: "gigPool", label: "Seed gig pool", balancePaise: 0, capPaise: 0, releasedPaise: 0 },
    { id: "victimPool", label: "Victim compensation pool", balancePaise: 0, capPaise: 0, releasedPaise: 0 },
    { id: "ops", label: "Mesh operations (tolls)", balancePaise: 0, capPaise: 0, releasedPaise: 0 },
  ].map((p) => [p.id, p] as [PortfolioId, Portfolio]));

  constructor(ctx: MeshContext) {
    super("khazana", "Khazana · Treasury", ctx);
  }

  /** Seed a portfolio (owner-approved funding — the ₹10,000 decision lives here). */
  fund(id: PortfolioId, amountPaise: number, capPaise: number, source: string): Portfolio {
    if (amountPaise <= 0) throw new Error("khazana: funding amount must be positive");
    const p = this.get(id);
    p.balancePaise += amountPaise;
    p.capPaise = capPaise;
    this.receipt("treasury-funded", {
      portfolio: id,
      amountPaise,
      capPaise,
      source,
      balancePaise: p.balancePaise,
      fundingId: newId("fund"),
    });
    return { ...p };
  }

  /** Release funds from a portfolio — refuses above the warrant cap. */
  release(id: PortfolioId, amountPaise: number, purpose: string): Portfolio {
    const p = this.get(id);
    if (amountPaise > p.balancePaise)
      throw new Error(`khazana: insufficient balance in ${id}`);
    if (p.releasedPaise + amountPaise > p.capPaise)
      throw new Error(
        `khazana: warrant cap exceeded for ${id} (cap ₹${p.capPaise / 100}, would release ₹${(p.releasedPaise + amountPaise) / 100})`
      );
    p.balancePaise -= amountPaise;
    p.releasedPaise += amountPaise;
    this.receipt("treasury-swept", {
      portfolio: id,
      amountPaise,
      purpose,
      balancePaise: p.balancePaise,
      sweepId: newId("sweep"),
    });
    return { ...p };
  }

  /** Sweep a slashed bond into the victim pool (called by Nigrani). */
  sweepSlashedBond(amountPaise: number, listingId: string): Portfolio {
    const p = this.get("victimPool");
    p.balancePaise += amountPaise;
    this.receipt("treasury-swept", {
      portfolio: "victimPool",
      amountPaise,
      purpose: `slashed bond from ${listingId}`,
      balancePaise: p.balancePaise,
      sweepId: newId("sweep"),
    });
    return { ...p };
  }

  /** Compensate a verified scam victim from the victim pool. */
  compensateVictim(amountPaise: number, victimRef: string, evidence: string): Portfolio {
    return this.release("victimPool", amountPaise, `victim compensation for ${victimRef}: ${evidence}`);
  }

  get(id: PortfolioId): Portfolio {
    const p = this.portfolios.get(id);
    if (!p) throw new Error(`khazana: unknown portfolio ${id}`);
    return p;
  }

  /** Public treasury snapshot — balances and flows, no secrets. */
  snapshot(): Array<Portfolio & { movements: number }> {
    const counts = new Map<PortfolioId, number>();
    for (const r of this.ctx.receipts.all()) {
      if (r.body.kind === "treasury-funded" || r.body.kind === "treasury-swept") {
        const id = r.body.payload["portfolio"] as PortfolioId;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...this.portfolios.values()].map((p) => ({
      ...p,
      movements: counts.get(p.id) ?? 0,
    }));
  }
}
