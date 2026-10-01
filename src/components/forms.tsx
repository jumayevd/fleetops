"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { cn as clsx } from "./ui";
import { buttonClass, type ButtonVariant } from "./ui";
import type { ActionState } from "@/lib/action";

const PendingContext = createContext(false);

export function SubmitButton({ children, variant = "primary", size, className, pendingText }: {
  children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md"; className?: string; pendingText?: string;
}) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" disabled={pending} className={clsx(buttonClass(variant, size), className)}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

/**
 * Form bound to a server action returning ActionState; shows errors/success inline.
 * Submits via startTransition instead of <form action> so React doesn't auto-reset
 * the fields — a validation error must not wipe what the user typed.
 */
export function ActionForm({ action, children, className, resetOnSuccess, confirm }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{state.error}</p>
      )}
      {state?.ok && !pending && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">{state.ok}</p>
      )}
    </form>
  );
}
