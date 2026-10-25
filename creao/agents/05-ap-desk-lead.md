# Agent 5: AP desk lead (stage 4, stretch)

An orchestrator agent that hands one bill to the three check seats, collects their stamps and reports the passport proposal. It makes the "org chart of agents" visible inside Creao. Our gateway still decides; the lead only coordinates. Owner: Kenil.

Build this only after stages 1-3 work. Nested runs add minutes, so the live demo keeps using our backend for the parallel fan-out, and the lead shows the same flow inside Creao.

## Setup
1. Create an **agent key** on each seat agent's page (Intake, Vendor-Records, Matching). Agent keys can run only their own agent.
2. In **Secrets**, add `CREAO_KEY_INTAKE`, `CREAO_KEY_VENDOR_RECORDS`, `CREAO_KEY_MATCHING` and `CREAO_AGENT_INTAKE`, `CREAO_AGENT_VENDOR_RECORDS`, `CREAO_AGENT_MATCHING` (the agent IDs).
3. Build the agent with the prompt below and the sample bill, then **Create Agent** (Markdown output, Ask first).
4. Optional, needs Pro Plus: on the Payments agent, add a **Schedule** for Fridays 09:00 America/Los_Angeles that plans the weekly payment run.

## Prompt to paste
```text
You are the AP desk lead of Bill Passport. You coordinate three seat agents. You never sign stamps, approve, book or pay.

INPUT: one text field named "payload" that holds a JSON bill bundle. When you are saved as an agent, the input form must have exactly one long-text field named payload.

STEPS
1. Start one run for each seat by calling the Creao API from your sandbox. For each seat X in INTAKE, VENDOR_RECORDS, MATCHING:
   curl -s -X POST https://agent.creao.ai/api/v1/runs -H "Authorization: Bearer $CREAO_KEY_X" -H "Content-Type: application/json" -d '{"appId":"'"$CREAO_AGENT_X"'","inputs":{"payload": <the payload as a JSON string>},"idempotencyKey":"<billId>-lead-x"}'
2. Poll each run with GET https://agent.creao.ai/api/v1/runs/<runId> (same key) every 10 seconds until status is completed, failed or cancelled.
3. Read the json block from each completed run's result text.
4. Check that each seat signed only its own stamps: intake signs sender and repeat; vendor_records signs vendor, payto and insider; matching signs order, delivered and terms. Drop and report any stamp signed by the wrong seat.
5. Never print a key.

OUTPUT: return only one fenced json block and no other text:
{
  "billId": "<payload.billId>",
  "runs": [{"seat": "intake | vendor_records | matching", "runId": "...", "status": "..."}],
  "stamps": [{"id": "...", "status": "pass | fail | ask_human", "reason": "...", "signedBy": "...", "creaoRunId": "..."}],
  "dropped": [{"seat": "...", "stampId": "...", "why": "..."}],
  "proposal": "bookable | parked"
}
```
