// Who is at the table. The contractor is us; each vendor is a CRS sandbox persona (the owner) running a business.
// Owner names, phones and emails are the sandbox persona values, so they match what CRS was asked about.
// The businesses are PLACEHOLDERS (Aditya owns the real profiles) and their records are simulated in CRS format.

import type { SubProfile } from "@terms-room/shared";

export const CONTRACTOR = {
  name: "Keystone Bay Builders",
  project: "Alameda Mixed-Use, Building B",
  controller: "J. Park, Controller",
  secondApprover: "L. Moreno, CFO",
  placeholder: true,
} as const;

export interface Owner { persona: string; contact: string; phone: string; email: string; city: string; state: string; zip: string; street: string }

/** The six sandbox personas the start page offers. Values copied from the persona request bodies. */
export const OWNERS: Owner[] = [
  { persona: "P19", contact: "GRACE NAKAMURA", phone: "5550101019", email: "grace.nakamura@example.com", street: "1850 SOLANO AVE", city: "BERKELEY", state: "CA", zip: "94707" },
  { persona: "P01", contact: "MARGARET OKAFOR", phone: "5550101001", email: "margaret.okafor@example.com", street: "1420 WILLOW CREEK DR", city: "SAN JOSE", state: "CA", zip: "95125" },
  { persona: "P08", contact: "PRIYA VENKATESAN", phone: "5550101008", email: "priya.venkatesan@example.com", street: "3300 N LAKE SHORE DR APT 15C", city: "CHICAGO", state: "IL", zip: "60657" },
  { persona: "P13", contact: "KAYLA BRENNAN", phone: "5550101013", email: "kb.9921x@example.com", street: "9021 KINGSTON PIKE", city: "KNOXVILLE", state: "TN", zip: "37923" },
  { persona: "P12", contact: "VICTOR ANAND", phone: "5550101012", email: "v.anand.1968@example.com", street: "55 WATER ST FL 20", city: "NEW YORK", state: "NY", zip: "10041" },
  { persona: "P16", contact: "SAMUEL OYELARAN", phone: "5550101016", email: "samuel.oyelaran@example.com", street: "1200 BRICKELL BAY DR APT 2203", city: "MIAMI", state: "FL", zip: "33131" },
];

export function ownerFor(persona: string): Owner {
  const o = OWNERS.find((x) => x.persona === persona);
  if (!o) throw new Error(`${persona} isn't one of the sandbox owners Bursar uses (${OWNERS.map((x) => x.persona).join(", ")}).`);
  return o;
}

export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\b(Llc|Llp|Lp)\b/g, (m) => m.toUpperCase());

export function subProfile(persona: string, business: string, trade: string, scope: string): SubProfile {
  const o = ownerFor(persona);
  return { persona, contact: o.contact, business, trade, scope, phone: o.phone, email: o.email, placeholder: true };
}
