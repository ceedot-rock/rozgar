// SPDX-License-Identifier: Apache-2.0
// tolls.ts — the Rider toll gates G1–G7 as mesh-local accounting.
// In production these map 1:1 to Agent Rider's metered gates; the mesh keeps
// its own ledger so every charge is receipted and auditable.
export interface TollGate {
  id: "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7";
  name: string;
  /** flat USD charge, when set */
  flatUsd?: number;
  /** percentage of value, when set */
  pct?: number;
  freeQuotaPerMonth?: number;
  unit: string;
}

export const TOLL_GATES: Record<TollGate["id"], TollGate> = {
  G1: { id: "G1", name: "Identity", flatUsd: 0.005, freeQuotaPerMonth: 100, unit: "query" },
  G2: { id: "G2", name: "Discovery", flatUsd: 0.02, unit: "lookup" },
  G3: { id: "G3", name: "Escrow", pct: 0.01, unit: "of value" },
  G4: { id: "G4", name: "Grants", flatUsd: 0.01, unit: "issue" },
  G5: { id: "G5", name: "CuNi verification", flatUsd: 0.1, unit: "check" },
  G6: { id: "G6", name: "Bonds", pct: 0.01, unit: "of bond" },
  G7: { id: "G7", name: "Memory", flatUsd: 0.02, unit: "hosted transfer" },
};

export interface TollCharge {
  gate: TollGate["id"];
  agent: string;
  /** USD, rounded to 1/10000 cent for accounting */
  usd: number;
  /** INR paise, rounded */
  paise: number;
  basis: string;
  ts: string;
}

/** Fixed FX for pilot accounting (documented on the dashboard). */
export const USD_INR = 88.5;

export function chargeToll(
  gateId: TollGate["id"],
  agent: string,
  basisValueUsd: number,
  basis: string
): TollCharge {
  const gate = TOLL_GATES[gateId];
  let usd = gate.flatUsd ?? 0;
  if (gate.pct !== undefined) usd += basisValueUsd * gate.pct;
  usd = Math.round(usd * 10000) / 10000;
  return {
    gate: gateId,
    agent,
    usd,
    paise: Math.round(usd * USD_INR * 100),
    basis,
    ts: new Date().toISOString(),
  };
}

/** Mesh toll budget per gig — the pilot's cost envelope, enforced in code. */
export function gigTollEnvelope(): TollCharge[] {
  return [
    chargeToll("G1", "pehchaan", 0, "identity issue (within free quota)"),
    chargeToll("G5", "parakh", 0, "skill scoring verification"),
    chargeToll("G2", "talaash", 0, "discovery lookup"),
    chargeToll("G4", "worker", 0, "warrant issue"),
  ];
}
