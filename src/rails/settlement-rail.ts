// SPDX-License-Identifier: Apache-2.0
// settlement-rail.ts — the SettlementRail interface (§3.2).
//
// quote → settle → receipt. Two adapters ship:
//  - AwLPayRail (primary, always on): zero credentials.
//  - CoinbaseRail (optional, off by default): activates only on an
//    operator-provided CDP key, never gates any core flow.
export interface Quote {
  rail: string;
  amountPaise: number;
  feePaise: number;
  netPaise: number;
  dest: string;
  quotedAt: string;
  /** How the quote was produced — always labeled honestly. */
  mode: "live" | "pilot-ledger";
}

export interface SettledReceipt {
  rail: string;
  quoteId: string;
  amountPaise: number;
  feePaise: number;
  netPaise: number;
  dest: string;
  /** Transaction hash when the rail settles on-chain, otherwise a
   *  deterministic pilot-ledger reference. Never faked as on-chain. */
  txRef: string;
  txRefKind: "onchain" | "pilot-ledger";
  settledAt: string;
}

export interface SettlementRail {
  readonly name: "awlpay" | "coinbase";
  enabled(): boolean;
  quote(amountPaise: number, dest: string): Promise<Quote>;
  settle(q: Quote): Promise<SettledReceipt>;
}
