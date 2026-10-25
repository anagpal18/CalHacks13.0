# API routes

Start: `corepack pnpm api:dev` (port `API_PORT`, default 4000). Every `/bank/*` call needs
`Authorization: Bearer <seat token>` (tokens are in `.env`). Wrong seat → 403, no token → 401.

| Route | Seats allowed | Used for |
|---|---|---|
| `GET /health` | anyone | is the server up, live or offline bank |
| `GET /bank/balance` | payments, dashboard | check 11 cash |
| `GET /bank/vendors/:vendorId/payments` | intake, vendor_records, payments, dashboard | stamp 3 repeat, stamp 7 where money went |
| `GET /bank/vendors/:vendorId/verified-account` | vendor_records, payments, dashboard | stamp 7, check 13 |
| `GET /bank/bills/:billId/payments` | intake, payments, dashboard | stamp 3 exact-number duplicate, check 13 |
| `GET /bank/transfers/:transferId` | payments, dashboard | check 14 bank match |

No route moves money. Paying happens only in `POST /runs/:id/execute` (stage2), after approval.
The matching seat has no bank access at all: it only needs POs, receiving log and contracts.
