// Nessie speaks dollars; Bill Passport stores integer cents everywhere.

export function centsToNessieDollars(amountCents: number): number {
  if (!Number.isInteger(amountCents)) throw new Error(`amountCents must be an integer, got ${amountCents}`);
  return amountCents / 100;
}

export function nessieDollarsToCents(amountDollars: number): number {
  return Math.round(amountDollars * 100);
}
