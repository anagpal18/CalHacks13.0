# Creao build, in stages

**Why the product dies without Creao:** every seat of Bursar is a Creao agent. Intake, Vendor-Records and Matching read each bill and make the stamps. Payments plans the run. Our code only starts the runs, checks each stamp and holds the money rules. If Creao stops, no bill is read, no stamp is made and nothing is paid.

**Track:** AI-First Disruptor ("remove the agent, and the product stops working").

| Stage | Goal | Owner | Done when | Show Creao |
|---|---|---|---|---|
| 0 | Account, Pro Plus, API key | Kenil | `CREAO_API_KEY` is in `.env` | Nothing yet |
| 1 | Intake agent runs from our code | Kenil | `npm run creao:passport` prints 2 stamps and the run time | The `[API]` run in the sidebar and its share link |
| 2 | Three seat agents in parallel make one passport | Kenil | 8 stamps; a wrong-seat stamp is rejected; the scam bill is PARKED | Three `[API]` runs side by side, plus the passport table |
| 3 | Vendor-Records calls our CRS tool through Secrets | Kenil | The `payto` stamp cites CRS callIds from our gateway | The agent's tool call inside the run trace |
| 4 | Payments agent, AP desk lead, Friday schedule | Aditya (Payments), Kenil (lead) | The lead runs the seats; the schedule shows its next run | The org chart of agents and the scheduled run |

## Stage 0: account (5 minutes)
1. Sign up: https://creao.ai/signup?hackathon=calhacks13&utm_source=calhacks13&utm_medium=hackathon&utm_campaign=hackathons-oct-2026
2. Give your account email to the CREAO booth. They upgrade hackers to Pro Plus with extra credits. Schedules need Pro Plus.
3. Settings -> API Keys -> create an account key (`capi_...`).
4. Copy `.env.example` to `.env` and paste the key. Never commit `.env`.

## Stage 1: Intake live
1. Build the agent with `creao/agents/01-intake.md`.
2. Put its ID in `.env` as `CREAO_AGENT_INTAKE`.
3. Run `npm run creao:passport`. Write down the run time. If one run takes more than about 3 minutes, the demo replays real recorded runs and goes live only for the judge's own scenario.

## Stage 2: three seats, one passport
1. Build `02-vendor-records.md` and `03-matching.md`. Put their IDs in `.env`.
2. Run `npm run creao:passport` again. All three agents run in parallel. Expected for the sample scam bill: `sender`, `repeat`, `payto` and `terms` fail, so the bill is PARKED.

## Stage 3: our own tool inside Creao
1. Put `CRS_USERNAME` and `CRS_PASSWORD` in `.env`, then start the API: `npm run api`. It serves `POST /crs/verify-requester`, `GET /crs/log` and `GET /crs/calls/:callId`.
2. In your own terminal, run `npm run tunnel` and copy the `https://...trycloudflare.com` URL it prints. The URL changes each time the tunnel restarts.
3. In Creao **Secrets**, add only `BP_GATEWAY_URL` (that URL). Creao Secrets are visible to every agent on the account, so no key goes there: each run gets its own ticket from our backend, and `BP_ADMIN_KEY` never leaves `.env`. (The old `BP_GATEWAY_KEY` secret is retired; delete it from Creao Secrets.)
3. Run the scam bill. The `payto` stamp must cite CRS callIds that exist in our CRS log, and the gateway must reject any that do not.

## Stage 4: the whole team in Creao
1. Aditya builds `04-payments.md`.
2. Kenil builds `05-ap-desk-lead.md` and the Friday schedule.

## Submission checklist (Creao's one rule)
- [ ] At least one Creao agent does the core work (all four seats do).
- [ ] README lists every agent ID and one run share link.
- [ ] The demo shows an agent running live.
- [ ] Devpost: the Creao track is selected.
- [ ] Each stamp stores its `creaoRunId`, so the dashboard can open the run that made it.
