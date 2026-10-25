// Route guard: `preHandler: requireSeat("intake", "payments")` lets only those seats through.
//   no / unknown token -> 401
//   known seat, not on the list -> 403 (this is the "limited access" judges should see)

import type { FastifyReply, FastifyRequest } from "fastify";
import { findSeatByToken, type SeatName } from "./seatTokens.js";

declare module "fastify" {
  interface FastifyRequest {
    callingSeat?: SeatName;
  }
}

export function requireSeat(...allowedSeats: SeatName[]) {
  return async function checkCallingSeat(request: FastifyRequest, reply: FastifyReply) {
    const authorizationHeader = request.headers.authorization ?? "";
    const presentedToken = authorizationHeader.startsWith("Bearer ") ? authorizationHeader.slice("Bearer ".length) : "";
    const callingSeat = presentedToken ? findSeatByToken(presentedToken) : null;

    if (!callingSeat) return reply.code(401).send({ error: "Missing or unknown seat token" });
    if (!allowedSeats.includes(callingSeat)) {
      return reply.code(403).send({ error: `Seat "${callingSeat}" is not allowed to call this route`, allowedSeats });
    }
    request.callingSeat = callingSeat;
  };
}
