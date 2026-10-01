"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteDocument } from "@/app/actions/documents";

export function DeleteDocumentButton({ id, name, path }: { id: string; name: string; path: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      aria-label={`Delete ${name}`}
      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      onClick={() => {
        if (window.confirm(`Delete "${name}"? This can't be undone.`)) start(() => deleteDocument(id, path));
      }}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
