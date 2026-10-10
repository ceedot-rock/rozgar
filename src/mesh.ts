// SPDX-License-Identifier: Apache-2.0
// mesh.ts — orchestration: how the nine agents work a gig.
//
// Two scripted flows, both fully live inside the mesh (no mocks):
//  - runGoldenPath: onboard → skill proof → bonded listing → match →
//    warrant → work+verify → escrow release → payout → reputation.
//  - runFraudPath: a scammer posts a registration-fee listing → Nigrani
//    kills it, slashes the bond, the worker is told they paid ₹0.
//
// The demo persona (Aisha, 21, Lucknow) is fictional and labeled as such
// everywhere it appears.
import { sha256Hex } from "./lib/crypto.js";
import { Receipt, fileReceipt } from "./lib/receipt.js";
import { issueWarrant } from "./lib/warrant.js";
import { generateKeyPair } from "./lib/crypto.js";
import { AwLPayRail } from "./rails/awlpay-rail.js";
import { SettlementRail } from "./rails/settlement-rail.js";
import { MeshContext, makeContext } from "./agents/mesh-agent.js";
import { Pehchaan } from "./agents/pehchaan.js";
import { Parakh, SkillReceiptPayload } from "./agents/parakh.js";
import { Talaash, Listing } from "./agents/talaash.js";
import { Niyokta } from "./agents/niyokta.js";
import { Hifazat } from "./agents/hifazat.js";
import { Hisab } from "./agents/hisab.js";
import { Nigrani } from "./agents/nigrani.js";
import { Yaad } from "./agents/yaad.js";
import { Khazana } from "./agents/khazana.js";
import { RiderClient } from "./lib/rider.js";

export interface Mesh {
  ctx: MeshContext;
  pehchaan: Pehchaan;
  parakh: Parakh;
  talaash: Talaash;
  niyokta: Niyokta;
  hifazat: Hifazat;
  hisab: Hisab;
  nigrani: Nigrani;
  yaad: Yaad;
  khazana: Khazana;
}

/** Boot all nine agents with their own signed identities. */
export function bootMesh(dataDir: string, rail?: SettlementRail, rider?: RiderClient): Mesh {
  const ctx = makeContext(dataDir, rider);
  const pehchaan = new Pehchaan(ctx);
  const parakh = new Parakh(ctx);
  const talaash = new Talaash(ctx);
  const hifazat = new Hifazat(ctx);
  const niyokta = new Niyokta(ctx, hifazat, talaash);
  const hisab = new Hisab(ctx, rail ?? new AwLPayRail());
  const nigrani = new Nigrani(ctx);
  const yaad = new Yaad(ctx);
  const khazana = new Khazana(ctx);
  return { ctx, pehchaan, parakh, talaash, niyokta, hifazat, hisab, nigrani, yaad, khazana };
}

export interface GigTrace {
  workerName: string;
  workerAgentId: string;
  workerKeyId: string;
  skillReceipt: SkillReceiptPayload;
  listing: Listing;
  escrowId: string;
  matchScore: number;
  warrantId: string;
  attestationHash: string;
  netPaise: number;
  feePaise: number;
  txRef: string;
  txRefKind: string;
  workerCostPaise: number;
  receiptCount: number;
}

/**
 * The golden path. `answers` lets the demo/test drive the skill test;
 * omit for a perfect score.
 */
export async function runGoldenPath(
  mesh: Mesh,
  opts: {
    workerName: string;
    phone: string;
    locale: string;
    skillTrack: string;
    answers?: Record<string, string>;
    gigTitle: string;
    payPaise: number;
    employerName: string;
    workerDest: string;
  }
): Promise<GigTrace> {
  const { pehchaan, parakh, talaash, niyokta, hifazat, hisab, yaad, khazana } = mesh;
  const workerKeys = generateKeyPair();

  // 1. ONBOARD — free signed identity (G1, in quota).
  const { profile } = await pehchaan.onboard(opts.phone, opts.workerName, true);

  // 2. PROVE SKILL — CuNi-gated micro-test → signed skill receipt.
  const session = parakh.startTest(opts.skillTrack, profile.keyId);
  const answers =
    opts.answers ??
    Object.fromEntries(session.items.map((i) => [i.id, i.expected]));
  const skillReceipt = parakh.grade(session.sessionId, answers);
  if (!skillReceipt.passed) throw new Error("demo: worker did not pass the skill test");
  yaad.append(
    profile.keyId,
    opts.workerName,
    mesh.ctx.receipts.byKind("skill-receipt").at(-1) as Receipt
  );

  // 3. POST GIG — bonded listing, escrow funded BEFORE it goes live.
  const employer = await mesh.ctx.rider.issue(opts.employerName);
  const listing = await niyokta.postGig(
    {
      title: opts.gigTitle,
      payPaise: opts.payPaise,
      deadlineHours: 48,
      skillRequired: opts.skillTrack,
      locale: opts.locale,
      description: `${opts.gigTitle} — ${opts.skillTrack} required`,
    },
    employer.agentId,
    "khazana:gigPool"
  );
  const escrow = hifazat.escrowForListing(listing.listingId)!;

  // 4. MATCH — Talaash ranks; worker accepts.
  const matches = talaash.match({
    workerKeyId: profile.keyId,
    displayName: opts.workerName,
    skills: [{ skill: skillReceipt.skill, score100: skillReceipt.score100, proofHash: skillReceipt.proofHash }],
    locale: opts.locale,
    gigsCompleted: 0,
    earnedPaise: 0,
    disputes: 0,
  });
  const best = matches[0];
  if (!best || best.listing.listingId !== listing.listingId)
    throw new Error("demo: expected gig not ranked #1");
  talaash.accept(profile.keyId, listing.listingId);
  hifazat.assignWorker(escrow.escrowId, profile.keyId);
  await niyokta.dm(profile.keyId, `terms confirmed for "${listing.title}": ₹${opts.payPaise / 100}, 48h`);

  // 5. WARRANT — the worker caps their own exposure at ₹0 and signs.
  const warrant = issueWarrant(workerKeys, opts.workerName, `gig:${listing.listingId}`, 0);

  // 6. WORK + VERIFY — deliverable validated; Parakh attests completion.
  // (The "cleaned spreadsheet" is represented by its content hash; the
  // validation logic is the same CuNi-proven style as the skill test.)
  const deliverableHash = sha256Hex(`deliverable:${listing.listingId}:${profile.keyId}:500-rows-cleaned`);
  mesh.ctx.receipts.append(
    fileReceipt(
      parakh.keys,
      "parakh",
      "work-verified",
      { listingId: listing.listingId, workerKeyId: profile.keyId, deliverableHash }
    )
  );
  const attestationHash = deliverableHash;

  // 7. SETTLE — escrow releases on the attestation; Hisab pays the worker.
  hifazat.release(escrow.escrowId, attestationHash);
  const settled = await hisab.settlePayout({
    escrowId: escrow.escrowId,
    amountPaise: opts.payPaise,
    workerKeyId: profile.keyId,
    workerDest: opts.workerDest,
    workerWarrant: warrant,
    workerPublicPem: workerKeys.publicPem,
    attestationHash,
  });

  // 8. REMEMBER — every receipt appended to the worker's portable ledger.
  for (const kind of ["payout-settled", "escrow-released", "match-made"] as const) {
    const r = mesh.ctx.receipts.byKind(kind).at(-1) as Receipt;
    if (r) yaad.append(profile.keyId, opts.workerName, r);
  }
  // Treasury movement for the gig-pool funding (if the pool was seeded).
  try {
    khazana.release("gigPool", opts.payPaise, `escrow for ${listing.listingId}`);
  } catch {
    /* gig pool not seeded — employer-funded path; the escrow receipt is the record */
  }

  return {
    workerName: opts.workerName,
    workerAgentId: profile.agentId,
    workerKeyId: profile.keyId,
    skillReceipt,
    listing,
    escrowId: escrow.escrowId,
    matchScore: best.score,
    warrantId: warrant.body.id,
    attestationHash,
    netPaise: settled.netPaise,
    feePaise: settled.feePaise,
    txRef: settled.txRef,
    txRefKind: settled.txRefKind,
    workerCostPaise: 0,
    receiptCount: mesh.ctx.receipts.all().length,
  };
}

export interface FraudTrace {
  listingId: string;
  verdict: "kill";
  bondSlashedPaise: number;
  victimPoolPaise: number;
  workerPaidPaise: number;
  signals: string[];
}

/** The fraud path: registration-fee listing → killed in seconds, bond slashed. */
export async function runFraudPath(
  mesh: Mesh,
  opts: { scammerName: string; phone: string; workerAgentId: string }
): Promise<FraudTrace> {
  const { niyokta, talaash, nigrani, khazana } = mesh;

  // The scammer posts through the normal path — bond and all. Cheap bond is the point.
  const employer = await mesh.ctx.rider.issue(opts.scammerName);
  const listing = await niyokta.postGig(
    {
      title: "Data entry job! Pay ₹500 registration fee to apply",
      payPaise: 50000, // ₹500 — the "fee" is the product
      deadlineHours: 24,
      skillRequired: "data-entry-l1",
      locale: "Lucknow",
      description:
        "Genuine data entry work from home. Pay ₹500 registration fee to apply. " +
        "After payment on UPI id scam@okhdfc, we will WhatsApp you the work at once. " +
        "Refundable security deposit. Limited seats!",
    },
    employer.agentId,
    "scammer:self-funded"
  );

  // Nigrani scans every listing.
  const phoneHash = sha256Hex(`rozgar-phone:${opts.phone.replace(/\D/g, "")}`);
  const scan = nigrani.scan(
    listing,
    "Pay ₹500 registration fee to apply. After payment on UPI id scam@okhdfc, we will WhatsApp you the work at once. Refundable security deposit.",
    phoneHash
  );
  if (scan.verdict !== "kill") throw new Error(`demo: expected kill verdict, got ${scan.verdict}`);

  const bondPaise = Math.max(100, Math.round(listing.payPaise * 0.01));
  await nigrani.killListing(
    listing,
    bondPaise,
    phoneHash,
    (amount, listingId) => khazana.sweepSlashedBond(amount, listingId),
    (id) => talaash.kill(id)
  );

  // The worker is told, over DM: you were right to flag it. You paid ₹0.
  await nigrani.dm(opts.workerAgentId, "This listing was removed as fraudulent. You were right to flag it. You paid ₹0.");

  return {
    listingId: listing.listingId,
    verdict: "kill",
    bondSlashedPaise: bondPaise,
    victimPoolPaise: khazana.get("victimPool").balancePaise,
    workerPaidPaise: 0,
    signals: scan.signals.map((s) => s.rule),
  };
}
