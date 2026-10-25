// Public entry point. Other modules import from here, never from the files inside.
//   import { getBankService } from "../integrations/nessie/index.js";

import { environment } from "../../config/environment.js";
import type { BankService } from "./bankService.js";
import { liveNessieBankService } from "./liveNessieBankService.js";
import { offlineFakeBankService } from "./offlineFakeBankService.js";

export type * from "./bankService.js";

export function getBankService(): BankService {
  return environment.NESSIE_MODE === "offline" ? offlineFakeBankService : liveNessieBankService;
}
