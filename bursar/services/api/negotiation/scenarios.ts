// The demo scenarios (start page A to E). Each pairs a CRS sandbox owner (live people data) with a SIMULATED
// business record that the business products answer from in CRS format, plus the documents the vendor carries.

import type { BusinessProfileId, Rulebook, ScenarioId, SubProfile, UploadedW9 } from "@terms-room/shared";
import { ownerFor, subProfile, titleCase } from "./cast.ts";

export interface Address { street: string; city: string; state: string; zip: string }

/** Simulated business record. Shaped after the Experian Business data CRS resells; none of it comes from the sandbox. */
export interface BusinessRecord {
  bin: string;
  legalName: string;
  ein: string; // 9 digits; masked to the last 4 everywhere it's shown
  address: Address;
  phone: string;
  incorporated: string | { daysAgo: number };
  stateOfOrigin: string;
  status: "ACTIVE" | "INACTIVE";
  businessType: "LIMITED LIABILITY COMPANY" | "CORPORATION";
  officers: { name: string; title: string }[];
  intelliscore: { score: number; percentile: number; riskClass: number; riskDefinition: string } | null;
  recommendedLimitCents: number | null;
  dbt: { current: number; monthlyAverage: number; highest6Months: number };
  derogatory: { taxLiens: number; judgments: number; collections: number; bankruptcy: boolean };
  ucc: { count: number; cautionary: boolean };
  tradelines: number;
  ofac: { matchCode: string; description: string } | null;
  lookAlike: { bin: string; legalName: string; address: Address; incorporated: string; owner: string; tradelines: number } | null;
  victimStatement: boolean;
}

/** What the vendor's documents say. Honest vendors print their record; the look-alike and the doctored W-9 don't. */
export interface VendorDocs {
  w9: UploadedW9;
  licenseSince: number; // year the business license claims
  reference: { from: string; claim: string };
  invoices: string;
  bank: string;
}

export interface ScenarioCase {
  id: ScenarioId;
  title: string; // card title on the start page
  owner: string;
  profile: BusinessProfileId;
  sub: SubProfile;
  record: BusinessRecord;
  docs: VendorDocs;
  expected: string; // the outcome the spec promises under "Demo default"
}

const addr = (street: string, city: string, state: string, zip: string): Address => ({ street, city, state, zip });
export const fmtAddress = (a: Address) => `${titleCase(a.street)}, ${titleCase(a.city)}, ${a.state} ${a.zip}`;
const einFmt = (e: string) => `${e.slice(0, 2)}-${e.slice(2)}`;

const CLEAN = {
  status: "ACTIVE" as const, victimStatement: false, ofac: null, lookAlike: null,
  derogatory: { taxLiens: 0, judgments: 0, collections: 0, bankruptcy: false },
};

// ---------------------------------------------------------------- A to D

function scenarioA(): ScenarioCase {
  const record: BusinessRecord = {
    ...CLEAN, bin: "418265733", legalName: "NAKAMURA ELECTRIC LLC", ein: "843920175",
    address: addr("2216 FOURTH ST", "BERKELEY", "CA", "94710"), phone: "5105550119",
    incorporated: "2012-04-02", stateOfOrigin: "CA", businessType: "LIMITED LIABILITY COMPANY",
    officers: [{ name: "GRACE NAKAMURA", title: "MANAGING MEMBER" }],
    intelliscore: { score: 82, percentile: 81, riskClass: 1, riskDefinition: "LOW" }, recommendedLimitCents: 15_000_000,
    dbt: { current: 2, monthlyAverage: 3, highest6Months: 6 }, ucc: { count: 2, cautionary: false }, tradelines: 23,
  };
  return {
    id: "A", title: "Nakamura Electric LLC", owner: "P19", profile: "clean", record,
    sub: subProfile("P19", "Nakamura Electric LLC", "Electrical", "Lighting, switchgear and panels for floors 1 to 3"),
    docs: {
      w9: { legalName: record.legalName, ein: einFmt(record.ein), address: fmtAddress(record.address), signer: "GRACE NAKAMURA" },
      licenseSince: 2012,
      reference: { from: "Bayside Electrical Wholesale", claim: "pays its suppliers within terms" },
      invoices: "Completed $410,000 of commercial electrical work in 2025",
      bank: "Average business balance of $85,000 over the last six months",
    },
    expected: "Clean. Expected: net 15.",
  };
}

function scenarioB(): ScenarioCase {
  const record: BusinessRecord = {
    ...CLEAN, bin: "362904417", legalName: "VENKATESAN BUILDERS INC", ein: "364417902",
    address: addr("4410 N RAVENSWOOD AVE", "CHICAGO", "IL", "60640"), phone: "3125550188",
    incorporated: "2009-06-15", stateOfOrigin: "IL", businessType: "CORPORATION",
    officers: [{ name: "PRIYA VENKATESAN", title: "PRESIDENT" }],
    intelliscore: { score: 34, percentile: 29, riskClass: 3, riskDefinition: "MEDIUM" }, recommendedLimitCents: 4_000_000,
    dbt: { current: 38, monthlyAverage: 31, highest6Months: 52 },
    derogatory: { taxLiens: 1, judgments: 1, collections: 2, bankruptcy: false },
    ucc: { count: 4, cautionary: false }, tradelines: 17,
  };
  return {
    id: "B", title: "Venkatesan Builders", owner: "P08", profile: "slow_payer", record,
    sub: subProfile("P08", "Venkatesan Builders", "Framing and drywall", "Framing, drywall and level 4 finish, floors 2 to 4"),
    docs: {
      w9: { legalName: record.legalName, ein: einFmt(record.ein), address: fmtAddress(record.address), signer: "PRIYA VENKATESAN" },
      licenseSince: 2009,
      reference: { from: "North Shore Lumber & Board", claim: "pays its suppliers within terms" },
      invoices: "Completed $1.2 million of framing and drywall in 2025",
      bank: "Average business balance of $40,000 over the last six months",
    },
    expected: "Lien + judgment, slow payer. Expected: about net 45, 0% upfront.",
  };
}

function scenarioC(): ScenarioCase {
  const real = { bin: "700214558", legalName: "OKAFOR ELECTRIC SUPPLY CO", address: addr("2390 S 10TH ST", "SAN JOSE", "CA", "95112"),
    incorporated: "2004-03-11", owner: "MARGARET OKAFOR", tradelines: 41 };
  const record: BusinessRecord = {
    ...CLEAN, bin: "881902265", legalName: "OKAFOR ELECTRIC SUPPLY LLC", ein: "881190344",
    address: addr("55 WATER ST FL 20", "NEW YORK", "NY", "10041"), phone: "2125550147",
    incorporated: { daysAgo: 19 }, stateOfOrigin: "NY", businessType: "LIMITED LIABILITY COMPANY",
    officers: [{ name: "VICTOR ANAND", title: "MEMBER" }],
    intelliscore: null, recommendedLimitCents: null, dbt: { current: 0, monthlyAverage: 0, highest6Months: 0 },
    ucc: { count: 0, cautionary: false }, tradelines: 0, lookAlike: real,
  };
  return {
    id: "C", title: "“Okafor Electric Supply”", owner: "P12", profile: "look_alike", record,
    sub: subProfile("P12", "Okafor Electric Supply", "Electrical supply", "Switchgear, panels and wire for Building B"),
    docs: {
      // It borrows the real company's name, EIN and address.
      w9: { legalName: real.legalName, ein: "77-0415528", address: fmtAddress(real.address), signer: "VICTOR ANAND" },
      licenseSince: 2004,
      reference: { from: "Pacific Wire & Cable", claim: "pays its suppliers within terms" },
      invoices: "Supplied $2.3 million of electrical gear to Bay Area contractors since 2004",
      bank: "Average business balance of $310,000 over the last six months",
    },
    expected: "Look-alike of an older company. Expected: talks end.",
  };
}

function scenarioD(): ScenarioCase {
  const record: BusinessRecord = {
    ...CLEAN, bin: "925530871", legalName: "BRENNAN SITE SERVICES LLC", ein: "924471830",
    address: addr("9021 KINGSTON PIKE STE 4", "KNOXVILLE", "TN", "37923"), phone: "8655550163",
    incorporated: "2025-08-14", stateOfOrigin: "TN", businessType: "LIMITED LIABILITY COMPANY",
    officers: [{ name: "KAYLA BRENNAN", title: "MEMBER" }],
    intelliscore: { score: 41, percentile: 37, riskClass: 3, riskDefinition: "MEDIUM" }, recommendedLimitCents: 1_500_000,
    dbt: { current: 0, monthlyAverage: 0, highest6Months: 0 }, ucc: { count: 1, cautionary: false }, tradelines: 2,
  };
  return {
    id: "D", title: "Judge's doctored W-9", owner: "P13", profile: "clean", record,
    sub: subProfile("P13", "Brennan Site Services", "Concrete cutting", "Core drilling and saw cutting for MEP sleeves"),
    docs: {
      // Doctored: "INC" instead of LLC, and two digits of the EIN changed (…1830 → …1880).
      w9: { legalName: "BRENNAN SITE SERVICES INC", ein: "92-4471880", address: fmtAddress(record.address), signer: "KAYLA BRENNAN" },
      licenseSince: 2025,
      reference: { from: "Smoky Mountain Equipment Rental", claim: "pays its suppliers within terms" },
      invoices: "Completed $95,000 of concrete cutting in 2025",
      bank: "Average business balance of $22,000 over the last six months",
    },
    expected: "The judge hands in a doctored W-9. Expected: talks end, red verdict.",
  };
}

// ---------------------------------------------------------------- E: any owner, any simulated profile

const BASE: Record<string, { business: string; trade: string; scope: string; street: string; zip: string; phone: string }> = {
  P19: { business: "Nakamura Tile & Stone", trade: "Tile and stone", scope: "Lobby, restroom and stair tile", street: "1290 SAN PABLO AVE", zip: "94706", phone: "5105550191" },
  P01: { business: "Okafor Electrical Contracting", trade: "Electrical", scope: "Electrical rough-in and panels, floors 1 to 3", street: "2390 S 10TH ST", zip: "95112", phone: "4085550110" },
  P08: { business: "Lakeshore Drywall & Finish", trade: "Drywall", scope: "Drywall, taping and level 4 finish, floors 2 to 4", street: "1717 W BELMONT AVE", zip: "60657", phone: "3125550181" },
  P13: { business: "Brennan Concrete Cutting", trade: "Concrete cutting", scope: "Core drilling and saw cutting for MEP sleeves", street: "4610 OLD MAYNARDVILLE PIKE", zip: "37918", phone: "8655550131" },
  P12: { business: "Anand Mechanical", trade: "HVAC", scope: "Rooftop units and ductwork", street: "120 BROADWAY FL 9", zip: "10271", phone: "2125550121" },
  P16: { business: "Oyelaran Glass & Glazing", trade: "Glazing", scope: "Ground-floor storefront and curtain wall", street: "8400 NW 25TH ST", zip: "33122", phone: "3055550161" },
};

const hashNum = (s: string, mod: number) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) % mod; };

function custom(owner: string, profile: BusinessProfileId): ScenarioCase {
  const o = ownerFor(owner);
  const b = BASE[owner];
  const suffix = /&|Contracting|Mechanical|Cutting/.test(b.business) ? "LLC" : "INC";
  let legalName = `${b.business.toUpperCase()} ${suffix}`;
  let business = b.business;
  const ein = String(100000000 + hashNum(owner + profile, 899999999)).slice(0, 9);
  const record: BusinessRecord = {
    ...CLEAN, bin: String(300000000 + hashNum(owner + "bin" + profile, 599999999)), legalName, ein,
    address: addr(b.street, o.city, o.state, b.zip), phone: b.phone,
    incorporated: "2011-05-09", stateOfOrigin: o.state, businessType: suffix === "LLC" ? "LIMITED LIABILITY COMPANY" : "CORPORATION",
    officers: [{ name: o.contact, title: suffix === "LLC" ? "MANAGING MEMBER" : "PRESIDENT" }],
    intelliscore: { score: 78, percentile: 74, riskClass: 1, riskDefinition: "LOW" }, recommendedLimitCents: 12_000_000,
    dbt: { current: 3, monthlyAverage: 4, highest6Months: 7 }, ucc: { count: 2, cautionary: false }, tradelines: 19,
  };
  let licenseSince = 2011;
  let w9 = { legalName, ein: einFmt(ein), address: fmtAddress(record.address), signer: o.contact };
  switch (profile) {
    case "slow_payer":
      record.intelliscore = { score: 33, percentile: 27, riskClass: 3, riskDefinition: "MEDIUM" };
      record.recommendedLimitCents = 3_500_000;
      record.dbt = { current: 41, monthlyAverage: 35, highest6Months: 58 };
      record.derogatory = { taxLiens: 0, judgments: 0, collections: 2, bankruptcy: false };
      break;
    case "brand_new":
      record.incorporated = { daysAgo: 11 };
      record.intelliscore = null; record.recommendedLimitCents = null; record.tradelines = 0;
      record.dbt = { current: 0, monthlyAverage: 0, highest6Months: 0 }; record.ucc = { count: 0, cautionary: false };
      licenseSince = new Date().getFullYear();
      break;
    case "look_alike": {
      const real = { bin: "511870236", legalName: "BAYLINE BUILDING SUPPLY CO", address: addr("1555 ADELINE ST", "OAKLAND", "CA", "94607"),
        incorporated: "1998-02-17", owner: "THOMAS WEXLER", tradelines: 63 };
      business = "Bayline Building Supply";
      legalName = "BAYLINE BUILDING SUPPLY LLC";
      Object.assign(record, { legalName, incorporated: { daysAgo: 23 }, intelliscore: null, recommendedLimitCents: null, tradelines: 0, lookAlike: real,
        dbt: { current: 0, monthlyAverage: 0, highest6Months: 0 } });
      w9 = { legalName: real.legalName, ein: einFmt(ein), address: fmtAddress(real.address), signer: o.contact };
      licenseSince = 1998;
      break;
    }
    case "ofac_hit":
      record.ofac = { matchCode: "2", description: "Possible match on the OFAC SDN list (simulated record)" };
      break;
    case "ucc_heavy":
      record.intelliscore = { score: 52, percentile: 46, riskClass: 3, riskDefinition: "MEDIUM" };
      record.recommendedLimitCents = 6_000_000;
      record.ucc = { count: 14, cautionary: true };
      break;
  }
  return {
    id: "E", title: business, owner, profile, record,
    sub: subProfile(owner, business, b.trade, b.scope),
    docs: {
      w9, licenseSince,
      reference: { from: "Golden Gate Builders Supply", claim: "pays its suppliers within terms" },
      invoices: `Completed $${(180 + hashNum(owner, 400)).toLocaleString("en-US")},000 of similar work in 2025`,
      bank: `Average business balance of $${(30 + hashNum(owner + "bank", 90)).toLocaleString("en-US")},000 over the last six months`,
    },
    expected: "Custom: the outcome depends on your rules.",
  };
}

export const SCENARIO_IDS: ScenarioId[] = ["A", "B", "C", "D", "E"];

export function scenarioCase(rb: Pick<Rulebook, "scenario">): ScenarioCase {
  switch (rb.scenario.id) {
    case "A": return scenarioA();
    case "B": return scenarioB();
    case "C": return scenarioC();
    case "D": return scenarioD();
    case "E": return custom(rb.scenario.owner, rb.scenario.profile);
  }
}

export const incorporatedOn = (r: BusinessRecord, now: Date) =>
  typeof r.incorporated === "string" ? r.incorporated : new Date(now.getTime() - r.incorporated.daysAgo * 86_400_000).toISOString().slice(0, 10);
