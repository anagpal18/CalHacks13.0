// Bill Passport API. Start with: corepack pnpm api:dev
// Creao agents and the dashboard call this; only this server talks to Nessie.

import Fastify from "fastify";
import { environment } from "./config/environment.js";
import { UnknownVendorError } from "./integrations/nessie/nessieAccountDirectory.js";
import { NessieRequestError } from "./integrations/nessie/nessieHttpClient.js";
import { registerBankRoutes } from "./routes/bankRoutes.js";

// Never log request headers: they carry seat tokens.
const app = Fastify({ logger: { level: "info", redact: ["req.headers.authorization"] } });

app.setErrorHandler((error, request, reply) => {
  if (error instanceof UnknownVendorError) return reply.code(404).send({ error: error.message });
  if (error instanceof NessieRequestError) {
    request.log.error({ nessiePath: error.path, nessieStatus: error.httpStatus }, "Nessie request failed");
    return reply.code(502).send({ error: "The bank (Nessie) did not answer correctly", nessieStatus: error.httpStatus });
  }
  request.log.error(error);
  return reply.code(500).send({ error: "Internal error" });
});

app.get("/health", async () => ({ ok: true, bankMode: environment.NESSIE_MODE }));
await app.register(registerBankRoutes);

await app.listen({ port: environment.API_PORT, host: "0.0.0.0" });
