# Nessie integration — Aditya

Import only from `index.ts`: `getBankService()` returns the live Nessie bank or the offline fake (`NESSIE_MODE` in .env). All amounts are **cents**.

| File | What it does |
|---|---|
| `bankService.ts` | The interface everyone codes against |
| `liveNessieBankService.ts` | Real Nessie implementation |
| `offlineFakeBankService.ts` | In-memory fake, same behaviour, no network |
| `nessieHttpClient.ts` | Raw HTTP calls, one per endpoint |
| `nessieApiTypes.ts` | Exact request/response shapes |
| `nessieAccountDirectory.ts` | Our IDs → Nessie IDs (`services/api/data/nessie-account-directory.json`) |
| `paymentMemo.ts` | Encodes bill/vendor/payee into the transfer description |
| `nessieMoney.ts` | Cents ↔ dollars |
| `seedData.ts` | Starter vendors + past payments (replace with Shresth's generator) |

Scripts: `pnpm nessie:seed` (idempotent setup), `pnpm nessie:check` (read-only smoke test).

## How the live API actually behaves (probed 2026-10-24, differs from the old docs)
- Base URL `https://api.nessieisreal.com`; HTTP does not connect. Key goes in `?key=`.
- Unknown fields are rejected (`extra fields not permitted`).
- **Transfers have no payee field.** They are recorded only on the paying account, so we put the payee in `description` (see `paymentMemo.ts`).
- **Balances never change** when transfers/deposits are made. We compute balance = starting balance + deposits − transfers.
- Transfer `status` is free text and is required. Create returns `_id`; GET returns `id`.
- Empty lists come back as a string ("No transfers found…"), not `[]`.
- `account_number` is assigned by Nessie; any value sent is ignored.
- Account PUT only changes `nickname`; transfer PUT can change `status`.
