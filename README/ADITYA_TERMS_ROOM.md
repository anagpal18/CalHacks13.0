# Aditya — Terms Room (Backend support)

> Read TERMS_ROOM_MASTER.md first. This file lists only your work.
> Terms Room is standalone. It is NOT connected to Bill Passport.

## Your mission
Give the negotiation a realistic cast and a real money step: persona scenarios, the demo seed, and the Nessie deposit payment.

## You own
```
services/api/seed/                 # personas, demo seed, replay endpoint
services/api/integrations/nessie/  # deposit payment + match
```

## Tasks

### Hours 0–2
- [ ] Nessie API key working; create contractor customer + operating account

### Hours 2–8 — personas and seed
- [ ] One subcontractor profile per persona (master §6): business name, trade, contact, opening ask (30%, net 15), job value
  - [ ] P19 Grace Nakamura — clean, shares strong band
  - [ ] P01 Margaret Okafor — clean
  - [ ] P08 Priya Venkatesan — tax lien + judgment
  - [ ] P13 Kayla Brennan — fraud signals
  - [ ] P12 Victor Anand — impersonation
  - [ ] P16 Samuel Oyelaran — fraud alert, escalate
- [ ] Consent records for subs that share credit data (P19, P01)
- [ ] Expected outcome per persona (for testing): deposit %, rounds, end state

### Hours 8–14 — Nessie deposit
- [ ] Create a payee account per sub
- [ ] `payDeposit(negotiationId)` → only if deal status is `approved`; returns transfer id
- [ ] `matchDeposit(negotiationId)` → confirm Nessie record = agreed deposit
- [ ] Write transfer id into the `Deal`

### Hours 14–21 — demo mode
- [ ] `GET /demo/replay` → seeded run of P19 → P08 → P13 → approve P19 → deposit
- [ ] Check every persona's actual outcome matches the expected one; report mismatches to Shresth and Kenil

## API you provide
```
GET  /personas              -> cast for the UI
POST /deals/:id/deposit     -> pay approved deposit via Nessie
GET  /deals/:id/deposit     -> transfer + match status
GET  /demo/replay           -> seeded demo run
```

## You depend on
- **Shresth:** deal status `approved`
- **Kenil:** CRS client (for checking persona expectations)

## Done when
- [ ] All 6 personas land on their expected outcome
- [ ] Approving Grace's deal pays the deposit in Nessie and shows it as matched
