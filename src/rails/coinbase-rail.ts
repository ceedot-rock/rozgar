// SPDX-License-Identifier: Apache-2.0
// coinbase-rail.ts — the OPTIONAL rail adapter (§3.2).
//
// Implemented against the Coinbase for Agents capability set (x402 payments,
// spot trading, scoped portfolios). It is OFF unless the operator provides a
// CDP API key (COINBASE_CDP_KEY). It never gates the demo or any core flow.
//
// Tested against mocks only — the suite injects a fake MCP transport so the
// adapter's exactness (quote → settle → receipt, replay-safe ids) is proven
// without touching Coinbase. We claim exactly this, nothing more.
import { newId } from "../lib/crypto.js";
import { Quote, SettledReceipt, SettlementRail } from "./settlement-rail.js";

/** Minimal surface of the Coinbase for Agents MCP we depend on. */
export interface CoinbaseMcp {
  /** x402-style quote for a payment in USDC; returns a payment id. */
  x402Quote(args: { amountUsdc: number; dest: string }): Promise<{ paymentId: string; feeUsdc: number }>;
  /** Execute the quoted payment. */
  x402Pay(args: { paymentId: string }): Promise<{ txHash: string }>;
}

export function coinbaseEnabled(): boolean {
  return Boolean(process.env["COINBASE_CDP_KEY"]);
}

export class CoinbaseRail implements SettlementRail {
  readonly name = "coinbase" as const;
  private mcp: CoinbaseMcp;
  private cdpKeyPresent: boolean;

  constructor(mcp: CoinbaseMcp, cdpKeyPresent = coinbaseEnabled()) {
    this.mcp = mcp;
    this.cdpKeyPresent = cdpKeyPresent;
  }

  enabled(): boolean {
    return this.cdpKeyPresent;
  }

  private assertEnabled(): void {
    if (!this.enabled())
      throw new Error(
        "coinbase rail is disabled: set COINBASE_CDP_KEY to activate (optional; the demo never needs it)"
      );
  }

  async quote(amountPaise: number, dest: string): Promise<Quote> {
    this.assertEnabled();
    if (amountPaise <= 0) throw new Error("coinbase: amount must be positive");
    const amountUsdc = amountPaise / 100 / 88.5; // pilot FX, documented
    const { paymentId, feeUsdc } = await this.mcp.x402Quote({ amountUsdc, dest });
    const feePaise = Math.round(feeUsdc * 88.5 * 100);
    return {
      rail: "coinbase",
      amountPaise,
      feePaise,
      netPaise: amountPaise - feePaise,
      dest,
      quotedAt: new Date().toISOString(),
      mode: "live",
    } as Quote & { paymentId: string };
  }

  async settle(q: Quote): Promise<SettledReceipt> {
    this.assertEnabled();
    const paymentId = (q as Quote & { paymentId?: string }).paymentId;
    if (!paymentId) throw new Error("coinbase: quote missing paymentId (replay refused)");
    const { txHash } = await this.mcp.x402Pay({ paymentId });
    return {
      rail: "coinbase",
      quoteId: newId("q"),
      amountPaise: q.amountPaise,
      feePaise: q.feePaise,
      netPaise: q.netPaise,
      dest: q.dest,
      txRef: txHash,
      txRefKind: "onchain",
      settledAt: new Date().toISOString(),
    };
  }
}
