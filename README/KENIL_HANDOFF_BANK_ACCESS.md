# Kenil: bank access for your agents is ready to use

Branch: `aditya/nessie-integration`. Seat tokens are sent by DM, never committed.

## What's done
- Our API sits between your agents and Nessie. **Your agents never call Nessie directly**, and the Nessie key never leaves our server.
- The bank is seeded: our company account, 5 vendors, and 6 past payments, including **INV-1043 from Okafor Electric**, the demo duplicate.
- Each agent seat has its own token, and each route allows only certain seats. A missing token gets 401, the wrong seat gets 403.

**Base URL:** `https://playhouse-pretty-unwind.ngrok-free.dev`
It only works while Aditya's laptop is on. We'll deploy it properly before the demo.

**Send these headers on every request:**
```
Authorization: Bearer <your seat token>
ngrok-skip-browser-warning: 1
```

## Routes for your seats

| Seat | Route | Use it for |
|---|---|---|
| Intake | `GET /bank/bills/:billId/payments` → `{ alreadyPaid, paymentsForBill[] }` | Stamp 3: exact bill number already paid |
| Intake | `GET /bank/vendors/:vendorId/payments` → `{ pastPayments[] }` | Stamp 3: fuzzy duplicate check |
| Vendor-Records | `GET /bank/vendors/:vendorId/verified-account` → `{ verifiedPayeeAccountId }` | Stamp 7: compare against the bank details on the bill |
| Vendor-Records | `GET /bank/vendors/:vendorId/payments` | Stamp 7: where past payments actually went (`payeeAccountId`) |
| Matching | none | Matching only needs POs, the receiving log and contracts |

Each past payment looks like this (all amounts are **cents**):
```json
{ "nessieTransferId": "...", "billId": "INV-1043", "vendorId": "V-OKAFOR-ELECTRIC",
  "payeeAccountId": "...", "amountCents": 1248000, "paidOn": "2026-09-18", "status": "completed" }
```
Vendor IDs for now: `V-OKAFOR-ELECTRIC`, `V-NAKAMURA-CONCRETE`, `V-VENKATESAN-PLUMBING`, `V-BAY-LUMBER`, `V-SUMMIT-STEEL`. Shresth's generator will replace these.

## What's left for you
1. **Fuzzy duplicates are your logic.** `/bank/bills/1043-A/payments` returns `alreadyPaid: false`, because that route only matches exact bill numbers. To catch it as "Already paid as INV-1043", fetch the vendor's payment history and compare the fingerprint (amount, dates, line items).
2. **Stamp signing should happen on our server**, for example `POST /stamps`. Your agents send the decision plus evidence, and the server signs it with that seat's key, so private keys never go to Creao.
3. **Seat checks can move into your gateway.** They're in `services/api/src/seatAccess/` right now (`requireSeat("intake", ...)`). Take that over or extend it.
4. **Please don't add any route that moves money.** Paying happens only in `POST /runs/:id/execute` (Aditya's part), after the gateway has checked the approval.

## Running it locally
Copy `.env.example` to `.env` and fill in values (Aditya sends the Nessie key), then:
```
corepack pnpm install
corepack pnpm api:dev       # starts the API on port 4000
corepack pnpm nessie:check  # read-only test against the bank
```
More docs: `services/api/src/routes/README.md` and `services/api/src/integrations/nessie/README.md`. The Nessie README also covers the quirks of the live API; the important one is that transfers have no payee field, so we record the payee in the transfer description.

## Questions for the Creao booth
- Can a Creao agent call an external HTTPS API with custom headers?
- Does our API, which calls Nessie behind the scenes, count as the required "custom API"?
