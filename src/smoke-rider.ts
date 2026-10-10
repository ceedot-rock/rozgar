// SPDX-License-Identifier: Apache-2.0
// smoke-rider.ts — live smoke test of the Rider stack.
// Hits agentrider.fly.dev the way the mesh does: health (public),
// rider verify (free, no auth). Issue/DM/tolls need an API key and are
// reported, not faked.
// Usage: npm run smoke:rider
import { RIDER_API_URL, LiveRider } from "./lib/rider.js";

async function main(): Promise<void> {
  console.log(`Rider API: ${RIDER_API_URL}\n`);
  const results: Array<[string, boolean, string]> = [];

  try {
    const res = await fetch(`${RIDER_API_URL}/api/health`);
    const body = (await res.json()) as { status?: string; ready?: Record<string, boolean> };
    const ok = res.ok && body.status === "ok";
    results.push(["GET /api/health", ok, ok ? `ready=${JSON.stringify(body.ready)}` : `http ${res.status}`]);
  } catch (e) {
    results.push(["GET /api/health", false, String(e)]);
  }

  // verify is the free, no-auth call the mesh uses for every counterparty.
  try {
    const rider = new LiveRider();
    const local = await rider.issue("smoke-test");
    const v = await rider.verify(local.rider);
    results.push(["POST /api/rider/verify (local rider)", v.valid, `via=${v.via}`]);
  } catch (e) {
    results.push(["POST /api/rider/verify", false, String(e)]);
  }

  // malformed token must be rejected — the negative case matters.
  try {
    const res = await fetch(`${RIDER_API_URL}/api/rider/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-rider" }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    const rejected = body["valid"] !== true;
    results.push(["verify rejects malformed token", rejected, JSON.stringify(body).slice(0, 120)]);
  } catch (e) {
    results.push(["verify rejects malformed token", false, String(e)]);
  }

  let allOk = true;
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
    if (!ok) allOk = false;
  }
  console.log(`\nRIDER_API_KEY ${process.env["RIDER_API_KEY"] ? "set — live issue/DM path active" : "not set — mesh runs local signed mode (demo default)"}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
