# Bursar — Cal Hacks 13.0

Every incoming bill must earn a complete, signed chain of proof before it is booked, and again before it is paid.
Plan: `README/BURSAR_MASTER.md`.

```
apps/web/                        Aditya   dashboard
packages/shared/                 Kenil    zod schemas + types
services/api/src/
  config/environment.ts                   reads the root .env
  gateway/  ledger/              Kenil
  agents/intake|vendor-records|matching   Kenil
  agents/payments/               Aditya   checks 9–14
  routes/stage2/                 Aditya
  integrations/crs/              Kenil
  integrations/nessie/           Aditya   bank (see its README)
  sim/                           Shresth  generator, answer key, scoring
services/api/scripts/                     one-off scripts (nessie:seed, nessie:check)
```

Setup: `cp .env.example .env`, fill in keys, `corepack pnpm install`, `corepack pnpm nessie:seed`, `corepack pnpm nessie:check`.
