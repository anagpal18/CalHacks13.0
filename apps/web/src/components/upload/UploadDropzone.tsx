// Drop or pick bills (PDF, image or forwarded email). Each file goes to the agents' gateway for checking.

import { FileUp, Sparkles } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { primaryButton } from "@/lib/buttonStyles";
import { cn } from "@/lib/utils";
import { useUploadSession } from "./UploadSessionContext";

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.eml,.msg";

export function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const { addFiles, addSampleBills } = useUploadSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const droppedFiles = [...event.dataTransfer.files];
    if (droppedFiles.length > 0) addFiles(droppedFiles);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors",
        compact ? "gap-3 px-6 py-6 sm:flex-row sm:justify-between sm:text-left" : "gap-4 px-8 py-14",
        isDragging ? "border-foreground/50 bg-foreground/[0.03]" : "border-foreground/15 bg-background",
      )}
    >
      <div className={cn("flex items-center gap-4", !compact && "flex-col")}>
        <span className={cn("flex items-center justify-center rounded-2xl bg-card shadow-[0_1px_2px_rgb(31_36_51/0.06)]", compact ? "size-11" : "size-14")}>
          <FileUp className={compact ? "size-5" : "size-6"} />
        </span>
        <div>
          <div className={cn("font-semibold tracking-tight", compact ? "text-base" : "text-xl")}>{compact ? "Upload more bills" : "Drop this week's bills here"}</div>
          <div className="mt-1 text-sm text-muted-foreground">PDF, photo or forwarded email. Each one is checked by the agents before it's booked.</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => fileInputRef.current?.click()} className={primaryButton("md")}>
          <FileUp className="size-4" /> Choose files
        </button>
        <button onClick={addSampleBills} className={primaryButton("md")}>
          <Sparkles className="size-4" /> Use sample bills
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(event) => {
          const pickedFiles = [...(event.target.files ?? [])];
          if (pickedFiles.length > 0) addFiles(pickedFiles);
          event.target.value = "";
        }}
      />
    </div>
  );
}
