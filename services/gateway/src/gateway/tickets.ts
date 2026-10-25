// Run tickets: our backend issues one per Creao run, scoped to one seat and one bill, and it expires.
// Creao Secrets are shared by every agent on the account, so a seat token there would not separate seats.
import { randomBytes } from "node:crypto";
import type { Seat } from "./seats.ts";

export interface Ticket {
  seat: Seat;
  billId: string;
  expiresAt: number;
  runId?: string;
  // Every tool response served on this ticket, used to check that cited values came from a tool.
  served: { tool: string; data: unknown }[];
}

export function createTickets(ttlMs = 45 * 60_000) {
  const tickets = new Map<string, Ticket>();

  return {
    issue(seat: Seat, billId: string): { ticket: string; expiresAt: string } {
      const ticket = `bpt_${randomBytes(24).toString("base64url")}`;
      const expiresAt = Date.now() + ttlMs;
      tickets.set(ticket, { seat, billId, expiresAt, served: [] });
      return { ticket, expiresAt: new Date(expiresAt).toISOString() };
    },
    // Accepts an Authorization header value; returns the live ticket or undefined.
    read(authorization: string | undefined): (Ticket & { id: string }) | undefined {
      const id = /^Bearer (bpt_[\w-]+)$/.exec(authorization ?? "")?.[1];
      const t = id ? tickets.get(id) : undefined;
      if (!id || !t) return undefined;
      if (t.expiresAt < Date.now()) {
        tickets.delete(id);
        return undefined;
      }
      return Object.assign(t, { id });
    },
    attachRun(ticket: string, runId: string): boolean {
      const t = tickets.get(ticket);
      if (t) t.runId = runId;
      return Boolean(t);
    },
    revoke(ticket: string): boolean {
      return tickets.delete(ticket);
    },
    // A passport reset must also cut off runs still holding tickets for the old passport.
    revokeBill(billId: string): number {
      let n = 0;
      for (const [id, t] of tickets) if (t.billId === billId && tickets.delete(id)) n++;
      return n;
    },
  };
}
