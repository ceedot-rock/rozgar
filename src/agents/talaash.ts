// SPDX-License-Identifier: Apache-2.0
// talaash.ts — Agent 3: Discovery/Matching ("talaash" = search).
//
// Job discovery + candidate matching. G2: listing is free for employers
// (removes the posting barrier for small businesses); we pay $0.02/lookup.
// Ranks by skill-receipt match, locale/language fit, and Yaad reputation.
import { newId } from "../lib/crypto.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";

export interface Listing {
  listingId: string;
  title: string;
  payPaise: number;
  deadlineHours: number;
  skillRequired: string;
  locale: string;
  employerAgentId: string;
  bonded: boolean;
  escrowed: boolean;
  live: boolean;
  postedAt: string;
}

export interface WorkerProfile {
  workerKeyId: string;
  displayName: string;
  skills: Array<{ skill: string; score100: number; proofHash: string }>;
  locale: string;
  gigsCompleted: number;
  earnedPaise: number;
  disputes: number;
}

export interface MatchResult {
  listing: Listing;
  score: number;
  reasons: string[];
}

export class Talaash extends MeshAgent {
  private listings = new Map<string, Listing>();

  constructor(ctx: MeshContext) {
    super("talaash", "Talaash · Matching", ctx);
  }

  publish(listing: Listing): Listing {
    // G2 listing = free. Receipted so the board is auditable.
    this.listings.set(listing.listingId, listing);
    return listing;
  }

  kill(listingId: string): void {
    const l = this.listings.get(listingId);
    if (l) {
      l.live = false;
      this.listings.set(listingId, l);
    }
  }

  openListings(): Listing[] {
    return [...this.listings.values()].filter((l) => l.live && l.bonded && l.escrowed);
  }

  allListings(): Listing[] {
    return [...this.listings.values()];
  }

  /** Rank open listings for a worker. G2 $0.02/lookup, receipted. */
  match(worker: WorkerProfile): MatchResult[] {
    this.toll("G2", 0, `discovery lookup for ${worker.displayName}`);
    const results: MatchResult[] = [];
    for (const listing of this.openListings()) {
      const reasons: string[] = [];
      let score = 0;
      const skill = worker.skills.find((s) => s.skill === listing.skillRequired);
      if (skill) {
        score += 50 + skill.score100 * 0.4;
        reasons.push(`skill receipt: ${listing.skillRequired} @ ${skill.score100}/100 (proven)`);
      } else {
        score += 5;
        reasons.push("no matching skill receipt — ranked lower");
      }
      if (worker.locale === listing.locale) {
        score += 15;
        reasons.push(`locale match: ${listing.locale}`);
      }
      const rep = worker.gigsCompleted * 2 - worker.disputes * 10;
      score += Math.max(-20, Math.min(20, rep));
      if (worker.gigsCompleted > 0)
        reasons.push(`reputation: ${worker.gigsCompleted} gigs, ₹${(worker.earnedPaise / 100).toFixed(0)} earned`);
      results.push({ listing, score: Math.round(score), reasons });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /** The worker accepts a match — the match-made receipt. */
  accept(workerKeyId: string, listingId: string): void {
    const listing = this.listings.get(listingId);
    if (!listing || !listing.live) throw new Error("talaash: listing not available");
    listing.live = false; // one worker per micro-gig
    this.receipt("match-made", {
      listingId,
      workerKeyId,
      employerAgentId: listing.employerAgentId,
      payPaise: listing.payPaise,
      matchId: newId("match"),
    });
  }
}
