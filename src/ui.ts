// SPDX-License-Identifier: Apache-2.0
// ui.ts — server-rendered HTML for the Rozgar demo (mobile-first).
// No build step, no JS framework: a judge's phone renders this fine.
import qrcode from "qrcode-generator";
import { GigTrace, FraudTrace } from "./mesh.js";
import { Receipt } from "./lib/receipt.js";
import { Portfolio } from "./agents/khazana.js";

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0d1117;color:#e6edf3;line-height:1.55;max-width:720px;margin:0 auto;padding:16px}
a{color:#58a6ff}
header.hero{padding:28px 0 18px;border-bottom:1px solid #30363d;margin-bottom:18px}
h1{font-size:1.9rem;letter-spacing:-.02em}
.dev{color:#7ee787;font-weight:600}
.tag{color:#8b949e;font-size:1.05rem;margin-top:6px}
.btn{display:inline-block;background:#1f6feb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin:10px 8px 0 0;border:0;font-size:1rem;cursor:pointer}
.btn.ghost{background:#21262d;border:1px solid #30363d}
.card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px;margin:14px 0}
.stat{font-size:1.6rem;font-weight:700;color:#ffa657}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.kv{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #21262d;font-size:.95rem}
.kv:last-child{border-bottom:0}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem;word-break:break-all;color:#9fb3c8}
.step{border-left:3px solid #1f6feb;padding:8px 0 8px 14px;margin:10px 0}
.step b{color:#7ee787}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.8rem;font-weight:600}
.pill.live{background:#1a472a;color:#7ee787}
.pill.mock{background:#3a2e12;color:#e3b341}
footer{margin:32px 0 12px;padding-top:16px;border-top:1px solid #30363d;color:#8b949e;font-size:.85rem}
small.dim{color:#8b949e}
table{width:100%;border-collapse:collapse;font-size:.85rem}
td,th{padding:6px 4px;border-bottom:1px solid #21262d;text-align:left}
.qr{background:#fff;padding:8px;border-radius:8px;display:inline-block}
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Rozgar</title><style>${CSS}</style></head><body>
${body}
<footer>Rozgar (रोज़गार) · <span class="dev">Signed skills. Settled work.</span><br>
<small class="dim">Demo persona is fictional and labeled as such. Built for the Code for a Billion hackathon (Financial Inclusion track) · Apache-2.0 · <a href="https://github.com/ceedot-rock/rozgar">github.com/ceedot-rock/rozgar</a></small></footer>
</body></html>`;
}

export function landingHtml(opts: {
  railMode: string;
  coinbaseOn: boolean;
  riderMode: string;
  counters: Record<string, number>;
}): string {
  const c = opts.counters;
  return page(
    "Rozgar",
    `<header class="hero">
<h1>Rozgar <span class="dev">रोज़गार</span></h1>
<p class="tag">Signed skills. Settled work. A multi-agent work mesh for India's gig youth.</p>
</header>
<div class="card"><b>The problem, in numbers</b>
<div class="grid" style="margin-top:10px">
<div><div class="stat">93%</div><small class="dim">of Indian job seekers hit recruitment scams (Indeed/Valuvox, 2026)</small></div>
<div><div class="stat">120 lakh</div><small class="dim">gig workers in FY25 — banked, but unable to prove income for credit (Economic Survey 2025-26)</small></div>
<div><div class="stat">59.09 cr</div><small class="dim">Jan Dhan accounts — the account works; the proofs don't exist yet</small></div>
<div><div class="stat">₹0</div><small class="dim">what a Rozgar worker ever pays. Escrow before work. Bonds against scammers.</small></div>
</div></div>
<div class="card"><b>Nine agents, one loop</b><br>
<small class="dim">Pehchaan (identity) → Parakh (CuNi-proven skill tests) → Niyokta (bonded listings) → Talaash (matching) → Hifazat (escrow) → Hisab (settlement) → Nigrani (fraud watchdog) → Yaad (portable earnings record) → Khazana (treasury). Every action signed, every payment escrowed, every step receipted.</small></div>
<div class="card"><b>Rails</b><br>
<span class="pill live">AwLPay ● ${opts.railMode}</span>
<span class="pill ${opts.coinbaseOn ? "live" : "mock"}">Coinbase ○ ${opts.coinbaseOn ? "active (operator key)" : "optional — no key configured"}</span><br>
<small class="dim">Rider identity layer: ${opts.riderMode}. No account, no keys, no login needed to explore.</small></div>
<a class="btn" href="/demo">▶ Run the live demo</a>
<a class="btn ghost" href="/mesh">Mesh dashboard</a>
<div class="card"><b>Mesh counters</b>
<div class="kv"><span>Receipts filed</span><b>${c["total"] ?? 0}</b></div>
<div class="kv"><span>Payouts settled</span><b>${c["payout-settled"] ?? 0}</b></div>
<div class="kv"><span>Scam listings killed</span><b>${c["fraud-killed"] ?? 0}</b></div>
<div class="kv"><span>Skill receipts minted</span><b>${c["skill-receipt"] ?? 0}</b></div>
</div>`
  );
}

export function demoHtml(trace: GigTrace, fraud: FraudTrace, workerKeyId: string): string {
  const rs = (p: number) => `₹${(p / 100).toFixed(2)}`;
  return page(
    "Live demo",
    `<header class="hero"><h1>Live demo</h1>
<p class="tag">The full mesh loop, run just now — every step signed and receipted. Persona: <b>fictional</b>.</p></header>
<div class="step"><b>1 · Pehchaan — identity.</b> ${trace.workerName} gets a free signed Rider identity. <span class="mono">${trace.workerAgentId}</span></div>
<div class="step"><b>2 · Parakh — proof, not promises.</b> CuNi-gated data-entry test: <b>${trace.skillReceipt.score100}/100</b>, proof hash <span class="mono">${trace.skillReceipt.proofHash.slice(0, 20)}…</span></div>
<div class="step"><b>3 · Niyokta — bonded listing.</b> "${trace.listing.title}" — ₹${trace.listing.payPaise / 100}. Escrow locked <i>before</i> the listing went live; 1% fraud bond posted.</div>
<div class="step"><b>4 · Talaash — the match.</b> Ranked #1 (score ${trace.matchScore}). Worker's warrant caps exposure at <b>₹0</b> — signed.</div>
<div class="step"><b>5 · Work → verify.</b> Deliverable validated; attestation <span class="mono">${trace.attestationHash.slice(0, 20)}…</span></div>
<div class="step"><b>6 · Hifazat → Hisab — settle.</b> Escrow released on attestation. Payout <b>${rs(trace.netPaise)}</b> via AwLPay rail (fee ${rs(trace.feePaise)}). Ref: <span class="mono">${trace.txRef.slice(0, 28)}…</span> <span class="pill ${trace.txRefKind === "onchain" ? "live" : "mock"}">${trace.txRefKind}</span></div>
<div class="step"><b>7 · Yaad — remember.</b> <a href="/worker/${trace.workerKeyId}">Reputation page</a>: 1 gig · ${rs(trace.netPaise)} earned · 0 disputes. Portable, signed, hers.</div>
<div class="card"><b>Worker out-of-pocket: ${rs(trace.workerCostPaise)}</b><br><small class="dim">${trace.receiptCount} receipts filed this run. Every number above is reproducible from the <a href="/mesh">receipt log</a>.</small></div>
<div class="card" style="border-color:#7a2e2e"><b>☠ The scammer loses (fraud path)</b><br>
"Pay ₹500 registration fee" listing → Nigrani verdict: <b>KILL</b><br>
<small class="dim">Signals: ${fraud.signals.join(", ")}</small><br>
Bond slashed: <b>${rs(fraud.bondSlashedPaise)}</b> → victim-compensation pool (${rs(fraud.victimPoolPaise)}). Worker paid: <b>${rs(fraud.workerPaidPaise)}</b>.</div>
<a class="btn ghost" href="/mesh">Inspect the receipt log</a>`
  );
}

export function meshHtml(
  counts: Record<string, number>,
  receipts: Receipt[],
  treasury: Array<Portfolio & { movements: number }>
): string {
  const rs = (p: number) => `₹${(p / 100).toFixed(2)}`;
  const rows = receipts
    .slice(-60)
    .reverse()
    .map(
      (r) =>
        `<tr><td class="mono">${r.body.ts.slice(11, 19)}</td><td>${r.body.kind}</td><td>${r.body.agent}</td><td class="mono">${r.body.id.slice(0, 14)}…</td></tr>`
    )
    .join("");
  const trows = treasury
    .map(
      (p) =>
        `<div class="kv"><span>${p.label}</span><b>${rs(p.balancePaise)}</b></div>`
    )
    .join("");
  return page(
    "Mesh dashboard",
    `<header class="hero"><h1>Mesh dashboard</h1>
<p class="tag">The receipt log is the system of record. Every counter below is computed from signed receipts — not typed by us.</p></header>
<div class="card"><b>Counters</b>
${Object.entries(counts)
  .sort()
  .map(([k, n]) => `<div class="kv"><span>${k}</span><b>${n}</b></div>`)
  .join("")}</div>
<div class="card"><b>Khazana — public treasury</b>${trows}
<small class="dim">Three scoped portfolios, each with a signed Warrant cap. Methodology: every movement is a signed receipt above.</small></div>
<div class="card"><b>Receipt log (latest 60)</b>
<table><tr><th>Time</th><th>Kind</th><th>Agent</th><th>ID</th></tr>${rows}</table></div>`
  );
}

export function workerHtml(opts: {
  displayName: string;
  workerKeyId: string;
  gigs: number;
  earnedPaise: number;
  disputes: number;
  skills: Array<{ skill: string; score100: number; proofHash: string }>;
  verified: boolean;
  identityCard: string;
}): string {
  const rs = (p: number) => `₹${(p / 100).toFixed(2)}`;
  const qr = qrcode(0, "M");
  qr.addData(opts.identityCard);
  qr.make();
  const svg = qr.createSvgTag({ scalable: true });
  return page(
    `${opts.displayName} — reputation`,
    `<header class="hero"><h1>${opts.displayName}</h1>
<p class="tag">Portable, signed earnings record — the credit on-ramp. <span class="pill ${opts.verified ? "live" : "mock"}">${opts.verified ? "verified against receipt log" : "UNVERIFIED"}</span></p></header>
<div class="card"><div class="grid">
<div><div class="stat">${opts.gigs}</div><small class="dim">gigs completed</small></div>
<div><div class="stat">${rs(opts.earnedPaise)}</div><small class="dim">earned</small></div>
<div><div class="stat">${opts.disputes}</div><small class="dim">disputes</small></div>
<div><div class="stat">${opts.skills.length}</div><small class="dim">proven skills</small></div>
</div></div>
<div class="card"><b>Proven skills</b>
${opts.skills.map((s) => `<div class="kv"><span>${s.skill}</span><b>${s.score100}/100</b></div><div class="mono">proof ${s.proofHash.slice(0, 24)}…</div>`).join("") || "<small class='dim'>none yet</small>"}</div>
<div class="card"><b>Signed identity card</b><br><div class="qr">${svg}</div><br><small class="dim">Scan to verify this worker's signed Rider identity. Key: <span class="mono">${opts.workerKeyId.slice(0, 24)}…</span></small></div>`
  );
}

export function notFoundHtml(): string {
  return page("Not found", `<header class="hero"><h1>404</h1><p class="tag">Nothing here. <a href="/">Back to Rozgar</a>.</p></header>`);
}
