// Calls to the Creao seat gateway (services/gateway), always through the Vite proxy at /dashboard/*.
// The proxy adds the dashboard key; nothing secret lives in the browser.

import type { AuditEvent, BillSummary, CrsChainResult, CrsDataUseEntry, DailyIntake, Passport, RuleBook, StampDecision } from "./types";

export class GatewayError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function requestGateway<ResponseBody>(path: string, init?: RequestInit): Promise<ResponseBody> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new GatewayError(0, "The gateway is not reachable. Start it with: corepack pnpm gateway");
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new GatewayError(response.status, body?.error ?? `Gateway answered ${response.status}`);
  return body as ResponseBody;
}

/** Gateway times are ISO strings; the dashboard shows clock time. */
const toClockTime = (isoTime: string) => (isoTime.includes("T") ? new Date(isoTime).toLocaleTimeString("en-US", { hour12: false }) : isoTime);

export const gatewayClient = {
  getStatus: () => requestGateway<{ gateway: string; tunnel: { healthy: boolean; url?: string } }>("/dashboard/status"),

  listBills: () => requestGateway<BillSummary[]>("/dashboard/bills"),

  getBill: (billId: string) => requestGateway<BillSummary>(`/dashboard/bills/${billId}`),

  async getPassport(billId: string): Promise<Passport | null> {
    try {
      return await requestGateway<Passport>(`/dashboard/bills/${billId}/passport`);
    } catch (error) {
      if (error instanceof GatewayError && error.status === 404) return null; // no stamps yet
      throw error;
    }
  },

  async getAuditTrail(billId: string): Promise<AuditEvent[]> {
    const events = await requestGateway<AuditEvent[]>(`/dashboard/bills/${billId}/audit`);
    return events.map((event) => ({ ...event, at: toClockTime(event.at) }));
  },

  getWeekIntake: () => requestGateway<DailyIntake[]>("/dashboard/intake/week"),

  listCrsPersonas: () => requestGateway<CrsChainResult[]>("/dashboard/crs/personas"),

  runCrsChain: (personaId: string) => requestGateway<CrsChainResult>(`/dashboard/crs/chain/${personaId}`, { method: "POST" }),

  async getCrsDataUseLog(): Promise<CrsDataUseEntry[]> {
    const entries = await requestGateway<CrsDataUseEntry[]>("/dashboard/crs/log");
    return entries.map((entry) => ({ ...entry, at: toClockTime(entry.at) }));
  },

  /** A person's decision on one stamp. The gateway records it, updates the bill's status and books it if ready. */
  recordDecision: (decision: Omit<StampDecision, "at">) =>
    requestGateway<{ decision: StampDecision; bill: BillSummary; passport: Passport }>(`/dashboard/bills/${decision.billId}/decisions`, {
      method: "POST",
      body: JSON.stringify({ stampId: decision.stampId, decision: decision.decision, byRole: decision.byRole, note: decision.note }),
    }),

  listRuleBooks: () => requestGateway<RuleBook[]>("/dashboard/rulebooks"),

  removeRule: (seat: string, ruleId: string) => requestGateway<unknown>(`/dashboard/rulebooks/${seat}/rules/${ruleId}`, { method: "DELETE" }),

  /** One bill = 1 to 5 files (email + PDF). Accepted: .pdf, .eml, .txt, up to 4 MB each. */
  async uploadBill(files: File[]): Promise<BillSummary> {
    const encoded = await Promise.all(files.map(async (file) => ({ name: file.name, dataBase64: await readAsBase64(file) })));
    return requestGateway<BillSummary>("/dashboard/inbox", { method: "POST", body: JSON.stringify({ files: encoded }) });
  },

  /**
   * Ask the orchestrator (AP desk lead) to do something, e.g. "Process bill B-2026-10-0147".
   * It streams events while it runs the Creao seats: session, text, tool_start, tool_end, activity, passport, error, done.
   */
  async chatWithOrchestrator(message: string, onEvent: (type: string, data: any) => void, sessionId?: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch("/dashboard/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });
    } catch {
      throw new GatewayError(0, "The gateway is not reachable. Start it with: corepack pnpm gateway");
    }
    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new GatewayError(response.status, text ? JSON.parse(text).error : `Gateway answered ${response.status}`);
    }
    await readEventStream(response.body, onEvent);
  },
};

async function readAsBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

/** Minimal Server-Sent Events reader for a POST response ("event: x\ndata: {...}\n\n"). */
async function readEventStream(stream: ReadableStream<Uint8Array>, onEvent: (type: string, data: any) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffered.indexOf("\n\n")) !== -1) {
      const rawEvent = buffered.slice(0, boundary);
      buffered = buffered.slice(boundary + 2);
      const type = /^event: (.*)$/m.exec(rawEvent)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(rawEvent)?.[1];
      onEvent(type, data ? JSON.parse(data) : {});
    }
  }
}
