// Agent contracts: escrow refusal, treasury caps, receipts, warrants, tolls.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { bootMesh } from "../src/mesh.js";
import { generateKeyPair, signPayload, verifyPayload, seal, openEnvelope } from "../src/lib/crypto.js";
import { fileReceipt, verifyReceipt } from "../src/lib/receipt.js";
import { issueWarrant, checkWarrant } from "../src/lib/warrant.js";
import { chargeToll } from "../src/lib/tolls.js";

function freshMesh() {
  return bootMesh(mkdtempSync(join(tmpdir(), "rozgar-test-")));
}

describe("agent contracts", () => {
  it("Hifazat refuses release without a completion attestation", () => {
    const mesh = freshMesh();
    const e = mesh.hifazat.fund({
      listingId: "gig_x",
      employerAgentId: "emp",
      workerKeyId: "worker",
      amountPaise: 100000,
      funder: "test",
      deadlineHours: 48,
    });
    expect(() => mesh.hifazat.release(e.escrowId, "")).toThrow(/attestation/);
    expect(mesh.hifazat.get(e.escrowId).state).toBe("funded");
  });

  it("Khazana refuses releases above the warrant cap", () => {
    const mesh = freshMesh();
    mesh.khazana.fund("gigPool", 1_000_000, 500_000, "test");
    expect(() => mesh.khazana.release("gigPool", 600_000, "too much")).toThrow(/warrant cap/);
    const p = mesh.khazana.release("gigPool", 400_000, "ok");
    expect(p.balancePaise).toBe(600_000);
  });

  it("receipts are signed; tampering is detected", () => {
    const mesh = freshMesh();
    const keys = generateKeyPair();
    const r = fileReceipt(keys, "test-agent", "dm-sent", { x: 1 });
    expect(verifyReceipt(r, keys.publicPem)).toBe(true);
    const tampered = { ...r, body: { ...r.body, payload: { x: 2 } } };
    expect(verifyReceipt(tampered, keys.publicPem)).toBe(false);
    // envelopes from the wrong key do not open
    const other = generateKeyPair();
    const env = seal(other, { hello: "world" });
    expect(openEnvelope(keys.publicPem, env)).toBeNull();
    expect(verifyPayload(keys.publicPem, { a: 1 }, signPayload(keys.privatePem, { a: 1 }))).toBe(true);
  });

  it("warrant caps are enforced: ₹0 means ₹0", () => {
    const keys = generateKeyPair();
    const w = issueWarrant(keys, "worker", "gig:x", 0);
    expect(checkWarrant(w, keys.publicPem, 0)).toBeNull();
    expect(checkWarrant(w, keys.publicPem, 1)).toMatch(/cap exceeded/);
  });

  it("toll math matches the published gate schedule", () => {
    const g1 = chargeToll("G1", "pehchaan", 0, "t");
    expect(g1.usd).toBe(0.005);
    const g3 = chargeToll("G3", "hifazat", 2000 / 88.5, "escrow ₹2000");
    expect(g3.usd).toBeCloseTo(20 / 88.5, 4); // 1% of ~$22.60 ≈ $0.226
    const g6 = chargeToll("G6", "niyokta", 500 / 88.5, "bond ₹500");
    expect(g6.usd).toBeCloseTo(5 / 88.5, 4);
  });

  it("Niyokta refuses to post a gig with no pay", async () => {
    const mesh = freshMesh();
    await expect(
      mesh.niyokta.postGig(
        { title: "x", payPaise: 0, deadlineHours: 1, skillRequired: "data-entry-l1", locale: "Lucknow", description: "x" },
        "emp",
        "test"
      )
    ).rejects.toThrow(/positive/);
  });

  it("every mesh action leaves a signed receipt with the agent's key", async () => {
    const mesh = freshMesh();
    await mesh.pehchaan.onboard("+91 90000 55555", "Receipt Check", true);
    const receipts = mesh.ctx.receipts.all();
    expect(receipts.length).toBeGreaterThan(0);
    for (const r of receipts) {
      expect(r.body.agentKeyId).toBeTruthy();
      expect(r.sig.length).toBeGreaterThan(10);
    }
  });
});
