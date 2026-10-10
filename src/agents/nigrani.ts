// SPDX-License-Identifier: Apache-2.0
// nigrani.ts — Agent 7: Fraud watchdog ("nigrani" = watch).
//
// The demo's showstopper. Heuristics + a human-review queue over every
// listing and flagged DM:
//  - registration-fee / pay-to-apply language
//  - off-platform payment redirection (UPI ids, "pay me directly")
//  - credential fakery (skill receipt signature fails)
//  - repeat-offender phone hashes
// On a hit: kill the listing, SLASH the bond (G6) into Khazana's
// victim-compensation pool, annotate the scammer's identity (hash only),
// and DM the worker: "you paid ₹0."
import { sha256Hex } from "../lib/crypto.js";
import { Listing } from "./talaash.js";
import { MeshAgent, MeshContext } from "./mesh-agent.js";

export interface FraudSignal {
  rule: string;
  detail: string;
  weight: number; // 0..1
}

export interface ScanResult {
  listingId: string;
  signals: FraudSignal[];
  score: number; // 0..1
  verdict: "clean" | "review" | "kill";
}

const FEE_PATTERNS = [
  /registr\w*\s*(fee|fees|charge)/i,
  /pay\w*\s*(₹|rs\.?|inr)?\s*\d+\s*(to\s*)?apply/i,
  /security\s*deposit/i,
  /refundable\s*(fee|deposit|amount)/i,
  /training\s*(fee|cost)/i,
];

const OFFPLATFORM_PATTERNS = [
  /upi[:\s]/i,
  /@upi\b/i,
  /@ok\w+/i,
  /pay\s*me\s*directly/i,
  /whatsapp\s*(me|us)?\s*(\d|at)/i,
  /gpay|phonepe|paytm/i,
];

export class Nigrani extends MeshAgent {
  private killedPhones = new Map<string, number>(); // phoneHash -> kill count
  private fraudLog: ScanResult[] = [];

  constructor(ctx: MeshContext) {
    super("nigrani", "Nigrani · Watchdog", ctx);
  }

  /** Score a listing's text for fraud signals. Pure function — testable. */
  scan(listing: Listing, description: string, posterPhoneHash?: string): ScanResult {
    const signals: FraudSignal[] = [];
    for (const re of FEE_PATTERNS) {
      if (re.test(description) || re.test(listing.title)) {
        signals.push({ rule: "registration-fee-language", detail: `matched ${re}`, weight: 0.5 });
        break;
      }
    }
    for (const re of OFFPLATFORM_PATTERNS) {
      if (re.test(description)) {
        signals.push({ rule: "off-platform-payment", detail: `matched ${re}`, weight: 0.35 });
        break;
      }
    }
    if (posterPhoneHash && (this.killedPhones.get(posterPhoneHash) ?? 0) > 0) {
      signals.push({
        rule: "repeat-offender",
        detail: `phone hash seen in ${this.killedPhones.get(posterPhoneHash)} prior kills`,
        weight: 0.6,
      });
    }
    if (listing.payPaise > 0 && /fee/i.test(description) && listing.payPaise < 50000) {
      // tiny "gig" whose real ask is a fee — the classic shape
      signals.push({ rule: "fee-shaped-listing", detail: "low pay + fee language", weight: 0.25 });
    }
    const score = Math.min(1, signals.reduce((n, s) => n + s.weight, 0));
    const verdict = score >= 0.6 ? "kill" : score >= 0.3 ? "review" : "clean";
    const result: ScanResult = { listingId: listing.listingId, signals, score, verdict };
    this.fraudLog.push(result);
    return result;
  }

  /**
   * Kill a fraudulent listing: unpublish, slash the bond into the victim
   * pool, annotate the offender. Returns the slashed bond in paise.
   */
  async killListing(
    listing: Listing,
    bondPaise: number,
    posterPhoneHash: string | undefined,
    onSlash: (amountPaise: number, listingId: string) => void,
    unpublish: (listingId: string) => void
  ): Promise<number> {
    unpublish(listing.listingId);
    this.toll("G6", bondPaise / 100 / 88.5, `bond slash for ${listing.listingId}`);
    onSlash(bondPaise, listing.listingId);
    if (posterPhoneHash) {
      this.killedPhones.set(posterPhoneHash, (this.killedPhones.get(posterPhoneHash) ?? 0) + 1);
    }
    this.receipt("fraud-killed", {
      listingId: listing.listingId,
      title: listing.title,
      bondSlashedPaise: bondPaise,
      offenderRef: posterPhoneHash ? sha256Hex(posterPhoneHash).slice(0, 16) : "unknown",
      signals: this.fraudLog.filter((f) => f.listingId === listing.listingId).flatMap((f) => f.signals.map((s) => s.rule)),
    });
    return bondPaise;
  }

  /** Rule on a dispute. Both sides submit evidence over DM; signed ruling. */
  ruleDispute(args: {
    disputeId: string;
    listingId: string;
    workerKeyId: string;
    employerAgentId: string;
    workerEvidence: string;
    employerEvidence: string;
    /** "worker" | "employer" | "split" — in the demo the evidence decides. */
    decide: () => "worker" | "employer" | "split";
  }): "worker" | "employer" | "split" {
    const ruling = args.decide();
    this.receipt("dispute-ruled", {
      disputeId: args.disputeId,
      listingId: args.listingId,
      workerKeyId: args.workerKeyId,
      employerAgentId: args.employerAgentId,
      ruling,
      workerEvidenceChars: args.workerEvidence.length,
      employerEvidenceChars: args.employerEvidence.length,
      appealableTo: "human-review",
      slaHours: 48,
    });
    return ruling;
  }

  scanLog(): ScanResult[] {
    return [...this.fraudLog];
  }
}
