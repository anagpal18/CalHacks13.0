// Thin HTTP wrapper over the Nessie REST API. One method per endpoint we use, nothing else.
// Business logic (who gets paid, balances, history) lives in nessieBankService.ts.

import { environment } from "../../config/environment.js";
import type {
  NessieAccount,
  NessieCreatedResponse,
  NessieCustomer,
  NessieDeposit,
  NessieTransfer,
  NewAccountRequest,
  NewCustomerRequest,
  NewDepositRequest,
  NewTransferRequest,
} from "./nessieApiTypes.js";

const REQUEST_TIMEOUT_MS = 20_000;

export class NessieRequestError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly httpStatus: number,
    readonly responseBody: string,
  ) {
    // Never include the URL query string: it contains the API key.
    super(`Nessie ${method} ${path} failed with HTTP ${httpStatus}: ${responseBody.slice(0, 300)}`);
  }
}

async function sendNessieRequest<ResponseBody>(
  method: "GET" | "POST" | "PUT",
  path: string,
  requestBody?: unknown,
): Promise<ResponseBody> {
  const url = `${environment.NESSIE_BASE_URL}${path}?key=${environment.NESSIE_API_KEY}`;
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const responseText = await response.text();
  if (!response.ok) throw new NessieRequestError(method, path, response.status, responseText);
  return JSON.parse(responseText) as ResponseBody;
}

/** Nessie answers an empty list with HTTP 404 and a string like "No transfers found for this account". */
async function getNessieList<Item>(path: string): Promise<Item[]> {
  try {
    const responseBody = await sendNessieRequest<Item[] | string>("GET", path);
    return Array.isArray(responseBody) ? responseBody : [];
  } catch (error) {
    if (error instanceof NessieRequestError && error.httpStatus === 404 && error.responseBody.includes("No ")) return [];
    throw error;
  }
}

export const nessieHttpClient = {
  listCustomers: () => getNessieList<NessieCustomer>("/customers"),

  createCustomer: async (newCustomer: NewCustomerRequest) =>
    (await sendNessieRequest<NessieCreatedResponse<NessieCustomer>>("POST", "/customers", newCustomer)).objectCreated,

  getAccount: (accountId: string) => sendNessieRequest<NessieAccount>("GET", `/accounts/${accountId}`),

  createAccount: async (customerId: string, newAccount: NewAccountRequest) =>
    (await sendNessieRequest<NessieCreatedResponse<NessieAccount>>("POST", `/customers/${customerId}/accounts`, newAccount))
      .objectCreated,

  listTransfersFromAccount: (accountId: string) => getNessieList<NessieTransfer>(`/accounts/${accountId}/transfers`),

  createTransferFromAccount: async (accountId: string, newTransfer: NewTransferRequest) => {
    const created = await sendNessieRequest<NessieCreatedResponse<NessieTransfer & { _id: string }>>(
      "POST",
      `/accounts/${accountId}/transfers`,
      newTransfer,
    );
    // Create returns `_id`, but GET returns `id`. Normalise to `id`.
    const { _id, ...transferFields } = created.objectCreated;
    return { ...transferFields, id: _id } satisfies NessieTransfer;
  },

  getTransfer: (transferId: string) => sendNessieRequest<NessieTransfer>("GET", `/transfers/${transferId}`),

  updateTransferStatus: (transferId: string, status: string) =>
    sendNessieRequest("PUT", `/transfers/${transferId}`, { status }),

  listDepositsToAccount: (accountId: string) => getNessieList<NessieDeposit>(`/accounts/${accountId}/deposits`),

  createDepositToAccount: async (accountId: string, newDeposit: NewDepositRequest) =>
    (await sendNessieRequest<NessieCreatedResponse<NessieDeposit>>("POST", `/accounts/${accountId}/deposits`, newDeposit))
      .objectCreated,
};
