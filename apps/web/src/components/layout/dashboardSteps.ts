import { Inbox, ShieldCheck, ScanFace, Landmark, Trophy, type LucideIcon } from "lucide-react";

export interface DashboardStep {
  number: number;
  path: string;
  label: string;
  headline: string;
  icon: LucideIcon;
}

// BILL_PASSPORT_MASTER.md §12: the step bar on every page, in this order.
export const DASHBOARD_STEPS: DashboardStep[] = [
  { number: 1, path: "/inbox", label: "Inbox", headline: "Bills are coming in.", icon: Inbox },
  { number: 2, path: "/check", label: "Check", headline: "Every bill must prove itself.", icon: ShieldCheck },
  { number: 3, path: "/verify", label: "Verify", headline: "Is the person changing bank details real?", icon: ScanFace },
  { number: 4, path: "/pay", label: "Approve & Pay", headline: "The right person signs, then money moves.", icon: Landmark },
  { number: 5, path: "/proof", label: "Proof", headline: "Does it actually work?", icon: Trophy },
];

export function findStepForPath(pathname: string): DashboardStep {
  return DASHBOARD_STEPS.find((step) => pathname.startsWith(step.path)) ?? DASHBOARD_STEPS[0];
}
