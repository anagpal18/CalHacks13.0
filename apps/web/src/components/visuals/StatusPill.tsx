import type { StatusLook } from "@/lib/statusStyle";
import { TONE_STYLE } from "@/lib/statusStyle";
import { cn } from "@/lib/utils";

export function StatusPill({ look, className }: { look: StatusLook; className?: string }) {
  const tone = TONE_STYLE[look.tone];
  const Icon = look.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tone.text, tone.background, tone.border, className)}>
      <Icon className={cn("size-3.5", look.tone === "checking" && "animate-spin")} />
      {look.label}
    </span>
  );
}
