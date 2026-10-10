// Fraud-path test: the scammer loses, the worker pays ₹0.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { bootMesh, runFraudPath, runGoldenPath } from "../src/mesh.js";

function freshMesh() {
  return bootMesh(mkdtempSync(join(tmpdir(), "rozgar-test-")));
}

describe("fraud path", () => {
  it("kills the registration-fee listing and slashes the bond", async () => {
    const mesh = freshMesh();
    // A real worker exists so the DM has somewhere to go.
    const trace = await runGoldenPath(mesh, {
      workerName: "Test Worker",
      phone: "+91 90000 33333",
      locale: "Lucknow",
      skillTrack: "data-entry-l1",
      gigTitle: "Test gig",
      payPaise: 200000,
      employerName: "Test Employer",
      workerDest: "worker@test",
    });

    const fraud = await runFraudPath(mesh, {
      scammerName: "Scammer",
      phone: "+91 90000 44444",
      workerAgentId: trace.workerAgentId,
    });

    expect(fraud.verdict).toBe("kill");
    expect(fraud.signals).toContain("registration-fee-language");
    expect(fraud.signals).toContain("off-platform-payment");
    // ₹500 gig → 1% bond = ₹5 = 500 paise, slashed into the victim pool.
    expect(fraud.bondSlashedPaise).toBe(500);
    expect(fraud.victimPoolPaise).toBe(500);
    expect(fraud.workerPaidPaise).toBe(0);

    const kinds = mesh.ctx.receipts.countByKind();
    expect(kinds["fraud-killed"]).toBe(1);

    // The listing is dead — it no longer appears on the board.
    expect(mesh.talaash.openListings().some((l) => l.listingId === fraud.listingId)).toBe(false);
  });

  it("a clean listing scans clean", async () => {
    const mesh = freshMesh();
    const employer = await mesh.ctx.rider.issue("Honest Employer");
    const listing = await mesh.niyokta.postGig(
      {
        title: "Translate 10 pages Hindi to English",
        payPaise: 150000,
        deadlineHours: 72,
        skillRequired: "hindi-typing-l1",
        locale: "Lucknow",
        description: "Translate 10 pages of a school booklet from Hindi to English. Payment on verified delivery via escrow.",
      },
      employer.agentId,
      "test"
    );
    const scan = mesh.nigrani.scan(listing, "Translate 10 pages of a school booklet from Hindi to English.");
    expect(scan.verdict).toBe("clean");
    expect(scan.score).toBeLessThan(0.3);
  });
});
