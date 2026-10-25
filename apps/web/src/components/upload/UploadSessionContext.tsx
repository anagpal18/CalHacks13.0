// The bills uploaded this session and where each one is in processing.
// Lives above the router so switching tabs doesn't lose an in-flight upload.
//
// Live mode: upload each bill to the gateway (POST /dashboard/inbox), then ask the orchestrator to process it
// (POST /dashboard/agent/chat). Its streamed events move the row along; the final status comes from the gateway.
// Demo mode: the same stages on a timer, resolving to seeded bills.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useDemoMode } from "@/components/layout/DemoModeContext";
import { mockSubmitBill, mockUploadResult, outcomeFromBill, SAMPLE_BILL_FILES } from "@/data/dataSource";
import { gatewayClient } from "@/data/gatewayClient";
import type { UploadedBill, UploadStage } from "@/data/types";

export type UploadPhase = "idle" | "processing" | "processed";

/** Real files from the dropzone, or name/size stand-ins for demo sample bills. */
type BillFile = File | { name: string; size: number };

// Demo-mode stage timing and the stagger between bills.
const STAGE_DURATION_MS: Record<Exclude<UploadStage, "done">, number> = { uploading: 600, reading: 1_100, checking: 1_500 };
const STAGGER_MS = 450;

// Real sample bills served from apps/web/public/sample-bills (one folder = one bill), for live mode.
const LIVE_SAMPLE_BILLS = [
  ["1-bay-lumber-price-creep/email.eml", "1-bay-lumber-price-creep/BL-55231.pdf"],
  ["2-ghost-vendor-pettigrew/email.eml", "2-ghost-vendor-pettigrew/PGT-001.pdf"],
];

interface UploadSession {
  uploads: UploadedBill[];
  phase: UploadPhase;
  addBills: (bills: BillFile[][]) => void;
  addSampleBills: () => void;
  clearUploads: () => void;
}

const UploadSessionContext = createContext<UploadSession | null>(null);

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function UploadSessionProvider({ children }: { children: ReactNode }) {
  const { mode } = useDemoMode();
  const [uploads, setUploads] = useState<UploadedBill[]>([]);
  const uploadCounter = useRef(0);
  // Live bills run one at a time: each Creao run is slow and rate-limited.
  const liveQueue = useRef<Promise<void>>(Promise.resolve());

  const updateUpload = useCallback((uploadId: string, changes: Partial<UploadedBill>) => {
    setUploads((current) => current.map((upload) => (upload.uploadId === uploadId ? { ...upload, ...changes } : upload)));
  }, []);

  const processDemoBill = useCallback(
    async (upload: UploadedBill, uploadIndex: number, delayMs: number) => {
      await wait(delayMs);
      const { billId } = await mockSubmitBill(uploadIndex);
      await wait(STAGE_DURATION_MS.uploading);
      updateUpload(upload.uploadId, { billId, stage: "reading" });
      await wait(STAGE_DURATION_MS.reading);
      updateUpload(upload.uploadId, { stage: "checking" });
      const [result] = await Promise.all([mockUploadResult(billId), wait(STAGE_DURATION_MS.checking)]);
      updateUpload(upload.uploadId, { stage: "done", ...result });
    },
    [updateUpload],
  );

  const processLiveBill = useCallback(
    async (upload: UploadedBill, files: File[]) => {
      let billId: string | undefined;
      try {
        const received = await gatewayClient.uploadBill(files);
        billId = received.billId;
        updateUpload(upload.uploadId, { billId, stage: "reading", activityLine: "Waiting for the AP desk lead…" });

        let streamError: string | undefined;
        await gatewayClient.chatWithOrchestrator(`Process bill ${billId}.`, (type, data) => {
          if (type === "tool_start" && data?.name === "run_seat_agent") {
            const seat = data.input?.seat;
            updateUpload(upload.uploadId, { stage: seat === "intake" ? "reading" : "checking", activityLine: `${seatLabel(seat)} started` });
          }
          if (type === "activity" && data?.line) updateUpload(upload.uploadId, { activityLine: `${seatLabel(data.seat)}: ${data.line}` });
          if (type === "error") streamError = data?.message ?? "The orchestrator stopped with an error";
        });

        const finalBill = await gatewayClient.getBill(billId);
        const result = outcomeFromBill(finalBill);
        updateUpload(upload.uploadId, {
          stage: "done",
          ...result,
          errorMessage: result.outcome ? undefined : streamError ?? "The agents did not finish this bill. Ask the AP desk lead to retry.",
        });
      } catch (error) {
        updateUpload(upload.uploadId, { stage: "done", billId, errorMessage: (error as Error).message });
      }
    },
    [updateUpload],
  );

  const addBills = useCallback(
    (bills: BillFile[][]) => {
      const newUploads = bills.map((files) => ({
        uploadId: `up-${uploadCounter.current++}`,
        fileName: files.map((file) => file.name.split("/").pop()).join(" + "),
        sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
        stage: "uploading" as const,
      }));
      setUploads((current) => [...current, ...newUploads]);

      newUploads.forEach((upload, index) => {
        const files = bills[index];
        const hasRealFiles = files.every((file) => file instanceof File);
        if (mode === "live" && hasRealFiles) {
          liveQueue.current = liveQueue.current.then(() => processLiveBill(upload, files as File[]));
        } else {
          processDemoBill(upload, Number(upload.uploadId.slice(3)), index * STAGGER_MS);
        }
      });
    },
    [mode, processDemoBill, processLiveBill],
  );

  const addSampleBills = useCallback(async () => {
    if (mode !== "live") return addBills(SAMPLE_BILL_FILES.map((file) => [file]));
    const bills = await Promise.all(
      LIVE_SAMPLE_BILLS.map((paths) =>
        Promise.all(
          paths.map(async (samplePath) => {
            const blob = await (await fetch(`/sample-bills/${samplePath}`)).blob();
            return new File([blob], samplePath.split("/").pop()!, { type: blob.type });
          }),
        ),
      ),
    );
    addBills(bills);
  }, [mode, addBills]);

  const value = useMemo<UploadSession>(() => {
    const phase: UploadPhase = uploads.length === 0 ? "idle" : uploads.some((upload) => upload.stage !== "done") ? "processing" : "processed";
    return { uploads, phase, addBills, addSampleBills, clearUploads: () => setUploads([]) };
  }, [uploads, addBills, addSampleBills]);

  return <UploadSessionContext.Provider value={value}>{children}</UploadSessionContext.Provider>;
}

function seatLabel(seat: unknown): string {
  return seat === "intake" ? "Intake" : seat === "vendor_records" ? "Vendor-Records" : seat === "matching" ? "Matching" : "Agent";
}

export function useUploadSession() {
  const session = useContext(UploadSessionContext);
  if (!session) throw new Error("useUploadSession must be used inside UploadSessionProvider");
  return session;
}
