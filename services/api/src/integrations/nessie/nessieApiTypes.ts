// Raw request/response shapes of the Nessie API, as probed live on 2026-10-24.
// The live API rejects unknown fields ("extra fields not permitted"), so these must stay exact.
// All amounts here are DOLLARS (Nessie's unit). Our own code uses cents; convert in nessieMoney.ts.

export interface NessieAddress {
  street_number: string;
  street_name: string;
  city: string;
  state: string;
  zip: string;
}

export interface NessieCustomer {
  _id: string;
  first_name: string;
  last_name: string;
  address: NessieAddress;
}

export interface NessieAccount {
  _id: string;
  customer_id: string;
  type: "Checking" | "Savings" | "Credit Card";
  nickname: string;
  rewards: number;
  /** Balance set at creation. Nessie does NOT update it when money moves. */
  balance: number;
  /** Assigned by Nessie; any value we send is ignored. */
  account_number: string;
}

/**
 * A transfer has NO payee field. Nessie only records it on the paying account.
 * We put the payee inside `description` (see paymentMemo.ts).
 */
export interface NessieTransfer {
  id: string;
  transaction_date: string; // YYYY-MM-DD
  status: string; // free text; we use "pending" | "completed" | "cancelled"
  amount: number;
  description: string;
}

export interface NessieDeposit {
  _id: string;
  medium: string;
  transaction_date: string;
  status: string;
  amount: number;
  description: string;
  creation_date: string;
}

export interface NessieCreatedResponse<CreatedObject> {
  code: number;
  message: string;
  objectCreated: CreatedObject;
}

export type NewCustomerRequest = Omit<NessieCustomer, "_id">;
export type NewAccountRequest = Pick<NessieAccount, "type" | "nickname" | "rewards" | "balance">;
export type NewTransferRequest = Omit<NessieTransfer, "id">;
export type NewDepositRequest = Omit<NessieDeposit, "_id" | "creation_date">;
