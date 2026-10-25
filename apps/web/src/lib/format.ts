export function formatDollars(amountCents: number, options: { compact?: boolean } = {}): string {
  const dollars = amountCents / 100;
  if (options.compact && Math.abs(dollars) >= 1_000) {
    return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(dollars)}`;
  }
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: dollars % 1 === 0 ? 0 : 2 });
}

export function formatShortDate(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatWeekday(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}

export function formatClockTime(isoDateTime: string): string {
  return isoDateTime.slice(11, 16);
}
