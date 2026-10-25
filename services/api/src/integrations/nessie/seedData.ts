// Starter bank data so stamps 3 and 7 have history from hour 0.
// TEMPORARY: replace with Shresth's generator output (services/api/src/sim) once it exists.
// Contact names match the CRS demo personas in BURSAR_MASTER.md §9.

export const COMPANY_NAME = { firstName: "Ridgeline", lastName: "Builders" };
export const COMPANY_OPENING_BALANCE_CENTS = 2_500_000_00; // $2.5M operating cash

export interface SeedVendor {
  vendorId: string;
  vendorName: string;
  contactPersona: string;
}

export const SAMPLE_VENDORS_FOR_SEEDING: SeedVendor[] = [
  { vendorId: "V-OKAFOR-ELECTRIC", vendorName: "Okafor Electric", contactPersona: "P01 Margaret Okafor" },
  { vendorId: "V-NAKAMURA-CONCRETE", vendorName: "Nakamura Concrete", contactPersona: "P19 Grace Nakamura" },
  { vendorId: "V-VENKATESAN-PLUMBING", vendorName: "Venkatesan Plumbing", contactPersona: "P08 Priya Venkatesan" },
  { vendorId: "V-BAY-LUMBER", vendorName: "Bay Lumber Supply", contactPersona: "none" },
  { vendorId: "V-SUMMIT-STEEL", vendorName: "Summit Steel", contactPersona: "none" },
];

export interface SeedPastPayment {
  billId: string;
  vendorId: string;
  amountCents: number;
  paidOn: string;
}

export const SAMPLE_PAST_PAYMENTS_FOR_SEEDING: SeedPastPayment[] = [
  // The demo duplicate: a new bill "1043-A" must be caught as "Already paid as INV-1043".
  { billId: "INV-1043", vendorId: "V-OKAFOR-ELECTRIC", amountCents: 12_480_00, paidOn: "2026-09-18" },
  { billId: "INV-0988", vendorId: "V-OKAFOR-ELECTRIC", amountCents: 48_000_00, paidOn: "2026-08-29" },
  { billId: "NC-2207", vendorId: "V-NAKAMURA-CONCRETE", amountCents: 31_250_00, paidOn: "2026-09-25" },
  { billId: "VP-551", vendorId: "V-VENKATESAN-PLUMBING", amountCents: 8_920_00, paidOn: "2026-10-02" },
  { billId: "BL-7781", vendorId: "V-BAY-LUMBER", amountCents: 7_800_00, paidOn: "2026-10-09" },
  { billId: "SS-3310", vendorId: "V-SUMMIT-STEEL", amountCents: 64_115_00, paidOn: "2026-10-16" },
];
