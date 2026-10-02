"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteDocument } from "@/app/actions/documents";
import { IconButton } from "../ui";

export function DeleteDocumentButton({ id, name, path }: { id: string; name: string; path: string }) {
  const [pending, start] = useTransition();
  return (
    <IconButton
      label={`Delete ${name}`}
      disabled={pending}
      className="text-fg-subtle hover:bg-danger-soft hover:text-danger"
      onClick={() => {
        if (window.confirm(`Delete "${name}"? This can't be undone.`)) start(() => deleteDocument(id, path));
      }}
    >
      <Trash2 />
    </IconButton>
  );
}
