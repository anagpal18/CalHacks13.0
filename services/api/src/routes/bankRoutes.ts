// Read-only bank routes for Creao agents and the dashboard.
// There is deliberately NO route here that moves money. Paying happens only in
// POST /runs/:id/execute (routes/stage2), after a human approval the gateway has checked.

import type { FastifyInstance } from "fastify";
import { getBankService } from "../integrations/nessie/index.js";
import { requireSeat } from "../seatAccess/requireSeat.js";

interface VendorParams { vendorId: string }
interface BillParams { billId: string }
interface TransferParams { transferId: string }

export async function registerBankRoutes(app: FastifyInstance) {
  const bankService = getBankService();

  // Check 11 (cash) and the cash bar on Approve & Pay.
  app.get("/bank/balance", { preHandler: requireSeat("payments", "dashboard") }, async () => ({
    operatingBalanceCents: await bankService.getOperatingBalanceCents(),
  }));

  // Stamp 3 (repeat) and stamp 7 (where past payments went).
  app.get<{ Params: VendorParams }>(
    "/bank/vendors/:vendorId/payments",
    { preHandler: requireSeat("intake", "vendor_records", "payments", "dashboard") },
    async (request) => ({
      vendorId: request.params.vendorId,
      pastPayments: await bankService.getPaymentHistory(request.params.vendorId),
    }),
  );

  // Stamp 7 and check 13: the bank account this vendor is verified to use.
  app.get<{ Params: VendorParams }>(
    "/bank/vendors/:vendorId/verified-account",
    { preHandler: requireSeat("vendor_records", "payments", "dashboard") },
    async (request) => ({
      vendorId: request.params.vendorId,
      verifiedPayeeAccountId: await bankService.getVerifiedPayeeAccountId(request.params.vendorId),
    }),
  );

  // Stamp 3 and check 13: has this exact bill number already been paid?
  app.get<{ Params: BillParams }>(
    "/bank/bills/:billId/payments",
    { preHandler: requireSeat("intake", "payments", "dashboard") },
    async (request) => {
      const paymentsForBill = await bankService.findPaymentsForBill(request.params.billId);
      return { billId: request.params.billId, alreadyPaid: paymentsForBill.length > 0, paymentsForBill };
    },
  );

  // Check 14 (bank match): what the bank actually recorded for a transfer.
  app.get<{ Params: TransferParams }>(
    "/bank/transfers/:transferId",
    { preHandler: requireSeat("payments", "dashboard") },
    async (request) => bankService.getBankRecord(request.params.transferId),
  );
}
