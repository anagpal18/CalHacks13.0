// The bills uploaded this session and where each one is in processing.
// Lives above the router so switching tabs doesn't lose an in-flight upload.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { getUploadResult, SAMPLE_BILL_FILES, submitBillToGateway } from "@/data/dataSource";
import type { UploadedBill, UploadStage } from "@/data/types";

export type UploadPhase = "idle" | "processing" | "processed";

// How long each visible stage lasts in the mock, and the stagger between files.
const STAGE_DURATION_MS: Record<Exclude<UploadStage, "done">, number> = { uploading: 600, reading: 1_100, checking: 1_500 };
const STAGGER_MS = 450;

interface UploadSession {
  uploads: UploadedBill[];
  phase: UploadPhase;
  addFiles: (files: { name: string; size: number }[]) => void;
  addSampleBills: () => void;
  clearUploads: () => void;
}

const UploadSessionContext = createContext<UploadSession | null>(null);

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function UploadSessionProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadedBill[]>([]);
  const uploadCounter = useRef(0);

  const updateUpload = useCallback((uploadId: string, changes: Partial<UploadedBill>) => {
    setUploads((current) => current.map((upload) => (upload.uploadId === uploadId ? { ...upload, ...changes } : upload)));
  }, []);

  const processOne = useCallback(
    async (upload: UploadedBill, uploadIndex: number, delayMs: number) => {
      await wait(delayMs);
      const { billId } = await submitBillToGateway({ name: upload.fileName, size: upload.sizeBytes }, uploadIndex);
      await wait(STAGE_DURATION_MS.uploading);
      updateUpload(upload.uploadId, { billId, stage: "reading" });
      await wait(STAGE_DURATION_MS.reading);
      updateUpload(upload.uploadId, { stage: "checking" });
      const [result] = await Promise.all([getUploadResult(billId), wait(STAGE_DURATION_MS.checking)]);
      updateUpload(upload.uploadId, { stage: "done", ...result });
    },
    [updateUpload],
  );

  const addFiles = useCallback(
    (files: { name: string; size: number }[]) => {
      const newUploads = files.map((file) => ({ uploadId: `up-${uploadCounter.current++}`, fileName: file.name, sizeBytes: file.size, stage: "uploading" as const }));
      setUploads((current) => [...current, ...newUploads]);
      newUploads.forEach((upload, index) => processOne(upload, Number(upload.uploadId.slice(3)), index * STAGGER_MS));
    },
    [processOne],
  );

  const value = useMemo<UploadSession>(() => {
    const phase: UploadPhase = uploads.length === 0 ? "idle" : uploads.some((upload) => upload.stage !== "done") ? "processing" : "processed";
    return { uploads, phase, addFiles, addSampleBills: () => addFiles(SAMPLE_BILL_FILES), clearUploads: () => setUploads([]) };
  }, [uploads, addFiles]);

  return <UploadSessionContext.Provider value={value}>{children}</UploadSessionContext.Provider>;
}

export function useUploadSession() {
  const session = useContext(UploadSessionContext);
  if (!session) throw new Error("useUploadSession must be used inside UploadSessionProvider");
  return session;
}
