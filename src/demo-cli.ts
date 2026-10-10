// SPDX-License-Identifier: Apache-2.0
// demo-cli.ts — the full Rozgar loop in a terminal. Zero credentials.
// Usage: npm run demo:cli
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootMesh, runGoldenPath, runFraudPath } from "./mesh.js";

const rs = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "rozgar-demo-"));
  const mesh = bootMesh(dir);

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  ROZGAR — Signed skills. Settled work.                   ║");
  console.log("║  Demo persona: Aisha, 21, Lucknow (fictional)            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Seed the gig pool the way an owner-approved ₹10,000 pool would look.
  mesh.khazana.fund("gigPool", 1_000_000, 1_000_000, "owner:seed-pool-demo");

  const trace = await runGoldenPath(mesh, {
    workerName: "Aisha (demo persona)",
    phone: "+91 98765 43210",
    locale: "Lucknow",
    skillTrack: "data-entry-l1",
    gigTitle: "Clean a 500-row spreadsheet",
    payPaise: 200000,
    employerName: "Jaipur Stationery Co. (demo)",
    workerDest: "aisha@tron-demo",
  });

  console.log("── GOLDEN PATH ──────────────────────────────────────────");
  console.log(`  1. Pehchaan  → signed identity for ${trace.workerName}`);
  console.log(`  2. Parakh    → skill receipt: data-entry-l1 ${trace.skillReceipt.score100}/100, proof ${trace.skillReceipt.proofHash.slice(0, 12)}…`);
  console.log(`  3. Niyokta   → bonded listing "${trace.listing.title}", ₹${trace.listing.payPaise / 100}; escrow locked FIRST`);
  console.log(`  4. Talaash   → matched #1 (score ${trace.matchScore}); warrant caps worker exposure at ₹0`);
  console.log(`  5. Parakh    → deliverable verified, attestation ${trace.attestationHash.slice(0, 12)}…`);
  console.log(`  6. Hifazat   → escrow released on attestation`);
  console.log(`  7. Hisab     → payout ${rs(trace.netPaise)} via AwLPay rail (fee ${rs(trace.feePaise)}), ref ${trace.txRefKind}`);
  console.log(`  8. Yaad      → reputation: 1 gig · ${rs(trace.netPaise)} earned · 0 disputes`);
  console.log(`  Worker out-of-pocket: ${rs(trace.workerCostPaise)}`);
  console.log(`  Receipts filed: ${trace.receiptCount}\n`);

  const fraud = await runFraudPath(mesh, {
    scammerName: "QuickCash Recruiter (demo scammer)",
    phone: "+91 90000 00001",
    workerAgentId: trace.workerAgentId,
  });

  console.log("── FRAUD PATH ───────────────────────────────────────────");
  console.log(`  "Pay ₹500 registration fee" listing → Nigrani verdict: ${fraud.verdict.toUpperCase()}`);
  console.log(`  Signals: ${fraud.signals.join(", ")}`);
  console.log(`  Bond slashed: ${rs(fraud.bondSlashedPaise)} → victim-compensation pool (${rs(fraud.victimPoolPaise)})`);
  console.log(`  Worker paid: ${rs(fraud.workerPaidPaise)} — "You were right to flag it."\n`);

  const counts = mesh.ctx.receipts.countByKind();
  console.log("── RECEIPT LOG ──────────────────────────────────────────");
  for (const [kind, n] of Object.entries(counts).sort()) console.log(`  ${kind}: ${n}`);
  console.log(`\nReceipt log: ${dir}/receipts.jsonl`);
}

main().catch((e) => {
  console.error("demo failed:", e);
  process.exit(1);
});
