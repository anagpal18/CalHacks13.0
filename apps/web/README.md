# apps/web — Aditya

The Bursar dashboard. Vite + React 19 + Tailwind v4 + shadcn/ui + motion. Light, minimal theme: colours from the Twisty reference, type from Vercel/Geist.

```
corepack pnpm --filter @bursar/web dev    # http://127.0.0.1:5173
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
src/components/charts/     lollipop, tick strip, sparkline, horizontal bars, Panel + StatFigure
src/components/ui/         shadcn components (generated, don't hand-edit much)
src/pages/                 one file per page
```

## Theme rules

- Tokens live in `src/index.css` only. Navy `#1f2433` ink (also "cleared"), slate-blue `#5a7fbf` data marks,
  orange-red `#e5532d` = held (the only hot colour), ochre `#b9852c` = asking a human.
- Data blue + orange-red pass the dataviz palette validator (CVD, contrast) on white.
- Text is always ink or muted grey; colour goes on marks, dots and status pills, never on body text.
- Big number + small muted label for every figure. One orange thing per decision.
