// SPDX-License-Identifier: Apache-2.0
// scoring-a.ts — CuNi scoring implementation A (iterative style).
//
// The contract: score(items, answers) -> { correct, total, score100 }.
// Implementation B (scoring-b.ts) must produce byte-identical output for
// every input, or Parakh REFUSES to run the test. This is the G5 exactness
// gate in miniature: proven exact before it runs.
export interface TestItem {
  id: string;
  prompt: string;
  expected: string;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score100: number;
  perItem: Array<{ id: string; ok: boolean }>;
}

export function scoreTestA(items: TestItem[], answers: Record<string, string>): ScoreResult {
  const perItem: Array<{ id: string; ok: boolean }> = [];
  let correct = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const given = (answers[item.id] ?? "").trim().toLowerCase();
    const want = item.expected.trim().toLowerCase();
    const ok = given.length > 0 && given === want;
    if (ok) correct++;
    perItem.push({ id: item.id, ok });
  }
  const total = items.length;
  const score100 = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, total, score100, perItem };
}
