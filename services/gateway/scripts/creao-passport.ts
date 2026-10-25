// Run the Creao seat agents on one bill. Each run gets a ticket scoped to its seat and bill. The agents
// fetch what they need through the gateway's tools and submit their stamps there; the gateway checks,
// signs and logs them. The gateway's passport is the result, not the agents' own text.
// Intake reads the raw email and PDF first; Vendor-Records and Matching start once it has recorded the bill.
// Usage: npm run creao:passport [billId]   (needs the API running: npm run api)
import { fileURLToPath } from "node:url";
import { createCreaoClient } from "../src/integrations/creao/client.ts";
import { ALL_STAMPS, SEATS, type Seat } from "../src/gateway/seats.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
try {
  process.loadEnvFile(`${root}.env`);
} catch {
  // .env is optional when the variables are already exported.
}

const AGENT_ENV: Record<Seat, string> = {
  intake: "CREAO_AGENT_INTAKE",
  vendor_records: "CREAO_AGENT_VENDOR_RECORDS",
  matching: "CREAO_AGENT_MATCHING",
};
const billId = process.argv[2] ?? "B-2026-10-0143";
const api = process.env.BP_API_URL ?? `http://localhost:${process.env.PORT ?? 8787}`;
const inputField = process.env.CREAO_INPUT_FIELD ?? "payload";
// With seeded bills (BP_SEED_BILLS=1) every seat can start at once; otherwise the others wait for Intake.
const intakeFirst = process.env.BP_SEED_BILLS !== "1";
const seats = (Object.keys(SEATS) as Seat[]).filter((s) => process.env[AGENT_ENV[s]]);
if (!seats.length) {
  console.error("Set CREAO_API_KEY and at least CREAO_AGENT_INTAKE in .env (see .env.example).");
  process.exit(1);
}

async function admin(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.BP_ADMIN_KEY ?? ""}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} returned ${res.status}: ${json.error ?? ""}`);
  return json;
}

const creao = createCreaoClient({ apiKey: process.env.CREAO_API_KEY ?? "", baseUrl: process.env.CREAO_BASE_URL });
const t0 = Date.now();
const at = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;

await admin("DELETE", `/admin/passports/${billId}`);
let lastSeq = (await admin("GET", `/admin/events?billId=${billId}`)).events.at(-1)?.seq ?? 0;
let extracted: any;

// Show each tool call and stamp decision as it happens.
function describe(e: any): string {
  const d = e.data ?? {};
  if (e.type === "tool_call") return `${e.seat} -> ${d.tool} ${Object.values(d.args ?? {}).flat().filter(Boolean).join(" ")}`.trim();
  if (e.type === "tool_denied") return `${e.seat} -> ${d.tool} DENIED: ${d.reason}`;
  if (e.type === "tool_error") return `${e.seat} -> ${d.tool} error: ${[d.error].flat().join("; ")}`;
  if (e.type === "bill_extracted") return `${e.seat} recorded the bill it read: ${d.matched}/${d.total} fields match the answer key`;
  if (e.type === "stamp_signed") return `${e.seat} signed ${d.id}: ${d.status} (${d.grounded} values found in tool output)`;
  if (e.type === "stamp_rejected") return `${e.seat} REJECTED ${d.id}: ${(d.problems ?? []).join("; ")}`;
  return "";
}
async function printNewEvents() {
  const { events } = await admin("GET", `/admin/events?billId=${billId}&sinceSeq=${lastSeq}`);
  for (const e of events) {
    lastSeq = e.seq;
    if (e.type === "bill_extracted") extracted = e.data;
    const line = describe(e);
    if (line) console.log(`${at()} ${line}`);
  }
}
const ticker = setInterval(() => printNewEvents().catch(() => {}), 2_000);

async function runSeat(seat: Seat) {
  const { ticket } = await admin("POST", "/admin/tickets", { seat, billId });
  try {
    const started = await creao.startRun({
      appId: String(process.env[AGENT_ENV[seat]]),
      inputs: { [inputField]: JSON.stringify({ billId, ticket }) },
      idempotencyKey: `${billId}-${seat}-${t0}`,
    });
    await admin("POST", "/admin/tickets/run", { ticket, runId: started.id });
    console.log(`${at()} ${seat}: started Creao run ${started.id}`);
    const run = await creao.waitForRun(started.id);
    console.log(`${at()} ${seat}: run ${run.status}${run.errorCode ? ` (${run.errorCode})` : ""}`);
    return { seat, run };
  } finally {
    // A finished run must not keep writing to this passport.
    await admin("POST", "/admin/tickets/revoke", { ticket }).catch(() => {});
  }
}

const jobs: Promise<{ seat: Seat; run: any }>[] = [];
const later = seats.filter((s) => s !== "intake");
if (intakeFirst && seats.includes("intake")) {
  const intake = runSeat("intake");
  jobs.push(intake);
  // Start the others as soon as Intake has recorded the bill, not when its whole run ends.
  let intakeDone = false;
  intake.finally(() => (intakeDone = true)).catch(() => {});
  while (!extracted && !intakeDone) await new Promise((r) => setTimeout(r, 1_000));
  if (extracted) jobs.push(...later.map(runSeat));
  else console.log(`${at()} Intake finished without recording the bill, so ${later.join(" and ")} did not start.`);
} else {
  jobs.push(...seats.map(runSeat));
}

const settled = await Promise.allSettled(jobs);
clearInterval(ticker);
await printNewEvents();
const runs = settled.flatMap((r) => {
  if (r.status === "fulfilled") return [r.value];
  console.log(`a seat failed: ${(r.reason as Error)?.message ?? r.reason}`);
  return [];
});

const passport = await admin("GET", `/admin/passports/${billId}`);
const { events, chainBrokenAt } = await admin("GET", `/admin/events?billId=${billId}`);
console.table(
  ALL_STAMPS.map((id) => {
    const st = passport.stamps[id];
    return {
      stamp: id,
      status: st?.status ?? "missing",
      signedBy: st?.signedBy ?? "",
      signature: st ? `${st.signature.slice(0, 12)}...` : "",
      reason: st?.reason ?? "",
    };
  }),
);
if (extracted) {
  console.log(
    `Intake read the email and PDF: ${extracted.matched}/${extracted.total} fields match the answer key` +
      (extracted.mismatches.length ? ` (differs on ${extracted.mismatches.join(", ")})` : ""),
  );
}
for (const { seat, run } of runs) {
  const calls = events.filter((e: any) => e.seat === seat && e.data?.runId === run.id && e.type === "tool_call").length;
  const signed = SEATS[seat].stamps.filter((id) => passport.stamps[id]?.creaoRunId === run.id).length;
  console.log(`${seat}: ${calls} tool calls, ${signed}/${SEATS[seat].stamps.length} stamps signed by the gateway (run ${run.id})`);
}
const verdict =
  passport.status === "bookable"
    ? "BOOKABLE: all 8 stamps pass."
    : passport.status === "parked"
      ? `PARKED: not booked. Open stamps: ${passport.open.join(", ")}${passport.askedWho.length ? `. Ask: ${passport.askedWho.join(", ")}` : ""}`
      : `CHECKING: missing stamps ${passport.missing.join(", ")}`;
console.log(`${at()} ${verdict}`);
console.log(`Event log hash chain: ${chainBrokenAt === null ? "intact" : `broken at event ${chainBrokenAt}`}`);
