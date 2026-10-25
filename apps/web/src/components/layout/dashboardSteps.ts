import { Inbox, LayoutDashboard, ShieldCheck, ScanFace, Landmark, Trophy, type LucideIcon } from "lucide-react";

export interface DashboardStep {
  number: number;
  path: string;
  label: string;
  headline: string;
  subtitle: string;
  icon: LucideIcon;
}

// BILL_PASSPORT_MASTER.md §12: the step bar on every page, in this order.
export const DASHBOARD_STEPS: DashboardStep[] = [
  { number: 1, path: "/inbox", label: "Inbox", headline: "Bills are coming in.", subtitle: "Every bill is checked the moment it arrives. Most clear; the rest are held or sent to a person.", icon: Inbox },
  { number: 2, path: "/check", label: "Check", headline: "Every bill must prove itself.", subtitle: "Eight stamps, signed by three agents. A bill is booked only when all eight pass.", icon: ShieldCheck },
  { number: 3, path: "/verify", label: "Verify", headline: "Is the person changing bank details real?", subtitle: "Any bank-detail change runs three identity checks before we trust it.", icon: ScanFace },
  { number: 4, path: "/pay", label: "Approve & Pay", headline: "The right person signs, then money moves.", subtitle: "Bills are paid by their terms, approved by a human, paid, then matched to the bank record.", icon: Landmark },
  { number: 5, path: "/proof", label: "Proof", headline: "Does it actually work?", subtitle: "Scored against an answer key of planted problems. Every decision has a signed trail.", icon: Trophy },
];

/** The landing page: only what needs a person, plus what was handled. Sits before step ①. */
export const OVERVIEW_STEP: DashboardStep = {
  number: 0, path: "/overview", label: "Overview", headline: "Here's what needs you today.",
  subtitle: "Everything else was checked and handled automatically. Open any item to see the full trail.", icon: LayoutDashboard,
};

export function findStepForPath(pathname: string): DashboardStep {
  if (pathname.startsWith(OVERVIEW_STEP.path)) return OVERVIEW_STEP;
  return DASHBOARD_STEPS.find((step) => pathname.startsWith(step.path)) ?? OVERVIEW_STEP;
}
