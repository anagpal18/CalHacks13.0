# apps/web — Aditya

The Bill Passport dashboard. Vite + React 19 + Tailwind v4 + shadcn/ui + Aceternity UI + motion.

```
corepack pnpm --filter @bill-passport/web dev    # http://127.0.0.1:5173
```

## Pages (step bar ① → ⑤)

| Route | Page | The one visual that carries it |
|---|---|---|
| `/inbox` | ① Inbox | Pipeline: bills fly Arriving → Checking → Booked / Asking / Held; morning timeline dots |
| `/check/:billId?` | ② Check | Passport with 8 stamps that slam in; click a stamp for the evidence drawer |
| `/verify/:personaId?` | ③ Verify | 3 CRS scanner bars, risk gauge, big decision (opens on P13, the demo catch) |
| `/pay` | ④ Approve & Pay | Due-date timeline, cash bar, human approval, re-check → Nessie → bank match |
| `/proof` | ⑤ Proof | 40 tiles from the answer key; "38 of 40" is computed, never typed |

"Try to scam us" (header) opens attacker cards that jump to `/verify/<persona>`.

## Where things live

```
src/data/types.ts          schema (mirrors master §8; swap for packages/shared later)
src/data/mockData.ts       mocks that follow the 2-minute demo script exactly
src/data/dataSource.ts     ONLY place pages get data. Swap these bodies to fetch() to go live
src/data/stampCatalog.ts   stamp + payment-check labels
src/lib/statusStyle.ts     the one place status colours/icons/labels are decided
src/components/layout/     shell, step bar, scam console, demo/live mode
src/components/visuals/    stamp seal, scanner bar, risk gauge, evidence drawer, counters
src/components/ui/         shadcn + Aceternity components (generated, don't hand-edit much)
src/pages/                 one file per page
```

Colours: green = cleared, red = held, amber = asking a human, blue = checking.
