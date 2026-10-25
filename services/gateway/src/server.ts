// Bill Passport API: the gateway between the Creao seat agents and the company's data, CRS and the passport.
// Seat agents call /tools/* with a run ticket. Our backend calls /admin/* with BP_ADMIN_KEY, from this machine only.
// The dashboard calls /dashboard/* with BP_DASHBOARD_KEY (added by the Vite dev proxy), also from this machine only.
// Usage: pnpm gateway   (then pnpm tunnel for a public URL the Creao agents can reach)
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCreaoClient } from "./integrations/creao/client.ts";
import { createCrsClient, CrsError, getPath, isAllowedPersona, type CrsPurpose } from "./integrations/crs/client.ts";
import * as company from "./company/store.ts";
import { createViews, SCAM_CONSOLE_PERSONAS } from "./dashboard/views.ts";
import { createEventLog, type LogEvent } from "./gateway/eventlog.ts";
import { checkShape, createExtractions, score } from "./gateway/extractions.ts";
import { createLedger } from "./gateway/ledger.ts";
import { createPassports } from "./gateway/passports.ts";
import { createDecisions, DECISION_KINDS, DECISION_ROLES, type DecisionKind, type DecisionRole } from "./gateway/decisions.ts";
import { createRuleBooks, RuleBookError, seatForStamp, type RuleChange } from "./gateway/rulebooks.ts";
import { ASKED_WHO, SEATS, SOURCE_TOOLS, isSeat, type Seat } from "./gateway/seats.ts";
import { createSigner } from "./gateway/signing.ts";
import { createTickets, type Ticket } from "./gateway/tickets.ts";
import { createTunnelProbe } from "./gateway/tunnel.ts";
import { createOrchestrator } from "./orchestrator/agent.ts";
import { createSeatRunner } from "./orchestrator/seatRunner.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
try {
  process.loadEnvFile(`${root}.env`);
} catch {
  // .env is optional when the variables are already exported.
}

// The admin key never goes to Creao. Agents get only BP_GATEWAY_URL and a per-run ticket.
const adminKey = process.env.BP_ADMIN_KEY ?? "";
if (adminKey.length < 24) {
  console.error("Set BP_ADMIN_KEY (24+ characters) in .env.");
  process.exit(1);
}

const dataDir = process.env.BP_DATA_DIR ?? `${root}.data`;
company.useDataDir(dataDir);
const crs = createCrsClient({
  username: process.env.CRS_USERNAME ?? "",
  password: process.env.CRS_PASSWORD ?? "",
  baseUrl: process.env.CRS_BASE_URL,
  storePath: process.env.CRS_STORE_PATH ?? `${dataDir}/crs-store.json`,
});
const events = createEventLog(`${dataDir}/events.jsonl`);
const decisions = createDecisions(`${dataDir}/decisions.json`);
const passports = createPassports(`${dataDir}/passports.json`, decisions.isApproved);
const ruleBooks = createRuleBooks({ fixedDir: new URL("../rulebooks/", import.meta.url), storePath: `${dataDir}/rulebooks/learned.json` });
const extractions = createExtractions(`${dataDir}/extracted.json`);
// BP_SEED_BILLS=1 serves the seeded bill to every seat (the pre-inbox flow), for tests only.
const seedBills = process.env.BP_SEED_BILLS === "1";
const signer = createSigner(`${dataDir}/keys`);
const tickets = createTickets();
const ledger = createLedger(`${dataDir}/ledger.json`);
const bpScript = readFileSync(new URL("../tools/bp.sh", import.meta.url), "utf8");
const dashboardKey = process.env.BP_DASHBOARD_KEY ?? "";

const views = createViews({ crs, events, extractions, ledger, passports, decisions });
const tunnel = createTunnelProbe({ fallbackUrl: process.env.BP_GATEWAY_URL, metricsUrl: process.env.CLOUDFLARED_METRICS_URL });
const seatRunner = createSeatRunner({
  creao: process.env.CREAO_API_KEY?.startsWith("capi_") ? createCreaoClient({ apiKey: process.env.CREAO_API_KEY, baseUrl: process.env.CREAO_BASE_URL }) : undefined,
  agentIds: {
    intake: process.env.CREAO_AGENT_INTAKE,
    vendor_records: process.env.CREAO_AGENT_VENDOR_RECORDS,
    matching: process.env.CREAO_AGENT_MATCHING,
  },
  inputField: process.env.CREAO_INPUT_FIELD ?? "payload",
  tickets,
  events,
  extractions,
  passports,
  tunnel: () => tunnel.current(),
});

// One line per event for live progress, the same wording as the passport script prints.
function describeEvent(e: LogEvent): string {
  const d: any = e.data ?? {};
  const args = Object.values(d.args ?? {}).flat().filter(Boolean).join(" ");
  if (e.type === "tool_call") return `${d.tool}${args ? ` ${args}` : ""}${d.decision ? ` -> ${d.decision}` : ""}`;
  if (e.type === "tool_denied") return `${d.tool} denied: ${d.reason}`;
  if (e.type === "tool_error") return `${d.tool} error: ${[d.error].flat().join("; ")}`;
  if (e.type === "bill_extracted") {
    return d.total ? `recorded the bill it read (${d.matched}/${d.total} fields match the answer key)` : "recorded the bill it read (uploaded bill, no answer key)";
  }
  if (e.type === "stamp_signed") return `signed ${d.id}: ${d.status}`;
  if (e.type === "stamp_rejected") return `stamp ${d.id} rejected: ${(d.problems ?? []).join("; ")}`;
  return "";
}

// The POs a bill names, who owns each, and who approves a change, so the orchestrator can say who must act.
// It reads the bill the way the seats do: what Intake recorded (the seed bill in seed mode), not the answer key.
function purchaseOrderFor(billId: string) {
  const bill = company.getBill(billId);
  if (!bill) return { billId, purchaseOrders: [], note: `${billId} is not a bill in the inbox.` };
  const fields = seedBills ? bill : extractions.get(billId)?.fields;
  if (!fields) return { billId, purchaseOrders: [], note: "Intake has not recorded this bill yet, so no PO has been read from it." };
  const named = company.poRefs(String(fields.poNumber ?? ""));
  if (!named.length) return { billId, purchaseOrders: [], note: "The bill names no PO." };
  const billVendors = new Set(company.searchVendors(String(fields.vendorName ?? "")).map((v: any) => v.vendorId));
  const purchaseOrders = named.map((ref) => {
    const po = company.findPo(ref);
    if (!po) return { poNumber: ref, found: false, note: "No purchase order with this number is on file." };
    // A bill can name a real PO that belongs to another vendor; nobody should approve a change on that.
    return { ...po, found: true, poVendor: company.getVendor(po.vendorId)?.legalName, vendorMatches: billVendors.has(po.vendorId) };
  });
  return { billId, vendorName: fields.vendorName, purchaseOrders, changeApproval: company.poChangeApproval() };
}

const orchestrator = createOrchestrator({
  listBills: () => Object.keys(company.allBills()).map((id) => views.billSummary(id)),
  runSeat: (seat, billId, onEvent) => seatRunner.run(seat, billId, onEvent),
  passport: (billId) => views.passport(billId),
  audit: (billId) => views.auditTrail(billId),
  purchaseOrder: purchaseOrderFor,
  describe: describeEvent,
  readRulebook: (seat) => ruleBooks.render(seat),
  updateRulebook: (change) => changeRuleBook(change, "orchestrator"),
  decisionsFor: (billId) => decisions.forBill(billId),
});

// Master section 9: call CRS only for new vendors and bank-detail changes, never on every bill.
const PURPOSES = new Set<CrsPurpose>(["bank_change", "new_vendor"]);
const STATUSES = new Set(["pass", "fail", "ask_human"]);
const BODY_LIMIT = 64 * 1024;
// Uploads arrive as base64 JSON: 8 MB of files is about 11 MB on the wire.
const UPLOAD_BODY_LIMIT = 12 * 1024 * 1024;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Tunnel traffic reaches us from localhost too, so refuse anything that carries proxy headers.
function hasKey(req: IncomingMessage, key: string): boolean {
  if (!key || req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]) return false;
  const got = Buffer.from(String(req.headers.authorization ?? ""));
  const want = Buffer.from(`Bearer ${key}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
const isAdmin = (req: IncomingMessage) => hasKey(req, adminKey);
const isDashboard = (req: IncomingMessage) => hasKey(req, dashboardKey) || isAdmin(req);

// The gateway books a bill itself once every stamp passes: debit Expense, credit Accounts Payable.
function bookIfReady(billId: string) {
  if (passports.summary(billId).status !== "bookable" || ledger.forBill(billId)) return;
  const fields = seedBills ? company.getBill(billId) : extractions.get(billId)?.fields;
  // A new vendor is not on file; once a person approves the vendor stamp, book it under a provisional ID.
  const vendor =
    company.searchVendors(fields?.vendorName ?? "")[0] ??
    (decisions.isApproved(billId, "vendor") && fields?.vendorName
      ? { vendorId: `V-NEW-${String(fields.vendorName).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`, legalName: fields.vendorName }
      : undefined);
  const amountCents = Math.round(Number(String(fields?.totalAmount ?? "").replace(/[$,\s]/g, "")) * 100);
  if (!vendor || !(amountCents > 0)) {
    events.append("booking_skipped", { billId, data: { reason: !vendor ? "vendor not found" : "no amount" } });
    return;
  }
  const entry = ledger.book(billId, vendor.vendorId, amountCents, `${fields.invoiceNumber} from ${vendor.legalName}`);
  events.append("bill_booked", { billId, data: { entryId: entry.entryId, amountCents, lines: entry.lines } });
}

// The site PM can decide the stamps about the job itself; anything about who gets paid needs the Controller.
const PM_STAMPS = new Set(["order", "delivered", "terms"]);

// Every rule ID cited in signed stamp reasons, so the dashboard can show how often each rule is used.
function ruleUses(): Record<string, number> {
  const uses: Record<string, number> = {};
  for (const e of events.list({})) {
    if (e.type !== "stamp_signed") continue;
    const reason = passports.summary(e.billId ?? "").stamps[(e.data as any)?.id]?.reason ?? "";
    for (const id of new Set(reason.match(/\b[IVM]-\d+\b/g) ?? [])) uses[id] = (uses[id] ?? 0) + 1;
  }
  return uses;
}

function ruleBookViews() {
  const uses = ruleUses();
  return (Object.keys(SEATS) as Seat[]).map((seat) => ({
    seat,
    title: ruleBooks.title(seat),
    markdown: ruleBooks.render(seat),
    learned: ruleBooks.learned(seat).map((r) => ({ ...r, timesUsed: uses[r.id] ?? 0 })),
  }));
}

// Add, replace or remove one learned rule, and log it on the bill it came from.
function changeRuleBook(change: RuleChange, by: "orchestrator" | "dashboard") {
  try {
    const { rule, removed } = ruleBooks.apply(change);
    const r = rule ?? removed!;
    const type = change.action === "add" ? "rule_added" : change.action === "replace" ? "rule_replaced" : "rule_removed";
    events.append(type, { billId: r.sourceBillId, seat: r.seat, data: { ruleId: r.id, stamp: r.stamp, scope: r.scope, text: r.text, by } });
    return { ok: true, action: change.action, rule: r, rulebook: ruleBooks.render(r.seat) };
  } catch (e) {
    if (e instanceof RuleBookError) throw new HttpError(400, e.message);
    throw e;
  }
}

// Server-Sent Events for the dashboard's agent panel.
function openStream(res: ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  return (type: string, data: unknown) => {
    if (!res.writableEnded && !res.destroyed) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

async function dashboard(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  let m: RegExpExecArray | null;
  if (req.method === "GET" && path === "/dashboard/bills") {
    send(res, 200, Object.keys(company.allBills()).map((id) => views.billSummary(id)));
    return true;
  }
  if (req.method === "GET" && (m = /^\/dashboard\/bills\/([\w-]+)(?:\/(passport|audit))?$/.exec(path))) {
    const [, billId, part] = m;
    if (!company.getBill(billId)) throw new HttpError(404, `unknown bill ${billId}`);
    if (!part) send(res, 200, views.billSummary(billId));
    else if (part === "audit") send(res, 200, views.auditTrail(billId));
    else {
      const p = views.passport(billId);
      p ? send(res, 200, p) : send(res, 404, { error: "no stamps yet" });
    }
    return true;
  }
  // Whether Creao agents can reach this gateway right now, for a status badge on the dashboard.
  if (req.method === "GET" && path === "/dashboard/status") {
    send(res, 200, { gateway: "ok", tunnel: await tunnel.current() });
    return true;
  }
  if (req.method === "GET" && path === "/dashboard/intake/week") {
    send(res, 200, views.weekIntake());
    return true;
  }
  // A new bill from the dashboard: the raw files land in the AP inbox exactly as uploaded.
  if (req.method === "POST" && path === "/dashboard/inbox") {
    const { files } = await readJson(req, UPLOAD_BODY_LIMIT);
    if (!Array.isArray(files) || files.length < 1 || files.length > 5) throw new HttpError(400, "send 1 to 5 files");
    const decoded = files.map((f: any) => {
      const name = String(f?.name ?? "");
      const ext = extname(name).toLowerCase();
      if (!company.UPLOAD_TYPES[ext]) throw new HttpError(400, `${name || "a file"}: only .pdf, .eml and .txt files are accepted`);
      const data = Buffer.from(String(f?.dataBase64 ?? ""), "base64");
      if (!data.length) throw new HttpError(400, `${name}: the file is empty`);
      if (data.length > 4 * 1024 * 1024) throw new HttpError(413, `${name}: files must be 4 MB or smaller`);
      if (ext === ".pdf" && data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, `${name}: this is not a PDF`);
      return { name, data };
    });
    if (decoded.reduce((s, f) => s + f.data.length, 0) > 8 * 1024 * 1024) throw new HttpError(413, "all files together must be 8 MB or smaller");
    const bill = company.addUploadedBill(decoded);
    events.append("bill_received", { billId: bill.billId, data: { channel: "upload", files: bill.files } });
    send(res, 201, views.billSummary(bill.billId));
    return true;
  }
  if (req.method === "GET" && path === "/dashboard/crs/log") {
    send(res, 200, views.crsLog());
    return true;
  }
  if (req.method === "GET" && path === "/dashboard/crs/personas") {
    send(res, 200, await Promise.all(SCAM_CONSOLE_PERSONAS.map((p) => views.crsChain(p))));
    return true;
  }
  if (req.method === "POST" && (m = /^\/dashboard\/crs\/chain\/(P\d{2})$/.exec(path))) {
    if (!isAllowedPersona(m[1])) throw new HttpError(400, "not an allowlisted CRS test persona");
    send(res, 200, await views.crsChain(m[1]));
    return true;
  }
  // A person's decision on one stamp, from the Check page. Recorded as code, not by the orchestrator, so the
  // bill moves on even if the agent is slow; the orchestrator then turns the note into a rule.
  if ((m = /^\/dashboard\/bills\/([\w-]+)\/decisions$/.exec(path))) {
    const billId = m[1];
    if (!company.getBill(billId)) throw new HttpError(404, `unknown bill ${billId}`);
    if (req.method === "GET") {
      send(res, 200, decisions.forBill(billId));
      return true;
    }
    if (req.method !== "POST") return false;
    const { stampId, decision, byRole, note } = await readJson(req);
    const stamp = passports.summary(billId).stamps[stampId];
    if (!stamp) throw new HttpError(400, `${stampId} has not been signed on this bill yet`);
    if (stamp.status === "pass") throw new HttpError(400, `${stampId} already passed; there is nothing to decide`);
    if (!DECISION_KINDS.has(decision)) throw new HttpError(400, "decision must be approve, reject or escalate");
    if (!DECISION_ROLES.has(byRole)) throw new HttpError(400, "byRole must be controller or project_manager");
    if (typeof note !== "string" || !note.trim()) throw new HttpError(400, "say why in one line (note)");
    if (byRole === "project_manager" && decision !== "escalate" && !PM_STAMPS.has(stampId)) {
      throw new HttpError(403, `only the Controller can ${decision} ${stampId}; the site PM can decide ${[...PM_STAMPS].join(", ")}`);
    }
    if (ledger.forBill(billId)) throw new HttpError(409, "this bill is already booked");
    const recorded = { billId, stampId, decision: decision as DecisionKind, byRole: byRole as DecisionRole, note: note.trim().slice(0, 500), at: new Date().toISOString() };
    decisions.record(recorded);
    events.append("human_decision", { billId, data: { stampId, decision, byRole, note: recorded.note } });
    bookIfReady(billId);
    send(res, 200, { decision: recorded, bill: views.billSummary(billId), passport: views.passport(billId) });
    return true;
  }
  if (req.method === "GET" && path === "/dashboard/rulebooks") {
    send(res, 200, ruleBookViews());
    return true;
  }
  if (req.method === "DELETE" && (m = /^\/dashboard\/rulebooks\/([a-z_]+)\/rules\/([A-Z]-\d+)$/.exec(path))) {
    send(res, 200, changeRuleBook({ action: "remove", seat: m[1], ruleId: m[2] }, "dashboard"));
    return true;
  }
  if (req.method === "POST" && path === "/dashboard/agent/chat") {
    const { sessionId, message } = await readJson(req);
    if (typeof message !== "string" || !message.trim()) throw new HttpError(400, "message is required");
    const emit = openStream(res);
    try {
      await orchestrator.chat(typeof sessionId === "string" ? sessionId : undefined, message.slice(0, 4000), emit);
    } catch (e) {
      emit("error", { message: (e as Error).message });
    }
    emit("done", {});
    res.end();
    return true;
  }
  return false;
}

async function readJson(req: IncomingMessage, limit = BODY_LIMIT): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "body is not JSON");
  }
}

function deny(t: Ticket, tool: string, args: unknown, reason: string): never {
  t.misses++;
  events.append("tool_denied", { billId: t.billId, seat: t.seat, data: { tool, args, reason, runId: t.runId } });
  throw new HttpError(403, reason);
}

// A run that keeps finding nothing is guessing (one agent tried 150 PO numbers); stop its record searches.
// The checks a seat must still run are exempt, and the message names them, or the agent stops those too.
const MISS_BUDGET = 10;
const SEARCH_TOOLS = new Set(["vendors", "payments", "po", "receiving", "contracts"]);
const CHECKS_LEFT: Partial<Record<Seat, string>> = {
  intake: "record-bill, if you have not recorded the bill yet",
  vendor_records: "employee-match, and crs-verify only if the bank details changed or the vendor is new",
};

function mayUse(t: Ticket, tool: string, args: unknown) {
  if (!SEATS[t.seat].tools.includes(tool)) deny(t, tool, args, `the ${t.seat} seat may not use the ${tool} tool`);
  if (SEARCH_TOOLS.has(tool) && t.misses >= MISS_BUDGET) {
    const finish = CHECKS_LEFT[t.seat] ? `Still run your other checks (${CHECKS_LEFT[t.seat]}), then submit` : "Submit";
    deny(t, tool, args, `this run has made ${MISS_BUDGET} record lookups that found nothing or were refused, so stop searching for records. ${finish} your stamps: a missing record is itself the finding.`);
  }
}

// Serve a tool result to a seat: check the seat may use the tool, log the call, remember what was served.
function serve(res: ServerResponse, t: Ticket, tool: string, args: unknown, data: unknown, notFound = `${tool}: not found`) {
  mayUse(t, tool, args);
  if (data === undefined || data === null || (tool === "vendors" && Array.isArray(data) && data.length === 0)) t.misses++;
  if (data === undefined || data === null) {
    events.append("tool_error", { billId: t.billId, seat: t.seat, data: { tool, args, error: "not found", runId: t.runId } });
    throw new HttpError(404, notFound);
  }
  events.append("tool_call", { billId: t.billId, seat: t.seat, data: { tool, args, runId: t.runId } });
  t.served.push({ tool, data });
  send(res, 200, data);
}

// A run may read only the records its own bill leads to, so an agent cannot scan other bills' POs and vendors.
function poForRun(t: Ticket, tool: string, args: unknown, asked: string): string {
  mayUse(t, tool, args);
  const fields = seedBills ? company.getBill(t.billId) : extractions.get(t.billId)?.fields;
  if (!fields) throw new HttpError(409, "Intake has not read this bill yet; try again shortly");
  const named = company.poRefs(String(fields.poNumber ?? ""));
  if (!named.length) deny(t, tool, args, "this bill names no PO, so there is no PO to read. Sign your stamps from that.");
  const key = (s: string) => company.poKey(s) ?? s.trim().toUpperCase();
  const hit = named.find((ref) => key(ref) === key(asked));
  if (!hit) deny(t, tool, args, `this run can read only the PO its bill names (${named.join(", ")}). Do not look up other PO numbers.`);
  return company.findPo(hit)?.poNumber ?? hit;
}

function vendorForRun(t: Ticket, tool: string, args: unknown, vendorId: string): string {
  mayUse(t, tool, args);
  const seen = t.served.some(({ data }) => (Array.isArray(data) ? data : [data]).some((d: any) => d?.vendorId === vendorId));
  if (!seen) deny(t, tool, args, `find the vendor first (vendor-search by name, or the vendorId on the bill's PO); ${vendorId} has not come up in this run.`);
  return vendorId;
}

const missingPo = (po: string) =>
  `No purchase order ${po} is on file. That is the finding: sign the stamp from it and do not search other PO numbers.`;

async function verifyRequester(body: any, t?: Ticket) {
  const { persona, purpose } = body;
  const billId = t?.billId ?? (typeof body.billId === "string" ? body.billId : undefined);
  const args = { persona, purpose };
  if (typeof persona !== "string" || !isAllowedPersona(persona)) {
    throw new HttpError(400, "persona must be an allowlisted CRS test persona id, such as P13");
  }
  if (!PURPOSES.has(purpose)) throw new HttpError(400, "purpose must be bank_change or new_vendor");
  if (t) {
    if (!SEATS[t.seat].tools.includes("crs")) deny(t, "crs", args, `the ${t.seat} seat may not call CRS`);
    // Permissible purpose: a seat may check only the people on its own bill.
    if (!company.personasForBill(t.billId, extractions.get(t.billId)?.fields).includes(persona)) {
      deny(t, "crs", args, `${persona} is not a contact on bill ${t.billId}`);
    }
  }
  try {
    const result = await crs.verifyRequester(persona, purpose, billId);
    console.log(`verify-requester ${persona} (${purpose}, bill ${billId ?? "-"}): ${result.decision}`);
    if (t) {
      events.append("tool_call", {
        billId: t.billId,
        seat: t.seat,
        data: { tool: "crs", args, decision: result.decision, callIds: result.checks.map((c) => c.callId), runId: t.runId },
      });
      t.served.push({ tool: "crs", data: result });
    }
    return result;
  } catch (e) {
    if (t) events.append("tool_error", { billId: t.billId, seat: t.seat, data: { tool: "crs", args, error: (e as Error).message, runId: t.runId } });
    throw e;
  }
}

// A cited value is grounded when the tool behind its source served exactly that value at that path.
// Paths may be written relative to one item of an array result, or with the tool name as a prefix.
// For raw inbox files there are no paths, so the value must appear verbatim in the file.
function grounded(t: Ticket, ev: any): boolean {
  const want = String(ev?.value ?? "");
  const field = String(ev?.field ?? "");
  if (!want || !field) return false;
  const tools = SOURCE_TOOLS[String(ev.source).toLowerCase()] ?? [];
  const paths = [field, field.replace(/^[A-Za-z_]+(?=[.[])\.?/, "")];
  return t.served
    .filter((s) => tools.includes(s.tool))
    .flatMap((s) => (Array.isArray(s.data) ? [s.data, ...s.data] : [s.data]))
    .some((data) =>
      typeof data === "string"
        ? data.includes(want)
        : paths.some((p) => {
            const v = getPath(data, p);
            return v !== undefined && v !== null && (typeof v === "object" ? JSON.stringify(v) : String(v)) === want;
          }),
    );
}

// What Intake recorded, as the other seats see it, with the CRS persona looked up from the contact.
function billFor(t: Ticket): any {
  if (seedBills) return company.getBill(t.billId);
  const e = extractions.get(t.billId);
  if (!e) {
    events.append("tool_error", { billId: t.billId, seat: t.seat, data: { tool: "bill", error: "not read yet", runId: t.runId } });
    throw new HttpError(409, "Intake has not read this bill yet; try again shortly");
  }
  const contact = e.fields.claimedContact ?? {};
  return {
    billId: t.billId,
    ...e.fields,
    claimedContact: { ...contact, crsPersona: company.personaForContact(contact) },
    extractedBy: e.extractedBy,
  };
}

function recordBill(t: Ticket, fields: any) {
  if (!SEATS[t.seat].tools.includes("record_bill")) deny(t, "record_bill", {}, `the ${t.seat} seat may not record bills`);
  const problems = checkShape(fields);
  if (problems.length) {
    events.append("tool_error", { billId: t.billId, seat: t.seat, data: { tool: "record_bill", error: problems, runId: t.runId } });
    throw new HttpError(400, problems.join("; "));
  }
  extractions.put({ billId: t.billId, fields, extractedBy: { seat: t.seat, runId: t.runId, at: new Date().toISOString() } });
  // Scored against the answer key for our proof page; the agent is never told the score.
  // Uploaded bills have no answer key, so they are recorded without a score.
  const truth = company.answerKey(t.billId);
  const result = truth ? score(fields, truth) : { matched: null, total: null, mismatches: [] };
  events.append("bill_extracted", { billId: t.billId, seat: t.seat, data: { ...result, runId: t.runId } });
  return { recorded: true, billId: t.billId, fields: Object.keys(fields).length };
}

function submitStamps(t: Ticket, body: any) {
  const stamps: any[] = Array.isArray(body?.stamps) ? body.stamps : [];
  if (!stamps.length) throw new HttpError(400, 'send {"stamps": [...]}');
  const seat = SEATS[t.seat];
  const results = stamps.map((st) => {
    const evidence: any[] = Array.isArray(st?.evidence) ? st.evidence : [];
    const source = (ev: any) => String(ev?.source ?? "").toLowerCase();
    // Anything pointing at a stored CRS call is a CRS citation, whatever its label says.
    const isCrs = (ev: any) => source(ev) === "crs" || Boolean(crs.getCall(String(ev?.ref ?? "")));
    const problems = [
      seat.stamps.includes(st?.id) ? "" : `the ${t.seat} seat may not sign "${st?.id}"`,
      STATUSES.has(st?.status) ? "" : "status must be pass, fail or ask_human",
      typeof st?.reason === "string" && st.reason.trim() ? "" : "reason is required",
      evidence.length ? "" : "evidence is required",
      st?.status !== "ask_human" || ASKED_WHO.has(st?.askedWho) ? "" : "askedWho must be controller, project_manager or vendor",
      ...evidence
        .filter((ev) => !seat.sources.includes(source(ev)))
        .map((ev) => `the ${t.seat} seat may not cite source "${ev?.source}"`),
      ...evidence
        .filter(isCrs)
        .filter((ev) => !crs.checkCitation(String(ev.ref ?? ""), String(ev.field ?? ""), String(ev.value ?? "")))
        .map((ev) => `CRS fact not in our CRS log: ${ev.field}=${ev.value}`),
    ].filter(Boolean);
    if (problems.length) {
      events.append("stamp_rejected", { billId: t.billId, seat: t.seat, data: { id: st?.id, problems, runId: t.runId } });
      return { id: st?.id, accepted: false, problems };
    }
    const nonCrs = evidence.filter((ev) => !isCrs(ev));
    const groundedCount = nonCrs.filter((ev) => grounded(t, ev)).length;
    const payload = {
      billId: t.billId,
      id: st.id,
      status: st.status,
      reason: st.reason,
      evidence,
      disagreement: st.disagreement,
      askedWho: st.status === "ask_human" ? st.askedWho : undefined,
      signedBy: t.seat,
      creaoRunId: t.runId,
      at: new Date().toISOString(),
    };
    const signed = { ...payload, signature: signer.sign(t.seat, payload) };
    passports.put(signed);
    events.append("stamp_signed", {
      billId: t.billId,
      seat: t.seat,
      data: { id: st.id, status: st.status, grounded: `${groundedCount}/${nonCrs.length}`, signature: signed.signature, runId: t.runId },
    });
    return { id: st.id, accepted: true, status: st.status, grounded: `${groundedCount}/${nonCrs.length} non-CRS values found exactly in tool output` };
  });
  bookIfReady(t.billId);
  return { billId: t.billId, results, passport: passports.summary(t.billId).status };
}

const server = createServer(async (req, res) => {
  // Collapse leading slashes so "//tools/bp" (a base URL with a trailing slash) is not read as a host.
  const url = new URL((req.url ?? "/").replace(/^\/+/, "/"), "http://localhost");
  const path = url.pathname;
  const q = (k: string) => url.searchParams.get(k) ?? "";
  try {
    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
    if (req.method === "GET" && path === "/tools/bp") {
      res.writeHead(200, { "Content-Type": "text/x-shellscript" });
      return res.end(bpScript);
    }
    if (req.method === "GET" && path === "/keys") return send(res, 200, signer.publicKeys());
    const skill = /^\/tools\/skills\/(?:(v[2-9])\/)?([a-z_]+)\.md$/.exec(path);
    if (req.method === "GET" && skill && isSeat(skill[2])) {
      const file = new URL(`../../../creao/agents/${skill[1] ?? "v2"}/${skill[2]}.md`, import.meta.url);
      try {
        const md = readFileSync(file, "utf8");
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
        return res.end(md);
      } catch {
        throw new HttpError(404, "no such skill");
      }
    }

    const t = tickets.read(req.headers.authorization);
    if (t) {
      let m: RegExpExecArray | null;
      if (req.method === "GET" && path === "/tools/inbox") return serve(res, t, "inbox", {}, company.inboxFiles(t.billId));
      // The seat's own rule book only; bp help prints it during setup.
      if (req.method === "GET" && path === "/tools/rulebook") {
        events.append("rulebook_read", { billId: t.billId, seat: t.seat, data: { rules: ruleBooks.learned(t.seat).map((r) => r.id), runId: t.runId } });
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
        return res.end(ruleBooks.render(t.seat));
      }
      if (req.method === "GET" && (m = /^\/tools\/inbox\/([\w.-]+)$/.exec(path))) {
        const name = m[1];
        if (!SEATS[t.seat].tools.includes("inbox")) deny(t, "inbox", { name }, `the ${t.seat} seat may not read the inbox`);
        const file = company.inboxFile(t.billId, name);
        if (!file) throw new HttpError(404, `inbox: no file ${name}`);
        events.append("tool_call", { billId: t.billId, seat: t.seat, data: { tool: "inbox", args: { name }, runId: t.runId } });
        t.served.push({ tool: "inbox", data: file.data.toString(name.endsWith(".pdf") ? "latin1" : "utf8") });
        res.writeHead(200, { "Content-Type": file.contentType, "Content-Length": file.data.length });
        return res.end(file.data);
      }
      if (req.method === "POST" && path === "/tools/bill") return send(res, 200, recordBill(t, await readJson(req)));
      if (req.method === "GET" && path === "/tools/bill") return serve(res, t, "bill", {}, billFor(t));
      if (req.method === "GET" && path === "/tools/vendors") {
        const args = { name: q("name") };
        mayUse(t, "vendors", args);
        // Count letters after the search's own cleanup, or "e llc" would search for one letter.
        if (company.vendorQuery(q("name")).replace(/\s/g, "").length < 3) deny(t, "vendors", args, "search with at least 3 letters of the vendor's name");
        return serve(res, t, "vendors", args, company.searchVendors(q("name")));
      }
      if (req.method === "GET" && (m = /^\/tools\/vendors\/([\w-]+)$/.exec(path))) {
        const args = { vendorId: m[1] };
        return serve(res, t, "vendors", args, company.getVendor(vendorForRun(t, "vendors", args, m[1])));
      }
      if (req.method === "GET" && path === "/tools/payments") {
        const args = { vendorId: q("vendorId") };
        return serve(res, t, "payments", args, company.paymentsFor(vendorForRun(t, "payments", args, q("vendorId"))));
      }
      if (req.method === "GET" && (m = /^\/tools\/po\/([\w-]+)$/.exec(path))) {
        const args = { poNumber: m[1] };
        const po = poForRun(t, "po", args, m[1]);
        // The owner is for the orchestrator; seats never see employee details (the insider check matches on them).
        const rec = company.getPo(po);
        return serve(res, t, "po", args, rec && { ...rec, owner: undefined }, missingPo(po));
      }
      if (req.method === "GET" && path === "/tools/receiving") {
        const args = { po: q("po") };
        return serve(res, t, "receiving", args, company.receivingFor(poForRun(t, "receiving", args, q("po"))));
      }
      if (req.method === "GET" && (m = /^\/tools\/contracts\/([\w-]+)$/.exec(path))) {
        const args = { vendorId: m[1] };
        return serve(res, t, "contracts", args, company.getContract(vendorForRun(t, "contracts", args, m[1])));
      }
      if (req.method === "GET" && path === "/tools/employees/match") {
        const args = {
          phones: url.searchParams.getAll("phone"),
          addresses: url.searchParams.getAll("address"),
          names: url.searchParams.getAll("name"),
        };
        if (![...args.phones, ...args.addresses, ...args.names].some((v) => v.trim())) {
          throw new HttpError(400, "give at least one --phone, --address or --name");
        }
        return serve(res, t, "employees", args, { matches: company.matchEmployees(args) });
      }
      if (req.method === "POST" && path === "/crs/verify-requester") return send(res, 200, await verifyRequester(await readJson(req), t));
      if (req.method === "POST" && path === "/tools/stamps") return send(res, 200, submitStamps(t, await readJson(req)));
      throw new HttpError(404, "no such tool");
    }

    if (path.startsWith("/dashboard/")) {
      if (!isDashboard(req)) return send(res, 401, { error: "unauthorized: the dashboard key is added by the local Vite proxy" });
      if (await dashboard(req, res, path)) return;
      throw new HttpError(404, "not found");
    }

    if (!isAdmin(req)) return send(res, 401, { error: "unauthorized: send a run ticket" });

    if (req.method === "POST" && path === "/admin/tickets") {
      const { seat, billId } = await readJson(req);
      if (!isSeat(seat)) throw new HttpError(400, `seat must be one of ${Object.keys(SEATS).join(", ")}`);
      if (!company.getBill(billId)) throw new HttpError(404, `unknown bill ${billId}`);
      const issued = tickets.issue(seat as Seat, billId);
      events.append("ticket_issued", { billId, seat, data: { expiresAt: issued.expiresAt } });
      return send(res, 200, issued);
    }
    if (req.method === "POST" && path === "/admin/tickets/run") {
      const { ticket, runId } = await readJson(req);
      return send(res, tickets.attachRun(String(ticket), String(runId)) ? 200 : 404, { ok: true });
    }
    // Runs one seat agent through the same runner the orchestrator uses, for scripts and tests.
    if (req.method === "POST" && path === "/admin/run-seat") {
      const { seat, billId } = await readJson(req);
      if (!isSeat(seat)) throw new HttpError(400, `seat must be one of ${Object.keys(SEATS).join(", ")}`);
      if (!company.getBill(billId)) throw new HttpError(404, `unknown bill ${billId}`);
      return send(res, 200, await seatRunner.run(seat, billId));
    }
    if (req.method === "POST" && path === "/admin/tickets/revoke") {
      const { ticket } = await readJson(req);
      return send(res, 200, { revoked: tickets.revoke(String(ticket)) });
    }
    let m: RegExpExecArray | null;
    if ((m = /^\/admin\/passports\/([\w-]+)$/.exec(path))) {
      if (req.method === "GET") return send(res, 200, passports.summary(m[1]));
      if (req.method === "DELETE") {
        const revoked = tickets.revokeBill(m[1]);
        passports.reset(m[1]);
        decisions.reset(m[1]);
        extractions.reset(m[1]);
        ledger.unbook(m[1]);
        events.append("passport_reset", { billId: m[1], data: { ticketsRevoked: revoked } });
        return send(res, 200, { ok: true, ticketsRevoked: revoked });
      }
    }
    if (req.method === "GET" && path === "/admin/events") {
      return send(res, 200, {
        chainBrokenAt: events.verify(),
        events: events.list({ billId: q("billId") || undefined, sinceSeq: Number(q("sinceSeq")) || undefined }),
      });
    }
    if (req.method === "POST" && path === "/crs/verify-requester") return send(res, 200, await verifyRequester(await readJson(req)));
    if (req.method === "GET" && path === "/crs/log") return send(res, 200, { log: crs.log() });
    if (req.method === "GET" && (m = /^\/crs\/calls\/([\w-]+)$/.exec(path))) {
      const call = crs.getCall(m[1]);
      return call ? send(res, 200, call) : send(res, 404, { error: "unknown callId" });
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    const status = e instanceof HttpError || e instanceof CrsError ? e.status : 500;
    if (status >= 500) console.error(`${req.method} ${path} -> ${status}: ${(e as Error).message}`);
    send(res, status, { error: (e as Error).message });
  }
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => console.log(`Bill Passport API on http://localhost:${port}`));
