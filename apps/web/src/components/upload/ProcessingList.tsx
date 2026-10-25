// One row per uploaded bill. While the agents work, the row is a shadcn Skeleton with the current stage;
// when it's done the skeleton resolves into the vendor, amount and outcome.

import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, CircleX, FileText, Hand, Loader } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { UploadedBill, UploadStage } from "@/data/types";
import { formatDollars } from "@/lib/format";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<Exclude<UploadStage, "done">, string> = {
  uploading: "Sending to the agents…",
  reading: "Reading the bill…",
  checking: "Checking 8 stamps…",
};

const OUTCOME_LOOK = {
  booked: { label: "Booked", icon: CircleCheck, className: "text-foreground" },
  held: { label: "Held", icon: CircleX, className: "text-held" },
  asking: { label: "Needs a person", icon: Hand, className: "text-asking" },
} as const;

function formatFileSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

export function ProcessingList({ uploads }: { uploads: UploadedBill[] }) {
  const doneCount = uploads.filter((upload) => upload.stage === "done").length;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium">
          {doneCount < uploads.length ? "Agents are checking your bills" : uploads.some((upload) => upload.errorMessage) ? "Some bills could not be processed" : "All bills checked"}
        </span>
        <span className="text-muted-foreground">{doneCount} of {uploads.length} done</span>
      </div>
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-track">
        <motion.div className="h-full rounded-full bg-foreground" animate={{ width: `${(doneCount / Math.max(uploads.length, 1)) * 100}%` }} transition={{ duration: 0.4 }} />
      </div>
      <div className="divide-y divide-border">
        {uploads.map((upload) => <ProcessingRow key={upload.uploadId} upload={upload} />)}
      </div>
    </div>
  );
}

function ProcessingRow({ upload }: { upload: UploadedBill }) {
  const isDone = upload.stage === "done";
  const outcome = upload.outcome ? OUTCOME_LOOK[upload.outcome] : null;

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05]">
        <FileText className="size-4.5 text-foreground/70" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{upload.fileName}</div>
        <AnimatePresence mode="wait" initial={false}>
          {isDone ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("truncate text-xs", upload.errorMessage ? "text-held" : "text-muted-foreground")}>
              {upload.errorMessage ?? `${upload.vendorName ?? "Vendor"} · ${upload.headline ?? "All 8 stamps passed"}`}
            </motion.div>
          ) : (
            <motion.div key="working" exit={{ opacity: 0 }} className="mt-1.5 flex items-center gap-2">
              {upload.activityLine ? (
                <span className="truncate text-xs text-muted-foreground">{upload.activityLine}</span>
              ) : (
                <>
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-16" />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="w-36 shrink-0 text-right">
        {isDone && !outcome ? (
          <div className="flex items-center justify-end gap-1 text-xs font-medium text-held"><CircleX className="size-3.5" /> Not processed</div>
        ) : isDone && outcome ? (
          <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}>
            <div className="text-sm font-semibold">{upload.amountCents ? formatDollars(upload.amountCents) : "–"}</div>
            <div className={cn("flex items-center justify-end gap-1 text-xs font-medium", outcome.className)}>
              <outcome.icon className="size-3.5" /> {outcome.label}
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-3.5 w-16" />
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader className="size-3 animate-spin" /> {STAGE_LABEL[upload.stage as Exclude<UploadStage, "done">]}
            </span>
          </div>
        )}
      </div>
      <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:block">{formatFileSize(upload.sizeBytes)}</span>
    </motion.div>
  );
}
