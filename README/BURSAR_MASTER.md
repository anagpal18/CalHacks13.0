# Bursar — MASTER.md

> Single source of truth for building Bursar at Cal Hacks 13.0.
> Standalone project. It is NOT connected to Terms Room.
> Plan doc: https://claude.ai/artifact/Lr1XrSDnAWyHBVjZxPfULZ

---

## 1. The idea in one line

An autonomous accounts-payable team where **every incoming bill must earn a complete, signed chain of proof (a "passport") before it is booked, and again before it is paid.**

- **Stage 1 — check and book:** a bill arrives, agents run 8 checks ("stamps"), and only a fully stamped bill is booked in the ledger.
- **Stage 2 — plan, approve, pay:** booked bills are scheduled by payment terms, a human controller approves, the system re-checks, pays through Nessie, and matches the bank record.
- **Out of scope:** stage 3 (disputes and recovery). Hyphenate advised focusing on two stages.

**Pitch line:** "The median company loses 1.5% of everything it pays out to duplicates and errors. Every bill here has to prove itself before we pay it."

---

## 2. Team

| Person | Role | Frontend | Backend |
|---|---|---|---|
| **Aditya** | Lead, full stack | 2D dashboard (all 5 pages + scam console), demo video | Payments agent (stage 2), Nessie client, stage 2 API endpoints, demo-mode replay endpoint |
| **Kenil** | Backend only | — | Gateway, event log, ledger, passport schema + signing keys, Intake / Vendor-Records / Matching agents on Creao, CRS client, README |
| **Shresth** | Backend support | — | Demo data generator, answer key, scoring service for the Proof page |

**Golden rule:** the AI proposes, the code decides. No agent can move money or book a bill on its own; the gateway checks every signature and permission.

---

## 3. Sponsor tracks

| Track | What they want | What we give |
|---|---|---|
| **Hyphenate** (main) | Autonomous seats, limited access, clean record, knows when to ask, sources that disagree, time, proof (answer key), demo video opening with "the moment" | 4 agent seats with code-enforced permissions; passport = audit trail; trust rules; stages 1+2; planted errors + answer key |
| **CRS** (Identity/Fraud) | Meaningful CRS use, live; originality, usefulness, CRS at the core, works end to end, responsible | 3 CRS products chained on every bank-detail change; callback number verified before calling; data-use log |
| **Capital One Nessie** | Complete, creative, complex use | Payment history for duplicates, proof of where past payments went, cash check, executes payments |
| **Creao** (Team Empowerment) | Built on Creao, ≥1 custom API registered (confirm at booth) | All agents on Creao; CRS + Nessie registered as custom APIs |

---

## 4. Seats (1 seat = 1 agent)

| Agent | Signs | Can | Cannot |
|---|---|---|---|
| **Intake** | Stamps 1, 3 | Read bills, open passports, fingerprint | Edit vendor records, approve, pay |
| **Vendor-Records** | Stamps 2, 7, 8 | Call CRS, propose vendor-record changes with evidence | Approve or pay |
| **Matching** | Stamps 4, 5, 6 | Read POs, receiving log, contracts | Edit vendor records, pay |
| **Payments** | Checks 9–14 | Build payment runs, call Nessie after approval | Approve its own runs |

Humans (a model can play them in the demo): **Controller** approves payment runs and large exceptions. **Project managers** confirm deliveries.

---

## 5. The checks

### Stage 1 — check and book

| # | Stamp | Compares | Against | Catches | Agent |
|---|---|---|---|---|---|
| 1 | Sender | Sender email + headers; CRS Fraud Finder on the email | Verified vendor contacts + change history | Scam | Intake |
| 2 | Vendor is real | Vendor name/address on the bill | Vendor records; CRS identity on sole-proprietor owners; simulated registry for companies (labeled) | Scam | Vendor-Records |
| 3 | Not a repeat | Fingerprint (vendor, amount, dates, line items) | Past bills, ledger, Nessie payment history | Mistake | Intake |
| 4 | Matches the order | Line items | PO + contract rates (tolerance) | Mistake / fraud | Matching |
| 5 | Delivered | Billed items | Receiving log (PM signed) | Mistake / fraud | Matching |
| 6 | Terms | Terms on the bill | Contract terms (e.g. net 30 from delivery, 2/10 net 30) | Mistake | Matching |
| 7 | Pay-to details | Bank account on the bill | Verified account + where past payments went (Nessie); any change → CRS chain | Scam | Vendor-Records |
| 8 | No insider link | Vendor contact phone/address (CRS reverse phone) | Employee records | Fraud | Vendor-Records |

### CRS chain (any bank-detail change)
1. **Fraud Finder:** risk 0–100, email age, prepaid/VoIP phone, phone-owner match, IP distance.
2. **TU identity verification:** read **reason codes** (2101 address, 2201 SSN/name, 2202 DOB, 2301 deceased, 2401 step-up). Ignore the constant risk indicator.
3. **Reverse phone lookup:** does the "call to confirm" number belong to the vendor contact? Only then call it.

### Stage 2 — plan, approve, pay

| # | Check | Question |
|---|---|---|
| 9 | Due date | Scheduled by its terms, not early or late? |
| 10 | Discount | Early-payment discount available and worth taking? |
| 11 | Cash | Enough in Nessie for the run? |
| 12 | Approver | Human, not the requester, within limit? |
| 13 | Last-minute re-check | Bank details unchanged since booking? Not already paid? Amount unchanged? |
| 14 | Bank match | Nessie record matches the bill? |

### Trust rules (when sources disagree)
- What was paid → **Nessie beats the ledger.**
- Price / quantity → **PO and contract beat the invoice.**
- Delivered → **receiving log beats the invoice.**
- Terms → **contract beats the invoice.**
- Is a person real → **CRS beats the requester.**
- Contact/bank details → **last verified version beats the current one.**

Every disagreement is written into the passport: sources, winner, rule.

---

## 6. Architecture

```
Web app (React, 2D)  ──►  API (gateway)  ──►  Ledger + event log + passport store
                              ▲
                              │ signed stamps
                     Agents on Creao (Intake, Vendor-Records, Matching, Payments)
                              │ read
             ┌────────────────┼─────────────────┬──────────────┐
            CRS          Nessie (bank)    Company data (sim)   People (controller, PMs)
```

- **Gateway (plain code):** verifies each stamp's signature, checks the signer is allowed to sign that stamp, rejects booking without all stage 1 stamps, rejects payment without approval by a non-requester.
- **Event log:** append-only; every event hashed with the previous one. Enables "as of" replay.
- **Ledger:** double-entry. Booking a bill = debit Expense / credit Accounts Payable. Paying = debit Accounts Payable / credit Cash.

---

## 7. Stack and repo

**Stack:** TypeScript everywhere. `pnpm` monorepo.
- `apps/web` — Vite + React + Tailwind + Framer Motion + Recharts
- `services/api` — Fastify + SQLite (better-sqlite3) or Postgres; zod for schemas; Ed25519 signing (node `crypto`)
- `packages/shared` — zod schemas + types used by web and api

```
bursar/
  apps/web/            # Aditya
  services/api/
    gateway/           # Kenil
    ledger/            # Kenil
    agents/            # Kenil (Intake, Vendor-Records, Matching), Aditya (Payments)
    routes/stage2/     # Aditya (payment runs, approve, re-check, bank match, demo replay)
    integrations/crs/  # Kenil
    integrations/nessie/ # Aditya
    sim/               # Shresth (generator, answer key, scoring service)
  packages/shared/     # Kenil publishes schemas in hour 0–2
```

---

## 8. Core schemas (packages/shared)

```ts
type StampId = "sender" | "vendor" | "repeat" | "order" | "delivered" | "terms" | "payto" | "insider";

interface Evidence {
  source: "invoice" | "email" | "vendor_master" | "vendor_history" | "po" | "contract"
        | "receiving" | "past_bills" | "ledger" | "nessie" | "crs" | "employees" | "approval_rules" | "callback";
  field: string;          // e.g. "bank.account_last4"
  value: string;
  ref?: string;           // CRS call id, Nessie transaction id, PO number...
}

interface Stamp {
  id: StampId;
  status: "pass" | "fail" | "ask_human";
  reason: string;         // one plain sentence for the UI
  evidence: Evidence[];
  disagreement?: { sources: string[]; winner: string; rule: string };
  signedBy: "intake" | "vendor_records" | "matching";
  signature: string;      // Ed25519 over the stamp JSON (minus signature)
  at: string;             // ISO time
}

interface Passport {
  billId: string;
  vendorId: string;
  amountCents: number;
  stamps: Stamp[];
  status: "checking" | "parked" | "booked" | "scheduled" | "approved" | "held" | "paid";
  askedWho?: "controller" | "project_manager" | "vendor";
  payment?: { runId: string; approvedBy: string; nessieTransferId?: string; matched?: boolean };
}
```

---

## 9. CRS rules (must follow)

- Base URL: `https://api-sandbox.stitchcredit.com:443/api` (login: `POST /users/login` → Bearer token).
- **Only send exact test-persona request bodies.** Anything else hits the real vendor and can be billed. Enforce with an allowlist in `integrations/crs`.
- **Never log or display raw request headers** (token + IP inside).
- **Cache responses** (rate limit 80; some calls >1.5 s). Show the real call in the data-use log.
- Call CRS only for new vendors and bank-detail changes, never every bill.
- Do **not** pull consumer credit reports for vendors.

### Demo personas

| Role | Persona | Expected |
|---|---|---|
| Trusted vendor contact (Okafor Electric) | P01 Margaret Okafor | Cleared (risk 11) |
| Small-business owner vendor | P19 Grace Nakamura | Cleared (risk 9) |
| Scammer changing bank details | P13 Kayla Brennan | Held (IDV fail, risk 88, email 3 days old, VoIP phone not hers) |
| Impersonator | P12 Victor Anand | Held (phone belongs to someone else) |
| Ghost vendor, dead person's identity | P14 Harold Pettigrew | Held (deceased) |
| Vendor with money trouble | P08 Priya Venkatesan | Review ($7,450 tax lien, $12,300 judgment) |
| Needs a human | P16 Samuel Oyelaran | Escalate (fraud alert, step-up) |

---

## 10. Nessie

- Docs: Capital One Nessie (verify base URL and endpoints in the docs; API key via `?key=`).
- Use: customers, accounts, bills, transfers, payment history.
- Our company = one customer with an operating account; each vendor = a payee account.
- Pre-seed past payments so stamp 3 (duplicates) and stamp 7 (where money went) have history.

---

## 11. Demo data and answer key (Shresth)

Company: regional construction contractor, 9 job sites, ~160 vendors, weekly runs. Generate one messy week (~150–200 bills) with ~40 planted problems:

- Fuzzy duplicates (INV-1043 vs 1043-A; same bill by email + portal)
- Price creep ($3.90 → $4.10 on 2,000 units)
- Billed but not delivered
- Wrong terms (net 15 on bill vs net 30 in contract)
- Missed early-payment discount
- Bank-change scams (P13, P12)
- Bank details changed after booking, before payment
- Insider vendor (contact phone traces to an employee address)
- Same person requesting and approving
- Bank record not matching the bill

Output: `sim/answer_key.json` → scoring = caught / missed / false alarms. **Seeded:** same week every run.

---

## 12. Frontend (Aditya) — 5 pages, in order

Step bar on every page: **① Inbox → ② Check → ③ Verify → ④ Approve & Pay → ⑤ Proof**. Colors: green cleared, red held, amber asking a human. Big text for decisions.

1. **Inbox — "Bills are coming in."** Bill list with status colors; 3 big numbers: bills checked, problems caught, $ protected.
2. **Check — "Every bill must prove itself."** Stamps tick one by one; failed stamp shows one line + Evidence button.
3. **Verify — "Is the person changing bank details real?"** 3 CRS checks run in order, one line each, risk score, decision.
4. **Approve & Pay — "The right person signs, then money moves."** Run grouped by due date, discounts flagged, cash available, Approve button, re-check, Nessie confirmation, bank match.
5. **Proof — "Does it actually work?"** Caught vs planted, $ protected, false alarms; audit trail for any bill; CRS data-use log.

Always visible: **Try to scam us** → judge picks a scam card → jumps to page 3.
Modes: **demo** (seeded replay) and **live** (judge attacks).

---

## 13. 2-minute demo

| Time | Page | Show |
|---|---|---|
| 0:00–0:15 | Inbox | Stat line; bills flow in, most go green |
| 0:15–0:40 | Check | Duplicate under a new number, "Already paid as INV-1043" |
| 0:40–1:15 | Verify | Bank change from "Okafor Electric": risk 88, IDV fail, phone not hers → held, $48,000 saved; real contact → green |
| 1:15–1:35 | Approve & Pay | Grouped by due date, 2% discount, controller approves, re-check, Nessie pays, match |
| 1:35–1:50 | Scam console | Judge's attack caught live |
| 1:50–2:00 | Proof | "38 of 40 caught, every decision explained" |

Hyphenate video opens with the Verify catch. Seats line: "Bursar fills the AP intake, vendor-records, matching and payments seats."

---

## 14. 24-hour plan

1. **0–2h:** repo, schemas published (Kenil), Nessie + CRS logins, booth questions.
2. **2–8h:** Kenil gateway/ledger/CRS/stage 1 agents; Aditya Nessie client + Payments agent + dashboard on mocks; Shresth generator + answer key.
3. **8–14h:** one bill end to end through all stamps, booked; pages on real data.
4. **14–18h:** stage 2 live on Nessie; scam console; scoring.
5. **18–21h:** seeded demo mode, full answer-key run, fix misses.
6. **21–23h:** video, README, Devpost, rehearsal.
7. **23–24h:** buffer. No new features.

---

## 15. Friday-night checklist

- [ ] CRS booth: enable business credit, OFAC, full IDV (KBA, OTP)?
- [ ] Creao booth: track rules, one-track limit, custom API requirement
- [ ] Hyphenate: confirm stage 1 = check + book, stage 2 = plan → bank match
- [ ] Devpost: tracks per submission; projects per team
- [ ] Nessie key working, accounts seeded
- [ ] No code written before hacking starts
