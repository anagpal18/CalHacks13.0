# Aditya — Bill Passport (Lead, full stack)

> Read BILL_PASSPORT_MASTER.md first. This file lists only your work.
> Bill Passport is standalone. It is NOT connected to Terms Room.

## Your mission
Make Bill Passport **eye-catching and obvious in 2 minutes**, and build stage 2: planning, approving, paying through Nessie, and matching the bank record.

## You own
```
apps/web/                       # the whole 2D dashboard
services/api/agents/payments/   # Payments agent
services/api/routes/stage2/     # payment runs, approve, re-check, bank match, demo replay
services/api/integrations/nessie/
demo video
```

## Backend tasks

### Hours 0–2
- [ ] Nessie API key working; create our company customer + operating account
- [ ] Create one payee account per vendor (from Shresth's generator)

### Hours 2–8 — Nessie client
- [ ] `getPaymentHistory(vendorId)` (Kenil needs this for stamps 3 and 7)
- [ ] `getBalance()`
- [ ] `pay(vendorId, amountCents, memo)` → returns transfer id
- [ ] `getTransfer(id)` for bank matching
- [ ] Seed past payments so history exists

### Hours 8–18 — Payments agent + stage 2 routes
- [ ] **Check 9 Due date:** schedule each booked bill by its contract terms (net 30 from delivery, etc.)
- [ ] **Check 10 Discount:** flag 2/10-style discounts worth taking
- [ ] **Check 11 Cash:** run total ≤ Nessie balance
- [ ] **Check 12 Approver:** human approval, approver ≠ requester, within limit (via Kenil's gateway)
- [ ] **Check 13 Re-check:** bank details unchanged since booking, not already paid, amount unchanged; anything off → `held` + Kenil's CRS chain
- [ ] **Check 14 Bank match:** Nessie record matches the bill → mark paid, post ledger entry via Kenil
- [ ] Routes:
```
GET  /runs/next          -> proposed run grouped by due date
POST /runs/:id/approve   -> human approval
POST /runs/:id/execute   -> re-check, pay, match
GET  /demo/replay        -> seeded week for demo mode
```

## Frontend tasks (2D, eye-catching)

Stack: React + Tailwind + Framer Motion + Recharts. Dark theme. Green cleared, red held, amber asking a human. Big text for decisions.

Step bar on every page: **① Inbox → ② Check → ③ Verify → ④ Approve & Pay → ⑤ Proof**, with a **Next** button.

- [ ] **① Inbox:** bill list sliding in with status colors; 3 big animated counters (bills checked, problems caught, $ protected)
- [ ] **② Check:** passport card; 8 stamps tick one by one with a "stamp slam"; failed stamp shows one line + Evidence drawer (sources compared, winner, rule)
- [ ] **③ Verify:** 3 CRS scanner bars sweep in order (Fraud Finder, Identity, Phone owner), one line each, risk gauge animating to the score, big decision
- [ ] **④ Approve & Pay:** run grouped by due date, discount badges, cash bar, Approve button, re-check animation, Nessie confirmation, "matched" tick
- [ ] **⑤ Proof:** caught / missed / false alarms grid, $ protected, audit trail search, small CRS data-use log
- [ ] **Try to scam us** button on every page → scam cards (P13, P12, P14…) → jumps to ③
- [ ] Demo mode (seeded replay) vs live mode toggle

### Hours plan
- 2–8h: shell + all 5 pages on mock data from `packages/shared`
- 8–14h: wire to Kenil's API
- 14–18h: stage 2 live; scam console
- 18–21h: polish motion; rehearse the 2-minute script (master §13)
- 21–23h: record demo video opening with the Verify catch

## You depend on
- **Kenil:** schemas, `/bills`, `/passport`, `/gateway/verify`, CRS chain
- **Shresth:** generated vendors/bills, `/score` for the Proof page

## Done when
- [ ] Someone walking past understands each page in 10 seconds
- [ ] A clean bill goes Inbox → paid in Nessie → matched
- [ ] A bank change made after booking is held at re-check
