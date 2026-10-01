"use client";

import { startTransition, useActionState, useRef } from "react";
import { login } from "@/app/actions/auth";
import { Field, Input, buttonClass } from "@/components/ui";

export function LoginForm({ demoAccounts }: { demoAccounts: { role: string; email: string }[] }) {
  const [state, action, pending] = useActionState(login, undefined);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} className="mt-6 space-y-4" onSubmit={(e) => {
        // Manual submit keeps the email filled in if the password was wrong.
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}>
        <Field label="Email"><Input ref={email} name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password"><Input ref={password} name="password" type="password" autoComplete="current-password" required /></Field>
        {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
        <button disabled={pending} className={buttonClass("primary") + " w-full"}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      {demoAccounts.length > 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Demo mode — sign in as</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {demoAccounts.map((a) => (
              <button key={a.email} type="button" className={buttonClass("secondary", "sm")}
                onClick={() => {
                  email.current!.value = a.email;
                  password.current!.value = "demo1234";
                  formRef.current!.requestSubmit();
                }}>
                {a.role}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
