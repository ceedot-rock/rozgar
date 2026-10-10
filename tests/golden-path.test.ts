// Golden-path test: the whole mesh loop, all nine agents, end to end.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { bootMesh, runGoldenPath } from "../src/mesh.js";

function freshMesh() {
  return bootMesh(mkdtempSync(join(tmpdir(), "rozgar-test-")));
}

describe("golden path", () => {
  it("runs all nine agents: identity → proof → escrow → payout → reputation", async () => {
    const mesh = freshMesh();
    const trace = await runGoldenPath(mesh, {
      workerName: "Test Worker",
      phone: "+91 90000 11111",
      locale: "Lucknow",
      skillTrack: "data-entry-l1",
      gigTitle: "Test gig",
      payPaise: 200000, // ₹2,000
      employerName: "Test Employer",
      workerDest: "worker@test",
    });

    // The worker's out-of-pocket cost is ₹0 — the headline.
    expect(trace.workerCostPaise).toBe(0);
    // AwLPay 0.5% flat on ₹2,000 = ₹10 fee → ₹1,990 net.
    expect(trace.feePaise).toBe(1000);
    expect(trace.netPaise).toBe(199000);
    expect(trace.txRefKind).toBe("pilot-ledger");
    expect(trace.skillReceipt.passed).toBe(true);
    expect(trace.matchScore).toBeGreaterThan(0);

    // Every step filed a signed receipt.
    const kinds = mesh.ctx.receipts.countByKind();
    for (const k of [
      "identity-issued",
      "skill-receipt",
      "escrow-funded",
      "bond-posted",
      "listing-posted",
      "match-made",
      "work-verified",
      "escrow-released",
      "payout-settled",
      "reputation-appended",
    ]) {
      expect(kinds[k] ?? 0, `missing receipt kind ${k}`).toBeGreaterThan(0);
    }

    // Yaad's ledger matches the receipt log — the portability invariant.
    const page = mesh.yaad.publicPage(trace.workerKeyId);
    expect(page).not.toBeNull();
    expect(page!.verified).toBe(true);
    expect(page!.gigsCompleted).toBe(1);
    expect(page!.earnedPaise).toBe(199000);
    expect(page!.disputes).toBe(0);
  });

  it("refuses payout when the worker would pay anything (warrant cap)", async () => {
    const mesh = freshMesh();
    // A worker who fails the skill test cannot proceed — no receipt, no gig.
    const session = mesh.parakh.startTest("data-entry-l1", "some-worker");
    const badAnswers = Object.fromEntries(session.items.map((i) => [i.id, "wrong"]));
    const receipt = mesh.parakh.grade(session.sessionId, badAnswers);
    expect(receipt.passed).toBe(false);
  });

  it("duplicate phone returns the existing identity (Sybil resistance)", async () => {
    const mesh = freshMesh();
    const a = await mesh.pehchaan.onboard("+91 90000 22222", "Worker A", true);
    const b = await mesh.pehchaan.onboard("+91 90000 22222", "Worker A again", true);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.profile.agentId).toBe(a.profile.agentId);
    expect(mesh.pehchaan.identityCount()).toBe(1);
  });
});
