import { Building2, CalendarDays, ClipboardList, Copy, Landmark, Mail, Truck, UserSearch, type LucideIcon } from "lucide-react";
import type { StampId } from "@/data/types";

export const STAMP_ICON: Record<StampId, LucideIcon> = {
  sender: Mail,
  vendor: Building2,
  repeat: Copy,
  order: ClipboardList,
  delivered: Truck,
  terms: CalendarDays,
  payto: Landmark,
  insider: UserSearch,
};
