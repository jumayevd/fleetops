"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Camera } from "lucide-react";
import { buttonClass, inputClass } from "../ui";

const MAX_BYTES = 4 * 1024 * 1024;

/** Shrink phone photos (often 4–8 MB) to ≤2000px JPEG before upload. */
async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function DocumentUploader({ target, kinds, labels, defaultKind, withExpiry, camera }: {
  target: { type: string; id: string };
  kinds: readonly string[];
  labels: Record<string, string>;
  defaultKind?: string;
  withExpiry?: boolean;
  camera?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(defaultKind ?? kinds[0]);
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "err" | "busy"; text: string } | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const original of Array.from(files)) {
      setStatus({ tone: "busy", text: `Uploading ${original.name}…` });
      const file = await compressImage(original);
      if (file.size > MAX_BYTES) { setStatus({ tone: "err", text: `${original.name} is over 4 MB` }); continue; }
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      fd.set(`${target.type}Id`, target.id);
      if (expiresAt) fd.set("expiresAt", expiresAt);
      const res = await fetch("/api/documents", { method: "POST", body: fd }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : { error: "Network error" };
      if (!res?.ok) { setStatus({ tone: "err", text: data.error ?? "Upload failed" }); return; }
    }
    setStatus({ tone: "ok", text: "Uploaded" });
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${inputClass} w-auto flex-1`} aria-label="Document type">
          {kinds.map((k) => <option key={k} value={k}>{labels[k] ?? k}</option>)}
        </select>
        {withExpiry && (
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={`${inputClass} w-auto`} aria-label="Expiry date" title="Expiry date (optional)" />
        )}
      </div>
      <div className="flex gap-2">
        <label className={`${buttonClass("secondary")} flex-1 cursor-pointer`}>
          <Upload className="h-4 w-4" /> Choose files
          <input ref={fileRef} type="file" multiple className="sr-only" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv"
            disabled={status?.tone === "busy"} onChange={(e) => upload(e.target.files)} />
        </label>
        {camera && (
          <label className={`${buttonClass("primary")} flex-1 cursor-pointer`}>
            <Camera className="h-4 w-4" /> Take photo
            <input type="file" accept="image/*" capture="environment" className="sr-only"
              disabled={status?.tone === "busy"} onChange={(e) => upload(e.target.files)} />
          </label>
        )}
      </div>
      {withExpiry && <p className="text-xs text-slate-400">Set an expiry date to get reminded 30 days before it lapses.</p>}
      {status && (
        <p className={`text-xs ${status.tone === "err" ? "text-rose-600" : status.tone === "ok" ? "text-emerald-600" : "text-slate-500"}`}>{status.text}</p>
      )}
    </div>
  );
}
