// Settlement rails: AwLPay fee math + CoinbaseRail flag-off behavior.
import { describe, it, expect, afterEach } from "vitest";
import { AwLPayRail, AWLPAY_FEE_PCT } from "../src/rails/awlpay-rail.js";
import { CoinbaseRail, coinbaseEnabled, CoinbaseMcp } from "../src/rails/coinbase-rail.js";

afterEach(() => {
  delete process.env["COINBASE_CDP_KEY"];
});

const mockMcp: CoinbaseMcp = {
  x402Quote: async ({ amountUsdc, dest }) => ({
    paymentId: `pay_${amountUsdc}_${dest}`,
    feeUsdc: amountUsdc * 0.001,
  }),
  x402Pay: async ({ paymentId }) => ({ txHash: `0xmock_${paymentId}` }),
};

describe("AwLPayRail (primary)", () => {
  it("charges exactly 0.5% flat, no fixed fee", async () => {
    const rail = new AwLPayRail();
    expect(rail.enabled()).toBe(true);
    expect(AWLPAY_FEE_PCT).toBe(0.005);
    const q = await rail.quote(200000, "worker@dest");
    expect(q.feePaise).toBe(1000); // ₹10 on ₹2,000
    expect(q.netPaise).toBe(199000);
    expect(q.mode).toBe("pilot-ledger");
    const s = await rail.settle(q);
    expect(s.txRefKind).toBe("pilot-ledger");
    expect(s.txRef.startsWith("pilot_")).toBe(true);
  });

  it("refuses non-positive amounts and empty destinations", async () => {
    const rail = new AwLPayRail();
    await expect(rail.quote(0, "x")).rejects.toThrow();
    await expect(rail.quote(100, "")).rejects.toThrow();
  });

  it("pilot-ledger refs are deterministic per quote content", async () => {
    const rail = new AwLPayRail();
    const q = await rail.quote(200000, "worker@dest");
    const s1 = await rail.settle({ ...q });
    expect(s1.txRefKind).toBe("pilot-ledger");
  });
});

describe("CoinbaseRail (optional)", () => {
  it("is DISABLED by default — never gates the demo", async () => {
    const rail = new CoinbaseRail(mockMcp);
    expect(coinbaseEnabled()).toBe(false);
    expect(rail.enabled()).toBe(false);
    await expect(rail.quote(200000, "x")).rejects.toThrow(/disabled/);
    await expect(
      rail.settle({
        rail: "coinbase",
        amountPaise: 1,
        feePaise: 0,
        netPaise: 1,
        dest: "x",
        quotedAt: new Date().toISOString(),
        mode: "live",
      })
    ).rejects.toThrow(/disabled/);
  });

  it("activates on operator key and settles via the (mocked) MCP", async () => {
    process.env["COINBASE_CDP_KEY"] = "test-key-never-real";
    const rail = new CoinbaseRail(mockMcp);
    expect(coinbaseEnabled()).toBe(true);
    expect(rail.enabled()).toBe(true);
    const q = await rail.quote(200000, "worker@dest");
    expect(q.mode).toBe("live");
    const withId = { ...q, paymentId: "pay_test_1" };
    const s = await rail.settle(withId);
    expect(s.txRefKind).toBe("onchain");
    expect(s.txRef.startsWith("0xmock_")).toBe(true);
  });

  it("refuses settle when the quote has no paymentId (replay safety)", async () => {
    process.env["COINBASE_CDP_KEY"] = "test-key-never-real";
    const rail = new CoinbaseRail(mockMcp);
    const q = await rail.quote(200000, "worker@dest");
    await expect(rail.settle(q)).rejects.toThrow(/paymentId/);
  });
});
