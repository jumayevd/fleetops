import Link from "next/link";
import clsxBase, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";
import { humanize } from "@/lib/constants";

/** clsx + tailwind-merge: later classes override earlier conflicting ones (e.g. p-5 → p-0). */
export const cn = (...v: ClassValue[]) => twMerge(clsxBase(v));
const clsx = cn;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={clsx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={clsx("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = "slate", icon }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "slate" | "blue" | "green" | "amber" | "red" | "violet"; icon?: ReactNode;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className={clsx("rounded-lg p-1.5", tones[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  // loads
  PLANNED: "bg-slate-100 text-slate-700 ring-slate-200",
  ASSIGNED: "bg-blue-50 text-blue-700 ring-blue-200",
  IN_TRANSIT: "bg-violet-50 text-violet-700 ring-violet-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  INVOICED: "bg-teal-50 text-teal-700 ring-teal-200",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-200",
  // assets
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MAINTENANCE: "bg-amber-50 text-amber-700 ring-amber-200",
  OUT_OF_SERVICE: "bg-rose-50 text-rose-700 ring-rose-200",
  // drivers
  AVAILABLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ON_DUTY: "bg-blue-50 text-blue-700 ring-blue-200",
  DRIVING: "bg-violet-50 text-violet-700 ring-violet-200",
  OFF_DUTY: "bg-slate-100 text-slate-600 ring-slate-200",
  ON_LEAVE: "bg-amber-50 text-amber-700 ring-amber-200",
  // maintenance / invoices
  SCHEDULED: "bg-blue-50 text-blue-700 ring-blue-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  SENT: "bg-blue-50 text-blue-700 ring-blue-200",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  OVERDUE: "bg-rose-50 text-rose-700 ring-rose-200",
  VOID: "bg-slate-100 text-slate-500 ring-slate-200",
  // priority
  LOW: "bg-slate-100 text-slate-600 ring-slate-200",
  NORMAL: "bg-slate-100 text-slate-700 ring-slate-200",
  HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
  URGENT: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function Badge({ value, label, className }: { value: string; label?: string; className?: string }) {
  return (
    <span className={clsx(
      "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
      BADGE_TONES[value] ?? "bg-slate-100 text-slate-700 ring-slate-200", className,
    )}>
      {label ?? humanize(value)}
    </span>
  );
}

const BTN = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
  secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  ghost: "text-slate-600 hover:bg-slate-100",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};
export type ButtonVariant = keyof typeof BTN;
export const buttonClass = (variant: ButtonVariant = "primary", size: "sm" | "md" = "md") =>
  clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
    BTN[variant],
  );

export function LinkButton({ href, variant, size, children, className }: {
  href: string; variant?: ButtonVariant; size?: "sm" | "md"; children: ReactNode; className?: string;
}) {
  return <Link href={href} className={clsx(buttonClass(variant, size), className)}>{children}</Link>;
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button {...props} className={clsx(buttonClass(variant, size), className)} />;
}

export const inputClass =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600";

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={clsx(inputClass, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={clsx(inputClass, props.className)} />;
}
export function Select({ options, placeholder, ...props }: ComponentProps<"select"> & {
  options: readonly (string | { value: string; label: string })[]; placeholder?: string;
}) {
  return (
    <select {...props} className={clsx(inputClass, "pr-8", props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? humanize(o) : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&_td]:px-4 [&_td]:py-3 [&_tr:hover]:bg-slate-50/70">{children}</tbody>
      </table>
      {empty && <EmptyState title="Nothing here yet" />}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

export function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-sm font-medium text-slate-800">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href}
          className={clsx("-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-slate-400">—</span>;
  if (days < 0) return <Badge value="OUT_OF_SERVICE" label={`Expired ${-days}d ago`} />;
  if (days <= 30) return <Badge value="MAINTENANCE" label={`${days}d left`} />;
  return <span className="text-slate-600">{days}d</span>;
}
