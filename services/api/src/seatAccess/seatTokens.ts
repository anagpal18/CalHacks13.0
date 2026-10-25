// Who is calling? Each agent seat (and the dashboard) has its own bearer token in .env.
// Kenil's gateway can take this over; routes only depend on `requireSeat`.

import { timingSafeEqual } from "node:crypto";
import { environment } from "../config/environment.js";

export type SeatName = "intake" | "vendor_records" | "matching" | "payments" | "dashboard";

const tokenBySeat: Record<SeatName, string> = {
  intake: environment.SEAT_TOKEN_INTAKE,
  vendor_records: environment.SEAT_TOKEN_VENDOR_RECORDS,
  matching: environment.SEAT_TOKEN_MATCHING,
  payments: environment.SEAT_TOKEN_PAYMENTS,
  dashboard: environment.SEAT_TOKEN_DASHBOARD,
};

function tokensMatch(presentedToken: string, expectedToken: string): boolean {
  const presented = Buffer.from(presentedToken);
  const expected = Buffer.from(expectedToken);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/** Returns the seat that owns this token, or null if no seat does. */
export function findSeatByToken(presentedToken: string): SeatName | null {
  for (const [seatName, expectedToken] of Object.entries(tokenBySeat)) {
    if (tokensMatch(presentedToken, expectedToken)) return seatName as SeatName;
  }
  return null;
}
