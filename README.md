# Rozgar (रोज़गार) — Signed skills. Settled work.

A multi-agent work mesh where young Indians **prove skills, get matched to real paid gigs, and get paid** — with every identity signed, every test proven exact, every payment escrowed, and every scammer bonded against.

Built for the **Code for a Billion** hackathon — **Financial Inclusion** track. Apache-2.0.

> **Demo:** https://rozgar-demo.fly.dev · **Mesh dashboard:** https://rozgar-demo.fly.dev/mesh
> *(Deploy pending — see [Deployment](#deployment). Until then: `npm run demo:cli` runs the whole loop in your terminal.)*

---

## The problem

Jan Dhan put bank accounts in **59.09 crore** hands (PIB, Aug 2026) and the World Bank's Global Findex 2025 counts **89% of Indian adults as banked**. But the Economic Survey 2025-26 names the real wound: **income volatility leaves gig workers unable to access credit** — they have accounts but no verifiable earnings record, no proof of work, no recourse when wages are stolen.

- India's gig workforce rose from **77 lakh (FY21) to 120 lakh (FY25)**, projected **23.5 million by 2029-30** (Economic Survey 2025-26; Lok Sabha Q.5055).
- **93% of Indian job seekers encountered recruitment scams** (Indeed/Valuvox survey, May–June 2026, n=1,161); job/income scams were **30% of all scam cases** (GSMA India 2026).
- Youth (15–29) unemployment: **15.1%** (PLFS, Aug 2026).

The financially excluded young worker faces a triple lock: **can't prove skill, can't secure payment, can't build a financial history.** Rozgar fixes all three, in the order it has to happen: **identity → proof → protected transaction → history.**

## What it is

Nine cooperating agents, each with its own signed Rider identity, its own toll budget, and a narrow contract. No agent trusts another's word — only signatures, proofs, and escrow.

| # | Agent | Role |
|---|---|---|
| 1 | **Pehchaan** (identity) | Free signed Rider identities for youth (KYC-lite: phone hash, never the raw number). Duplicate phone → existing identity (Sybil resistance). |
| 2 | **Parakh** (test) | CuNi-proven skill micro-tests. The scoring program is proven byte-identical across two implementations before it runs — a tampered client can't fake a pass. Mints signed skill receipts. |
| 3 | **Talaash** (search) | Job discovery + candidate matching, ranked by skill receipts, locale, and reputation. |
| 4 | **Niyokta** (employer) | Posts **bonded** listings: 1% fraud bond + full gig amount in escrow **before** the listing goes live. No escrow, no listing. |
| 5 | **Hifazat** (protection) | Escrow guardian. Releases only on verified completion; refunds on expiry. The worker never pays the 1% fee. |
| 6 | **Hisab** (accounts) | Settlement over the `SettlementRail` interface — AwLPay primary (0.5% flat, always on), Coinbase optional. |
| 7 | **Nigrani** (watch) | Fraud watchdog. Kills scam listings, **slashes bonds** into the victim-compensation pool, resolves disputes in 48h. |
| 8 | **Yaad** (memory) | The portable, signed earnings record — the credit on-ramp. Rebuildable from the receipt log alone; exportable anywhere. |
| 9 | **Khazana** (treasury) | Three scoped portfolios (seed gig pool, victim-compensation pool, ops) with signed Warrant caps. Public treasury page. |

```
Worker ──► Pehchaan ──► Parakh ──► Talaash ──► Niyokta ──► Hifazat ──► Hisab ──► Yaad
            (identity)   (proof)    (match)    (bonded     (escrow)   (payout)  (record)
                                                 listing)                  ▲
                                                    │                      │
                                                    └──── Nigrani ─────────┘
                                                    (kill + slash)    Khazana (treasury)
```

**Design rule, enforced in code:** no agent action without a receipt, no receipt without a signature, no cross-agent value movement without escrow or a warrant. The receipt log (append-only JSONL) is the system of record — if our database vanished, every identity, payment, and reputation could be rebuilt from receipts.

### The loop, in 30 seconds

1. **Onboard** — Aisha (demo persona, fictional) gets a free signed identity.
2. **Prove** — 15-minute data-entry micro-test, CuNi-gated scoring → signed skill receipt with proof hash.
3. **Post** — employer posts a ₹2,000 bonded gig; ₹2,000 locked in escrow *first*.
4. **Match** — Talaash ranks Aisha #1; her warrant caps her exposure at **₹0**.
5. **Verify** — deliverable validated; completion attested.
6. **Settle** — escrow releases; Hisab pays **≈₹1,990** via AwLPay rail (0.5% = ₹10).
7. **Remember** — Yaad appends everything to her portable, signed earnings record.

**The worker's out-of-pocket cost: ₹0.** The fraud path is the showstopper: a "pay ₹500 registration fee" listing is killed in seconds, its bond slashed into the victim pool, and the worker is told: *"You were right to flag it. You paid ₹0."*

## Run it — zero credentials required

```bash
npm install
npm test          # 21 tests, all green
npm run demo:cli  # the full loop in your terminal
npm run build && npm start  # web app on :8080  (/demo, /mesh, /worker/:id)
```

No API keys. No accounts. No network calls. The mesh issues its own ES256-signed rider identities locally; `RIDER_API_KEY` (optional) points it at the live Agent Rider service.

### Settlement rails

- **AwLPayRail (primary, always on):** enforces exactly 0.5% flat. Runs in `pilot-ledger` mode by default — every settlement reference is labeled `pilot-ledger`, never presented as an on-chain hash. Inject a live broadcast function to settle on-chain.
- **CoinbaseRail (optional, off by default):** real adapter, mock-tested. Activates only with `COINBASE_CDP_KEY`. It never gates the demo or any core flow.

### Honest boundaries (what's real, what's not yet)

- **Real:** signed ES256 identities, CuNi-gated dual-implementation scoring, escrow-before-listing, bond slashing, receipt log as system of record, fee math, fraud heuristics, the full loop end to end.
- **Pilot-ledger, labeled:** payouts settle against the mesh ledger in the demo, not on-chain. UPI off-ramp is a documented partner integration, not live.
- **Fictional:** the demo persona (Aisha) and demo funds are labeled everywhere they appear.

## Architecture

```
┌──────────────────────────── ROZGAR (this repo, Apache-2.0) ────────────────────────────┐
│  Web app + /mesh dashboard (src/server.ts, src/ui.ts)                                  │
│  Agent mesh (src/agents/ × 9) · shared libs (src/lib: crypto, receipt, rider, tolls,    │
│  warrant) · CuNi gate (src/cuni: dual scoring impls, byte-identical-or-refuse)         │
│  SettlementRail interface + AwLPayRail + CoinbaseRail (src/rails)                      │
└──────────────────────────────┬────────────────────────────────────────────────────────┘
                               │ HTTPS / JSON (live where no key is needed)
┌──────────────────────────────▼────────────────────────────────────────────────────────┐
│  EXISTING LAB STACK (called, not rebuilt)                                             │
│  Agent Rider — agentrider.fly.dev (identity, verify, DMs, toll gates G1–G7) [LIVE]     │
│  CuNi verifier — G5 exactness gate [LIVE] · AwLPay multi-rail [LIVE] · Warrant/G4 [LIVE]│
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Nine agents, each an independent service with its own signed identity and Warrant spending cap, talking over Rider DMs and filing signed receipts. Postgres is intentionally absent — profiles are phone hashes in memory; money and reputation live in receipts, not our database.

## Proven impact

Pilot plan (36-day window): 150+ signed identities, 100+ skill assessments, 25+ gigs matched, 10+ payouts settled — every number reproducible from the receipt log, published on `/mesh` with methodology next to every counter. Our own test accounts are labeled and excluded from all counters. If a number can't be verified, it doesn't ship.

## AgentFoundry

Built using AgentFoundry (the official IDE) — agent services scaffolded, iterated, and debugged in the AgentFoundry IDE; deployed to Fly; agent trust layer by Agent Rider.

## Deployment

`fly.toml` + `.github/workflows/deploy.yml` ship in this repo. The workflow needs a `FLY_API_TOKEN` repo secret (owner step). App: `rozgar-demo`, 256MB, region `ewr` (same as the Rider service).

## License

Apache-2.0 — see [LICENSE](LICENSE). Copyright 2026 Slid Phi Labs.

---

*Slid Phi Labs accepts donations to keep the lab independent: https://github.com/ceedot-rock*
<!-- Donate URL note: https://www.slidphilabs.com/donate verified 404 on 2026-10-10; no GitHub Sponsors link exists on the Agent-Rider repo. Swap in the live donate URL when published. -->
