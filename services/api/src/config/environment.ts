import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// The single .env lives at the repo root.
const repoRootEnvFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(repoRootEnvFile)) process.loadEnvFile(repoRootEnvFile);

const seatToken = z.string().min(16, "seat tokens must be at least 16 characters; see .env.example");

const environmentSchema = z.object({
  NESSIE_API_KEY: z.string().min(1, "NESSIE_API_KEY is missing from .env"),
  NESSIE_BASE_URL: z.string().url().default("https://api.nessieisreal.com"),
  NESSIE_MODE: z.enum(["live", "offline"]).default("live"),

  API_PORT: z.coerce.number().int().positive().default(4000),
  SEAT_TOKEN_INTAKE: seatToken,
  SEAT_TOKEN_VENDOR_RECORDS: seatToken,
  SEAT_TOKEN_MATCHING: seatToken,
  SEAT_TOKEN_PAYMENTS: seatToken,
  SEAT_TOKEN_DASHBOARD: seatToken,
});

export const environment = environmentSchema.parse(process.env);
