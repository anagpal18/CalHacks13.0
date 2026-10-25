# Bursar

Cal Hacks 13.0, CRS track. Two AI agents negotiate a new subcontractor's upfront deposit and payment terms, and every offer has to cite a CRS fact. The code refuses any claim CRS didn't return.

This repo follows the layout in `TERMS_ROOM_MASTER.md` §8 (the project's working name was Terms Room). It holds Shresth's part: the negotiation engine, the deal API with its live stream, and **The Table**, the 3D scene.

## Run it

```bash
pnpm install
pnpm test          # engine tests: scenarios A–D, rule changes, consent, masking, the gateway
pnpm dev           # The Table at http://127.0.0.1:5173 (engine runs in the browser)
pnpm api           # deal API on :8787
```

To drive The Table from the API instead of the in-browser engine:

```bash
VITE_API_URL=http://localhost:8787 pnpm dev
```

## What's here

| Path | What it is |
|---|---|
| `packages/shared` | `Offer`, `Citation`, `Deal` from master §7 (widened: net 15–60, upfront %, first-order limit), the Rulebook, exhibits, claims, verdicts and events. Kenil owns this package; his published version wins. |
| `services/api/negotiation` | The engine: the pitch, the cross-examination of every claim, hard stops, risk tier, consent gate, round loop, gateway retry, approvals, all driven by the Rulebook (`rulebook.ts`, `duel.ts`, `scenarios.ts`, `business.ts`). The same engine runs in the browser when there's no API. |
| `services/api/negotiation/standins` | Stand-ins for Kenil's pieces: contractor and sub agents, the gateway, and the CRS client. They follow his spec and get swapped out when his land. |
| `services/api/negotiation/fixtures/crs_fixtures.json` | 30 real CRS sandbox responses for the six owners, captured 2026-10-24, SSNs masked. Response bodies only: no headers, no tokens. The request bodies live in `crs_requests.json`, which only the server reads. |
| `services/api/routes/deals` | `POST /deals` (the Rulebook), `GET /deals/:id`, `POST /deals/:id/exhibit` (your W-9's fields), `POST /deals/:id/approve`, `GET /deals/:id/stream` (SSE), plus `POST /deals/:id/bluff`. |
| `apps/web` | The start page, The Table (React Three Fiber + drei + postprocessing) and the side panel: story card, transcript, CRS console, Rulebook. |

## How it runs

1. **Start page.** Pick a vendor (A to E) and a rule preset (Demo default, Strict buyer, Friendly buyer), tweak a few knobs, or open *Customize every rule*. The choices become a **Rulebook**: `{ scenario, buyerRules, vendorRules, general }`, sent to `POST /deals` when the API is on.
2. **Deal room.** Press **Start**. The story plays in five chapters: the pitch, the cross-examination, the risk tier, the negotiation, the verdict.
3. **The duel.** The vendor's agent argues and plays exhibits (W-9, license, reference letter, credit facts, invoices, bank letter). Each document rises up so it can be read, CRS checks every claim (verified, contradicted, unverified), and it settles back onto the table. Contradictions string red threads to the CRS card that contradicts them. Every verdict moves trust.
4. **Your W-9.** Every run pauses at the W-9 so you can hand one in: upload a file (it stays in the browser; there's no OCR) and confirm or edit what it claims. Change a digit of the EIN to doctor it.
5. **The rules decide.** The gateway enforces the buyer's rules in code: hard stops, tier caps, the credit-limit anchor, escalation, approvals. When one decides something, the transcript says "Rule applied: …" and the Rulebook tab counts and pulses it.
6. Bubbles over both agents show what each is thinking as it happens. Space pauses and resumes; the right arrow plays one step.

Scenarios under Demo default: **A** Nakamura Electric (P19, clean) closes at net 15. **B** Venkatesan Builders (P08, lien + judgment, slow payer) closes at net 45, 0% upfront. **C** "Okafor Electric Supply" (P12, a look-alike) and **D** Brennan Site Services (P13, with the doctored W-9) end in round 1. **E** is any owner with any business profile.

## What's real and what isn't

- **Real:** the people data. TU identity, Fraud Finder, reverse phone, PitchPoint and the vendor's own TransUnion report are the CRS sandbox's answers for these test personas, sent with persona-exact request bodies only. Call IDs are the original sandbox RequestIDs.
- **Made up:** every business record (Quick Search, registration, Fraud Shields, Risk Dashboard). The CalHacks sandbox has no business, SOS, UCC or OFAC products, so `services/api/negotiation/business.ts` answers from scenario data shaped like the Experian Business products CRS resells. They're tagged `source: "simulated"` in the data; the UI doesn't label them (by request), so say so if a judge asks.
- **Standing in:** both agents and the gateway are deterministic stand-ins for Kenil's Creao agents and gateway. Vendor profiles are placeholders for Aditya's seed. The Nessie transfer isn't wired yet.
- **Masking:** SSNs are cut to the last 4 at rest in the fixtures and again before any response reaches the UI; EINs are shown as last 4. No headers or tokens are stored or shown.
- **Not used:** criminal and eviction data, anywhere.

## Live CRS calls

`pnpm api` serves the captured sandbox responses. To call the sandbox live instead (server-side only):

```bash
CRS_LIVE=1 CRS_USERNAME=... CRS_PASSWORD=... pnpm api
```

It logs in once, sends only the persona-exact bodies in `fixtures/crs_requests.json` (which never ships to the browser), caches one call per product and persona, and falls back to the captured response on any failure. A failed login is never retried.
