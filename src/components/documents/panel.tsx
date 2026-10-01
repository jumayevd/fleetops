import { FileText, FileImage, Download } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { DOC_KINDS, DOC_KIND_LABELS, canDeleteDoc, canUploadDoc, listDocs, type DocTarget } from "@/lib/documents";
import { date, daysUntil } from "@/lib/format";
import { Card, ExpiryBadge } from "../ui";
import { DocumentUploader } from "./uploader";
import { DeleteDocumentButton } from "./delete-button";

const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

/** Documents attached to a load / truck / driver / customer, with upload for permitted users. */
export async function DocumentsPanel({ user, target, path, title = "Documents", withExpiry, camera, defaultKind, plain }: {
  user: CurrentUser; target: DocTarget; path: string; title?: string; withExpiry?: boolean; camera?: boolean; defaultKind?: string; plain?: boolean;
}) {
  const docs = await listDocs(target);
  const uploadable = [];
  for (const k of DOC_KINDS[target.type]) if (await canUploadDoc(user, target, k)) uploadable.push(k);
  const deletable = new Set<string>();
  for (const d of docs) if (await canDeleteDoc(user, d)) deletable.add(d.id);

  const body = (
    <div className="space-y-4">
      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {docs.map((d) => {
            const Icon = d.contentType.startsWith("image/") ? FileImage : FileText;
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <Icon className="h-5 w-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-blue-700 hover:underline">{d.name}</a>
                  <p className="text-xs text-slate-500">
                    {DOC_KIND_LABELS[d.kind] ?? d.kind} · {fmtSize(d.size)} · {d.uploadedBy?.name ?? "—"} · {date(d.createdAt)}
                  </p>
                </div>
                {d.expiresAt && <ExpiryBadge days={daysUntil(d.expiresAt)} />}
                <a href={`/api/documents/${d.id}?download`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Download ${d.name}`}><Download className="h-4 w-4" /></a>
                {deletable.has(d.id) && <DeleteDocumentButton id={d.id} name={d.name} path={path} />}
              </li>
            );
          })}
        </ul>
      )}
      {uploadable.length > 0 && (
        <DocumentUploader target={target} kinds={uploadable} labels={DOC_KIND_LABELS} withExpiry={withExpiry} camera={camera}
          defaultKind={defaultKind && uploadable.includes(defaultKind as never) ? defaultKind : undefined} />
      )}
    </div>
  );
  return plain ? body : <Card title={`${title}${docs.length ? ` (${docs.length})` : ""}`}>{body}</Card>;
}
