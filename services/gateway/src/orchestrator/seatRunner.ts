// Runs one Creao seat agent on one bill: issue a ticket, start the Creao run, wait for it, revoke the ticket.
// The orchestrator agent calls this as a tool; the gateway still checks every stamp the seat submits.
import type { CreaoClient } from "../integrations/creao/client.ts";
import type { createEventLog, LogEvent } from "../gateway/eventlog.ts";
import type { createExtractions } from "../gateway/extractions.ts";
import type { createPassports } from "../gateway/passports.ts";
import { SEATS, type Seat } from "../gateway/seats.ts";
import type { createTickets } from "../gateway/tickets.ts";
import type { TunnelState } from "../gateway/tunnel.ts";

export interface SeatRunResult {
  seat: Seat;
  billId: string;
  creaoRunId?: string;
  runStatus: string;
  toolCalls: number;
  stamps: { id: string; status: string; reason: string }[];
  extraction?: { matched: number | null; total: number | null; mismatches: string[] };
  error?: string;
}

export function createSeatRunner(d: {
  creao?: CreaoClient;
  agentIds: Partial<Record<Seat, string>>;
  inputField: string;
  tickets: ReturnType<typeof createTickets>;
  events: ReturnType<typeof createEventLog>;
  extractions: ReturnType<typeof createExtractions>;
  passports: ReturnType<typeof createPassports>;
  tunnel: () => Promise<TunnelState>;
}) {
  async function run(seat: Seat, billId: string, onEvent?: (e: LogEvent) => void): Promise<SeatRunResult> {
    const base = { seat, billId, runStatus: "not started", toolCalls: 0, stamps: [] };
    const appId = d.agentIds[seat];
    if (!d.creao) return { ...base, error: "CREAO_API_KEY is not set on the gateway" };
    if (!appId) return { ...base, error: `no Creao agent ID configured for ${seat}` };
    // Vendor-Records and Matching work only from what Intake recorded.
    if (seat !== "intake" && !d.extractions.get(billId)) return { ...base, error: "Intake has not recorded this bill yet. Run intake first." };
    // A Creao agent that cannot reach us would finish with 0 tool calls and still spend credits.
    const tunnel = await d.tunnel();
    if (!tunnel.healthy) {
      return {
        ...base,
        error: `The public tunnel to this gateway is down (${tunnel.url ?? "no URL"}), so a Creao agent could not reach us. Restart it with: corepack pnpm tunnel`,
      };
    }

    const { ticket } = d.tickets.issue(seat, billId);
    d.events.append("ticket_issued", { billId, seat, data: { by: "orchestrator" } });
    let runId: string | undefined;
    const unsubscribe = d.events.subscribe((e) => {
      if (e.billId === billId && e.seat === seat && (e.data as any)?.runId === runId) onEvent?.(e);
    });
    try {
      const started = await d.creao.startRun({
        appId,
        inputs: { [d.inputField]: JSON.stringify({ billId, ticket, gatewayUrl: tunnel.url }) },
        idempotencyKey: `${billId}-${seat}-${Date.now()}`,
      });
      runId = started.id;
      d.tickets.attachRun(ticket, runId);
      const done = await d.creao.waitForRun(runId);
      const mine = d.events.list({ billId }).filter((e) => e.seat === seat && (e.data as any)?.runId === runId);
      const passport = d.passports.summary(billId).stamps;
      const extracted = mine.filter((e) => e.type === "bill_extracted").at(-1)?.data as any;
      return {
        seat,
        billId,
        creaoRunId: runId,
        runStatus: done.status,
        toolCalls: mine.filter((e) => e.type === "tool_call").length,
        stamps: SEATS[seat].stamps
          .map((id) => passport[id])
          .filter((s) => s?.creaoRunId === runId)
          .map((s) => ({ id: s.id, status: s.status, reason: s.reason })),
        extraction: extracted && { matched: extracted.matched, total: extracted.total, mismatches: extracted.mismatches },
        error: done.status === "completed" ? undefined : `Creao run ended ${done.status}${done.errorCode ? ` (${done.errorCode})` : ""}`,
      };
    } catch (e) {
      return { ...base, creaoRunId: runId, runStatus: "error", error: (e as Error).message };
    } finally {
      d.tickets.revoke(ticket);
      unsubscribe();
    }
  }

  return { run };
}
