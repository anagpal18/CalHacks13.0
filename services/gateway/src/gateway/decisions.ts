// Human decisions on stamps, made by the AP manager from the dashboard's Check page.
// A decision never edits the agent's signed stamp: it sits beside it. An approved stamp counts as passed
// for the bill's status, a rejected one keeps the bill out of the ledger, an escalated one waits on the Controller.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type DecisionKind = "approve" | "reject" | "escalate";
export type DecisionRole = "controller" | "project_manager";

export interface StampDecision {
  billId: string;
  stampId: string;
  decision: DecisionKind;
  byRole: DecisionRole;
  note: string;
  at: string;
}

export const DECISION_KINDS = new Set<DecisionKind>(["approve", "reject", "escalate"]);
export const DECISION_ROLES = new Set<DecisionRole>(["controller", "project_manager"]);

export function createDecisions(path: string) {
  // Latest decision per bill and stamp; the event log keeps every earlier one.
  const store: Record<string, Record<string, StampDecision>> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(store, null, 1));
  };

  return {
    record(decision: StampDecision) {
      (store[decision.billId] ??= {})[decision.stampId] = decision;
      save();
    },
    forBill(billId: string): Record<string, StampDecision> {
      return store[billId] ?? {};
    },
    isApproved(billId: string, stampId: string): boolean {
      return store[billId]?.[stampId]?.decision === "approve";
    },
    isRejected(billId: string): boolean {
      return Object.values(store[billId] ?? {}).some((d) => d.decision === "reject");
    },
    isEscalated(billId: string): boolean {
      return Object.values(store[billId] ?? {}).some((d) => d.decision === "escalate");
    },
    // A passport reset starts the bill over, so its decisions go too.
    reset(billId: string) {
      delete store[billId];
      save();
    },
  };
}

export type Decisions = ReturnType<typeof createDecisions>;
