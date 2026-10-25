// CRS sandbox client. Only the exact test-persona bodies in allowlist.json may be sent:
// anything else can reach the real vendor and be billed. Request headers (token) are never stored or logged.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type CrsProduct = "fraud_finder" | "tu_identity_verification" | "reverse_phone" | "pitchpoint";
export type CrsPurpose = "bank_change" | "new_vendor";
export type CheckResult = "pass" | "fail" | "step_up";

interface AllowedRequest {
  method: string;
  path: string;
  body: unknown;
  expected?: string;
}

interface Persona {
  name: string;
  profile: string;
  requests: Partial<Record<CrsProduct, AllowedRequest>>;
}

export interface CrsCall {
  callId: string;
  persona: string;
  product: CrsProduct;
  purpose: CrsPurpose;
  billId?: string;
  at: string;
  httpStatus: number;
  response: unknown;
}

export interface CrsLogEntry {
  callId: string;
  persona: string;
  product: CrsProduct;
  purpose: CrsPurpose;
  billId?: string;
  at: string;
  cached: boolean;
  summary: string;
}

export interface CrsFact {
  field: string;
  value: string;
}

export interface CrsCheck {
  product: CrsProduct;
  callId: string;
  cached: boolean;
  result: CheckResult;
  line: string;
  facts: CrsFact[];
  // Ready to copy into a stamp: field is the exact path in the stored CRS response.
  evidence: { source: "crs"; field: string; value: string; ref: string }[];
}

interface Store {
  calls: Record<string, CrsCall>;
  cache: Record<string, string>;
  log: CrsLogEntry[];
}

const allowlist: { personas: Record<string, Persona> } = JSON.parse(
  readFileSync(new URL("./allowlist.json", import.meta.url), "utf8"),
);

// Fraud Finder: AtData suggests treating 70-80 and above as high risk.
const HIGH_RISK_SCORE = 70;

export class CrsError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CrsError";
    this.status = status;
  }
}

export function isAllowedPersona(persona: string): boolean {
  return Object.hasOwn(allowlist.personas, persona);
}

// Reads "a.b[0].c" style paths, the same form agents cite in evidence.field.
export function getPath(obj: unknown, path: string): unknown {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

function fact(response: unknown, field: string): CrsFact[] {
  const v = getPath(response, field);
  return v === undefined || v === null || typeof v === "object" ? [] : [{ field, value: String(v) }];
}

export function summarize(
  product: CrsProduct,
  response: unknown,
  personaName: string,
): Omit<CrsCheck, "product" | "callId" | "cached" | "evidence"> {
  if (product === "fraud_finder") {
    const score = Number(getPath(response, "risk.score"));
    const owner = getPath(response, "risk.phone.owner");
    const facts = [
      ...fact(response, "risk.score"),
      ...fact(response, "eam.date_first_seen"),
      ...fact(response, "risk.phone.line_type"),
      ...fact(response, "risk.phone.prepaid"),
      ...fact(response, "email_validation.status"),
      ...(owner && typeof owner === "object" ? Object.keys(owner).flatMap((k) => fact(response, `risk.phone.owner.${k}`)) : []),
    ];
    if (!Number.isFinite(score)) return { result: "fail", line: "Fraud Finder returned no risk score.", facts };
    const extras = facts.filter((f) => f.field !== "risk.score").map((f) => `${f.field.split(".").pop()} ${f.value}`);
    return {
      result: score >= HIGH_RISK_SCORE ? "fail" : "pass",
      line: `Fraud risk ${score}/100${extras.length ? ` (${extras.join(", ")})` : ""}.`,
      facts,
    };
  }

  if (product === "tu_identity_verification") {
    const base = "addOnProducts[0].idManagerVerification.messages";
    const messages = getPath(response, base);
    if (!Array.isArray(messages)) return { result: "fail", line: "Identity check returned no verification messages.", facts: [] };
    const facts = [
      ...fact(response, `${base}.length`),
      ...messages.flatMap((_, i) => [...fact(response, `${base}[${i}].code`), ...fact(response, `${base}[${i}].text`)]),
    ];
    if (!messages.length) return { result: "pass", line: "Identity verified: TransUnion returned no problems.", facts };
    // 2401 is a fraud alert: ask for more proof instead of failing outright.
    const onlyFraudAlert = messages.every((m: any) => String(m?.code) === "2401");
    return {
      result: onlyFraudAlert ? "step_up" : "fail",
      line: `Identity ${onlyFraudAlert ? "needs step-up" : "failed"}: ${messages.map((m: any) => `${m?.code} ${m?.text ?? ""}`.trim()).join("; ")}.`,
      facts,
    };
  }

  if (product === "reverse_phone") {
    const records = getPath(response, "data.records");
    const facts = [...fact(response, "data.transactionId"), ...fact(response, "data.records.length")];
    if (!Array.isArray(records) || !records.length) {
      return { result: "fail", line: `Reverse phone: no owner on record, so the number cannot be tied to ${personaName}.`, facts };
    }
    facts.push(...["firstName", "lastName", "city", "state"].flatMap((k) => fact(response, `data.records[0].${k}`)));
    const owner = `${records[0]?.firstName ?? ""} ${records[0]?.lastName ?? ""}`.trim().toUpperCase();
    return owner === personaName.toUpperCase()
      ? { result: "pass", line: `Reverse phone: the number belongs to ${owner}.`, facts }
      : { result: "fail", line: `Reverse phone: the number belongs to ${owner || "someone else"}, not ${personaName}.`, facts };
  }

  return { result: "pass", line: "PitchPoint response stored.", facts: [] };
}

export function createCrsClient(opts: { username: string; password: string; baseUrl?: string; storePath: string }) {
  const base = (opts.baseUrl ?? "https://api-sandbox.stitchcredit.com/api").replace(/\/+$/, "");
  const store: Store = existsSync(opts.storePath)
    ? JSON.parse(readFileSync(opts.storePath, "utf8"))
    : { calls: {}, cache: {}, log: [] };
  let token = "";

  function save() {
    mkdirSync(dirname(opts.storePath), { recursive: true });
    writeFileSync(opts.storePath, JSON.stringify(store, null, 1));
  }

  async function login(): Promise<string> {
    if (!opts.username || !opts.password) throw new CrsError("CRS_USERNAME and CRS_PASSWORD are not set in .env", 503);
    const res = await fetch(`${base}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: opts.username, password: opts.password }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.token !== "string") throw new CrsError(`CRS login returned ${res.status}`, 502);
    return body.token;
  }

  async function send(req: AllowedRequest, retry = true): Promise<{ status: number; body: unknown }> {
    token ||= await login();
    const res = await fetch(`${base}${req.path}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(req.body),
    });
    if (res.status === 401 && retry) {
      token = "";
      return send(req, false);
    }
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text };
    }
  }

  // One product for one allowlisted persona, cached per persona + product so the demo never waits on CRS.
  async function call(persona: string, product: CrsProduct, purpose: CrsPurpose, billId?: string) {
    const req = allowlist.personas[persona]?.requests[product];
    if (!req) throw new CrsError(`${persona} / ${product} is not on the CRS allowlist`, 400);
    const cacheKey = `${persona}:${product}`;
    let entry = store.calls[store.cache[cacheKey] ?? ""];
    const cached = entry !== undefined;
    if (!entry) {
      const { status, body } = await send(req);
      if (status >= 400) {
        const codes = (body as any)?.codes;
        throw new CrsError(`CRS ${product} returned ${status}${Array.isArray(codes) ? ` ${codes.join(",")}` : ""}`, 502);
      }
      entry = { callId: randomUUID(), persona, product, purpose, billId, at: new Date().toISOString(), httpStatus: status, response: body };
      store.calls[entry.callId] = entry;
      store.cache[cacheKey] = entry.callId;
    }
    const summary = summarize(product, entry.response, allowlist.personas[persona].name);
    store.log.push({ callId: entry.callId, persona, product, purpose, billId, at: new Date().toISOString(), cached, summary: summary.line });
    save();
    return { entry, cached, summary };
  }

  // The bank-change chain (master section 5): Fraud Finder, then identity, then reverse phone.
  async function verifyRequester(persona: string, purpose: CrsPurpose, billId?: string) {
    const checks: CrsCheck[] = [];
    for (const product of ["fraud_finder", "tu_identity_verification", "reverse_phone"] as const) {
      const { entry, cached, summary } = await call(persona, product, purpose, billId);
      const evidence = summary.facts.map((f) => ({ source: "crs" as const, field: f.field, value: f.value, ref: entry.callId }));
      checks.push({ product, callId: entry.callId, cached, ...summary, evidence });
    }
    const decision = checks.some((c) => c.result === "fail")
      ? "hold"
      : checks.some((c) => c.result === "step_up")
        ? "step_up"
        : "clear";
    return {
      persona,
      name: allowlist.personas[persona].name,
      purpose,
      billId,
      decision,
      howToCite: "Copy the evidence objects from each check into your stamp unchanged. The gateway rejects any other CRS field or value.",
      checks,
    };
  }

  // Gateway citation check: the callId must exist and the cited value must match the stored response exactly.
  function checkCitation(callId: string, field: string, value: string): boolean {
    const entry = store.calls[callId];
    if (!entry) return false;
    const actual = getPath(entry.response, field);
    return actual !== undefined && actual !== null && typeof actual !== "object" && String(actual) === value;
  }

  return {
    call,
    verifyRequester,
    checkCitation,
    getCall: (callId: string): CrsCall | undefined => store.calls[callId],
    log: (): CrsLogEntry[] => store.log,
  };
}
