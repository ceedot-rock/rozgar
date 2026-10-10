// SPDX-License-Identifier: Apache-2.0
// niyokta.ts — Agent 4: Employer representative ("niyokta" = employer).
//
// A human employer fills a simple gig form; Niyokta posts the listing WITH
// a 1% bond (G6) held against fraud, funds the full gig amount into Hifazat
// escrow BEFORE the listing goes live, and negotiates over Rider DMs.
//
// Key rule: no escrow, no listing. Money flows employer → escrow → worker,
// never worker → employer — this single rule kills the entire
// "pay ₹500 registration fee to apply" scam class.
import { newId } from "../lib/crypto.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";
import { Hifazat } from "./hifazat.js";
import { Talaash, Listing } from "./talaash.js";

export interface GigForm {
  title: string;
  payPaise: number;
  deadlineHours: number;
  skillRequired: string;
  locale: string;
  description: string;
}

export class Niyokta extends MeshAgent {
  constructor(
    ctx: MeshContext,
    private hifazat: Hifazat,
    private talaash: Talaash
  ) {
    super("niyokta", "Niyokta · Employer", ctx);
  }

  /**
   * Post a bonded listing. Steps, in order, all receipted:
   *  1. Fund the full gig amount into Hifazat escrow (G3 1%, employer side).
   *  2. Lock a 1% fraud bond (G6).
   *  3. Publish to Talaash (G2 listing = free).
   * If (1) fails, there is no listing. No escrow, no listing.
   */
  async postGig(form: GigForm, employerAgentId: string, funder: string): Promise<Listing> {
    if (form.payPaise <= 0) throw new Error("niyokta: gig pay must be positive");
    const listingId = newId("gig");

    // 1. Escrow first — the money is locked before the listing exists.
    const escrow = this.hifazat.fund({
      listingId,
      employerAgentId,
      workerKeyId: "", // assigned on match
      amountPaise: form.payPaise,
      funder,
      deadlineHours: form.deadlineHours,
    });

    // 2. Fraud bond: 1% of gig value, slashable by Nigrani.
    const bondPaise = Math.max(100, Math.round(form.payPaise * 0.01));
    this.toll("G6", form.payPaise / 100 / 88.5, `fraud bond for ${listingId}`);
    this.receipt("bond-posted", {
      listingId,
      bondPaise,
      escrowId: escrow.escrowId,
      slashableBy: "nigrani",
    });

    // 3. Publish.
    const listing: Listing = {
      listingId,
      title: form.title,
      payPaise: form.payPaise,
      deadlineHours: form.deadlineHours,
      skillRequired: form.skillRequired,
      locale: form.locale,
      employerAgentId,
      bonded: true,
      escrowed: true,
      live: true,
      postedAt: new Date().toISOString(),
    };
    this.talaash.publish(listing);
    this.receipt("listing-posted", {
      listingId,
      title: form.title,
      payPaise: form.payPaise,
      escrowId: escrow.escrowId,
      bondPaise,
    });
    await this.dm("mesh", `listing ${listingId} live: "${form.title}" — ₹${form.payPaise / 100}, escrow locked`);
    return listing;
  }
}
