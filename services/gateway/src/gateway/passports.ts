// Signed stamps per bill. The gateway is the only writer, so this is the passport of record.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ALL_STAMPS } from "./seats.ts";

export interface SignedStamp {
  billId: string;
  id: string;
  status: "pass" | "fail" | "ask_human";
  reason: string;
  evidence: unknown[];
  disagreement?: unknown;
  askedWho?: string;
  signedBy: string;
  creaoRunId?: string;
  at: string;
  signature: string;
}

export function createPassports(path: string) {
  const store: Record<string, Record<string, SignedStamp>> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(store, null, 1));
  };

  function summary(billId: string) {
    const stamps = store[billId] ?? {};
    const missing = ALL_STAMPS.filter((id) => !stamps[id]);
    const open = ALL_STAMPS.filter((id) => stamps[id] && stamps[id].status !== "pass");
    const askedWho = [...new Set(Object.values(stamps).flatMap((s) => (s.status === "ask_human" && s.askedWho ? [s.askedWho] : [])))];
    const status = open.length ? "parked" : missing.length ? "checking" : "bookable";
    return { billId, status, open, missing, askedWho, stamps };
  }

  return {
    put(stamp: SignedStamp) {
      (store[stamp.billId] ??= {})[stamp.id] = stamp;
      save();
    },
    reset(billId: string) {
      delete store[billId];
      save();
    },
    summary,
  };
}
