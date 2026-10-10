// SPDX-License-Identifier: Apache-2.0
// server.ts — the Rozgar demo web app + public /mesh dashboard.
// Zero credentials required. Binds PORT (default 8080).
//
// On boot it runs the full mesh loop once (golden path + fraud path) so
// every page a judge opens shows real, signed receipts — no staging.
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { bootMesh, runGoldenPath, runFraudPath, GigTrace, FraudTrace } from "./mesh.js";
import { coinbaseEnabled } from "./rails/coinbase-rail.js";
import { createRiderClient } from "./lib/rider.js";
import { landingHtml, demoHtml, meshHtml, workerHtml, notFoundHtml } from "./ui.js";

const PORT = Number(process.env["PORT"] ?? 8080);
const DATA_DIR = process.env["DATA_DIR"] ?? join(process.cwd(), "data");

interface DemoState {
  trace: GigTrace;
  fraud: FraudTrace;
}

async function bootDemo(): Promise<{ mesh: ReturnType<typeof bootMesh>; state: DemoState }> {
  mkdirSync(DATA_DIR, { recursive: true });
  const rider = createRiderClient();
  const mesh = bootMesh(DATA_DIR, undefined, rider);

  // Owner-style seed of the gig pool for the demo (labeled; the real pool
  // needs the owner's explicit approval per the standing money rule).
  mesh.khazana.fund("gigPool", 1_000_000, 1_000_000, "demo-seed (fictional funds)");

  const trace = await runGoldenPath(mesh, {
    workerName: "Aisha (demo persona)",
    phone: "+91 98765 43210",
    locale: "Lucknow",
    skillTrack: "data-entry-l1",
    gigTitle: "Clean a 500-row spreadsheet",
    payPaise: 200000,
    employerName: "Jaipur Stationery Co. (demo)",
    workerDest: "aisha@tron-demo",
  });
  const fraud = await runFraudPath(mesh, {
    scammerName: "QuickCash Recruiter (demo scammer)",
    phone: "+91 90000 00001",
    workerAgentId: trace.workerAgentId,
  });
  return { mesh, state: { trace, fraud } };
}

function send(res: ServerResponse, status: number, html: string, contentType = "text/html; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(html);
}

async function main(): Promise<void> {
  const { mesh, state } = await bootDemo();
  const rider = mesh.ctx.rider;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/") {
        const counts = mesh.ctx.receipts.countByKind();
        counts["total"] = mesh.ctx.receipts.all().length;
        return send(
          res,
          200,
          landingHtml({
            railMode: "pilot-ledger · 0.5% flat",
            coinbaseOn: coinbaseEnabled(),
            riderMode: rider.mode === "live" ? "live (agentrider.fly.dev)" : "local signed mode",
            counters: counts,
          })
        );
      }
      if (url.pathname === "/demo") {
        return send(res, 200, demoHtml(state.trace, state.fraud, state.trace.workerKeyId));
      }
      if (url.pathname === "/mesh") {
        const counts = mesh.ctx.receipts.countByKind();
        counts["total"] = mesh.ctx.receipts.all().length;
        return send(
          res,
          200,
          meshHtml(counts, mesh.ctx.receipts.all(), mesh.khazana.snapshot())
        );
      }
      if (url.pathname === "/healthz") {
        return send(res, 200, JSON.stringify({ ok: true, receipts: mesh.ctx.receipts.all().length }), "application/json");
      }
      if (url.pathname === "/api/demo") {
        return send(res, 200, JSON.stringify({ trace: state.trace, fraud: state.fraud }, null, 2), "application/json");
      }
      const m = url.pathname.match(/^\/worker\/([A-Za-z0-9_]+)$/);
      if (m) {
        const page = mesh.yaad.publicPage(m[1]);
        if (!page) return send(res, 404, notFoundHtml());
        const identity = mesh.pehchaan.profileOf(m[1]);
        return send(
          res,
          200,
          workerHtml({
            displayName: page.displayName,
            workerKeyId: page.workerKeyId,
            gigs: page.gigsCompleted,
            earnedPaise: page.earnedPaise,
            disputes: page.disputes,
            skills: page.skillReceipts,
            verified: page.verified,
            identityCard: JSON.stringify({
              rozgarIdentity: true,
              agentId: identity?.agentId,
              keyId: page.workerKeyId,
              displayName: page.displayName,
            }),
          })
        );
      }
      return send(res, 404, notFoundHtml());
    } catch (e) {
      return send(res, 500, `<h1>error</h1><pre>${String(e).slice(0, 500)}</pre>`);
    }
  });

  server.listen(PORT, () => {
    console.log(`rozgar demo live on :${PORT} — ${mesh.ctx.receipts.all().length} receipts filed at boot`);
  });
}

main().catch((e) => {
  console.error("server failed to boot:", e);
  process.exit(1);
});
