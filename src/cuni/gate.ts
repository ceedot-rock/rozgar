// SPDX-License-Identifier: Apache-2.0
// gate.ts — the G5 exactness gate for Parakh.
//
// Before a skill test runs, the scoring program is proven: both
// implementations execute over the session's item set and their serialized
// outputs must be byte-identical. Any divergence → refuse the run.
// This is what makes a skill receipt a proof, not a claim.
import { sha256Hex } from "../lib/crypto.js";
import { TestItem, scoreTestA } from "./scoring-a.js";
import { scoreTestB } from "./scoring-b.js";

function canonical(v: unknown): string {
  return JSON.stringify(v);
}

/**
 * Prove the scoring logic exact over a representative input corpus, then
 * score the real answers. Returns { score, proofHash }.
 * Throws when the implementations disagree — the run is refused.
 */
export function provenScore(
  items: TestItem[],
  answers: Record<string, string>
): { correct: number; total: number; score100: number; proofHash: string } {
  // 1. Exactness corpus: empty, all-correct, all-wrong, mixed, whitespace/case variants.
  const corpus: Array<Record<string, string>> = [
    {},
    Object.fromEntries(items.map((i) => [i.id, i.expected])),
    Object.fromEntries(items.map((i) => [i.id, "wrong answer"])),
    Object.fromEntries(items.map((i, n) => [i.id, n % 2 === 0 ? i.expected : "nope"])),
    Object.fromEntries(items.map((i) => [i.id, `  ${i.expected.toUpperCase()}  `])),
  ];
  for (const sample of corpus) {
    const a = canonical(scoreTestA(items, sample));
    const b = canonical(scoreTestB(items, sample));
    if (a !== b) {
      throw new Error(
        "G5 exactness gate FAILED: scoring implementations diverge — run refused"
      );
    }
  }
  // 2. Score the real answers with both, require agreement again.
  const ra = scoreTestA(items, answers);
  const rb = scoreTestB(items, answers);
  if (canonical(ra) !== canonical(rb)) {
    throw new Error("G5 exactness gate FAILED on live input — run refused");
  }
  // 3. The proof hash binds the item set, the answers, and the score.
  const proofHash = sha256Hex(
    canonical({ items: items.map((i) => i.id), answers, score: ra.score100 })
  );
  return { correct: ra.correct, total: ra.total, score100: ra.score100, proofHash };
}
