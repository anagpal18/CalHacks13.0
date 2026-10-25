// Seat permissions (master section 4): which stamps each seat may sign, which tools it may call,
// and which evidence sources it may cite. Intake reads the raw inbox; the others read what Intake recorded.
export type Seat = "intake" | "vendor_records" | "matching";

export const SEATS: Record<Seat, { stamps: string[]; tools: string[]; sources: string[] }> = {
  intake: {
    stamps: ["sender", "repeat"],
    tools: ["inbox", "record_bill", "vendors", "payments"],
    sources: ["email", "invoice", "vendor_master", "vendor_history", "nessie"],
  },
  vendor_records: {
    stamps: ["vendor", "payto", "insider"],
    tools: ["bill", "vendors", "payments", "employees", "crs"],
    sources: ["email", "invoice", "vendor_master", "vendor_history", "nessie", "employees", "crs"],
  },
  matching: {
    stamps: ["order", "delivered", "terms"],
    tools: ["bill", "vendors", "po", "receiving", "contracts"],
    sources: ["invoice", "po", "receiving", "contract"],
  },
};

// The tools whose output backs each evidence source, for the grounding check.
export const SOURCE_TOOLS: Record<string, string[]> = {
  email: ["inbox", "bill"],
  invoice: ["inbox", "bill"],
  vendor_master: ["vendors"],
  vendor_history: ["vendors"],
  nessie: ["payments"],
  employees: ["employees"],
  po: ["po"],
  receiving: ["receiving"],
  contract: ["contracts"],
  crs: ["crs"],
};

export const ASKED_WHO = new Set(["controller", "project_manager", "vendor"]);

export const ALL_STAMPS = Object.values(SEATS).flatMap((s) => s.stamps);

export const isSeat = (s: unknown): s is Seat => typeof s === "string" && Object.hasOwn(SEATS, s);
