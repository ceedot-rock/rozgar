// CuNi exactness gate: byte-identical scoring or the run is refused.
import { describe, it, expect } from "vitest";
import { scoreTestA, TestItem } from "../src/cuni/scoring-a.js";
import { scoreTestB } from "../src/cuni/scoring-b.js";
import { provenScore } from "../src/cuni/gate.js";
import { sha256Hex } from "../src/lib/crypto.js";

const ITEMS: TestItem[] = [
  { id: "t1", prompt: "p1", expected: "yes" },
  { id: "t2", prompt: "p2", expected: "42" },
];

describe("G5 exactness gate", () => {
  it("both implementations agree byte-identically on a corpus", () => {
    const corpora: Array<Record<string, string>> = [
      {},
      { t1: "yes", t2: "42" },
      { t1: "no", t2: "0" },
      { t1: "  YES ", t2: "42" },
      { t1: "", t2: "42" },
    ];
    for (const answers of corpora) {
      expect(JSON.stringify(scoreTestA(ITEMS, answers))).toBe(
        JSON.stringify(scoreTestB(ITEMS, answers))
      );
    }
  });

  it("provenScore returns a proof hash binding items + answers + score", () => {
    const r = provenScore(ITEMS, { t1: "yes", t2: "42" });
    expect(r.score100).toBe(100);
    expect(r.proofHash).toHaveLength(64);
    // Same inputs → same proof. Different answers → different proof.
    const r2 = provenScore(ITEMS, { t1: "yes", t2: "42" });
    const r3 = provenScore(ITEMS, { t1: "no", t2: "42" });
    expect(r2.proofHash).toBe(r.proofHash);
    expect(r3.proofHash).not.toBe(r.proofHash);
    expect(sha256Hex("x")).toHaveLength(64);
  });

  it("whitespace/case variants score the same in both implementations", () => {
    const a = provenScore(ITEMS, { t1: " Yes ", t2: "42" });
    const b = provenScore(ITEMS, { t1: "YES", t2: " 42 " });
    expect(a.score100).toBe(b.score100);
  });
});
