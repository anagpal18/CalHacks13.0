// The judge's turn in the duel: hand in a W-9. The file stays in this browser (no OCR, nothing uploaded anywhere);
// the judge confirms or edits what it claims, and CRS cross-examines those fields like any other exhibit.
// A .txt or .json file with "Name:", "EIN:", "Address:" and "Signed:" lines fills the fields in by itself.

import { useEffect, useState } from "react";
import type { UploadedW9 } from "@terms-room/shared";
import { useStore } from "../state/store";

const FIELDS: [keyof UploadedW9, string][] = [["legalName", "Legal name"], ["ein", "EIN"], ["address", "Address"], ["signer", "Signed by"]];

function parse(text: string): Partial<UploadedW9> {
  try {
    const j = JSON.parse(text) as Record<string, string>;
    return { legalName: j.legalName ?? j.name, ein: j.ein, address: j.address, signer: j.signer ?? j.signed };
  } catch { /* not JSON: read "Key: value" lines */ }
  const get = (re: RegExp) => text.match(re)?.[1]?.trim();
  return { legalName: get(/(?:legal\s*)?name\s*[:=]\s*(.+)/i), ein: get(/ein\s*[:=]\s*([\d-]+)/i), address: get(/address\s*[:=]\s*(.+)/i), signer: get(/sign(?:ed|er)(?:\s*by)?\s*[:=]\s*(.+)/i) };
}

export function UploadCard() {
  const upload = useStore((s) => s.table.upload);
  const playedAll = useStore((s) => s.played >= s.events.length);
  const [w9, setW9] = useState<UploadedW9 | null>(null);
  const [file, setFile] = useState<{ name: string; size: number; url?: string } | null>(null);
  useEffect(() => { if (upload) { setW9({ ...upload.draft }); setFile(null); } }, [upload]);
  useEffect(() => () => { if (file?.url) URL.revokeObjectURL(file.url); }, [file]);
  if (!upload || !w9 || !playedAll) return null;
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile({ name: f.name, size: f.size, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined });
    if (/\.(txt|json)$/i.test(f.name) || f.type.startsWith("text/") || f.type === "application/json") {
      const p = parse(await f.text());
      setW9((cur) => ({ ...cur!, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) }));
    }
  };
  const submit = (x: UploadedW9 | null) => void useStore.getState().submitUpload(x);
  return (
    <aside className="inspector upload" role="dialog" aria-label="Hand in a document">
      <span className="eyebrow">The duel pauses · your turn</span>
      <h2>Hand in a W-9</h2>
      <p>{upload.prompt}</p>
      <label className="drop">
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.json,image/*,application/pdf" onChange={(e) => void onFile(e.target.files?.[0])} />
        {file ? <span><b>{file.name}</b> · {(file.size / 1024).toFixed(0)} KB · stays in this browser</span> : <span><b>Choose a file</b> (PDF, image, or a .txt with Name / EIN / Address lines)</span>}
      </label>
      {file?.url && <img className="preview" src={file.url} alt="The uploaded document" />}
      <p className="note">No OCR: confirm or edit what the document claims. Change a digit of the EIN to doctor it. CRS checks these fields against the business record.</p>
      <div className="w9-fields">
        {FIELDS.map(([k, label]) => (
          <label key={k}>{label}<input value={w9[k] ?? ""} onChange={(e) => setW9({ ...w9, [k]: e.target.value })} spellCheck={false} /></label>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => submit({ ...w9, fileName: file?.name })}>Cross-examine it</button>
        <button className="btn" onClick={() => submit(null)}>Let the vendor play its own</button>
      </div>
    </aside>
  );
}
