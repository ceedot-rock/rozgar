// SPDX-License-Identifier: Apache-2.0
// scoring-b.ts — CuNi scoring implementation B (functional style).
//
// Same contract as scoring-a.ts. Byte-identical output or the run is refused.
import { ScoreResult, TestItem } from "./scoring-a.js";

const norm = (s: string): string => s.trim().toLowerCase();

export function scoreTestB(items: TestItem[], answers: Record<string, string>): ScoreResult {
  const perItem = items.map((item) => {
    const given = norm(answers[item.id] ?? "");
    const ok = given !== "" && given === norm(item.expected);
    return { id: item.id, ok };
  });
  const correct = perItem.reduce((n, p) => n + (p.ok ? 1 : 0), 0);
  const total = items.length;
  const score100 = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score100, perItem };
}
