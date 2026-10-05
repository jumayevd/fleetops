import Link from "next/link";
import clsxBase, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";
import { humanize } from "@/lib/constants";

/** clsx + tailwind-merge: later classes override earlier conflicting ones. */
export const cn = (...v: ClassValue[]) => twMerge(clsxBase(v));
const clsx = cn;

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function PageHeader({ title, eyebrow, subtitle, actions, children }: {
  title: ReactNode; eyebrow?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="truncate text-[20px] font-semibold leading-7 tracking-tight text-fg">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[13px] text-fg-muted">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName, flush, id }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string;
  /** No body padding (tables, lists, maps). */
  flush?: boolean;
}) {
  return (
    <section id={id} className={clsx("rounded-lg border border-line bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-2 border-b border-line px-4 py-2">
          <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(flush ? "" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info" | "progress";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted", accent: "text-accent-text", ok: "text-ok", warn: "text-warn",
  danger: "text-danger", info: "text-info", progress: "text-progress",
};
export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-fg-muted", accent: "bg-accent-soft text-accent-text", ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info",
  progress: "bg-progress-soft text-progress",
};
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-fg-faint", accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", info: "bg-info", progress: "bg-progress",
};

// Legacy palette names from the first version of the kit; prefer Tone names in new code.
const LEGACY_TONE: Record<string, Tone> = { slate: "neutral", blue: "info", green: "ok", amber: "warn", red: "danger", violet: "progress" };
type ToneLike = Tone | keyof typeof LEGACY_TONE;
const toTone = (t: ToneLike | undefined): Tone => (t ? (LEGACY_TONE[t] ?? (t as Tone)) : "neutral");

/** KPI tile. `delta` like "+12%" / "-3 pts" is coloured by sign unless `deltaTone` is given. */
export function Stat({ label, value, hint, tone: toneIn = "neutral", icon, delta, deltaTone, spark, className }: {
  label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: ToneLike; icon?: ReactNode;
  delta?: string; deltaTone?: Tone; spark?: ReactNode; className?: string;
}) {
  const tone = toTone(toneIn);
  const dTone: Tone = deltaTone ?? (delta?.trim().startsWith("-") || delta?.trim().startsWith("▼") ? "danger" : "ok");
  return (
    <div className={clsx("rounded-lg border border-line bg-surface px-4 py-3 shadow-card", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow truncate">{label}</p>
        {icon && <span className={clsx("shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5", TONE_TEXT[tone])}>{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p className="num text-[22px] font-semibold leading-none text-fg">{value}</p>
        {delta && <span className={clsx("num text-[11px] font-medium", TONE_TEXT[dTone])}>{delta}</span>}
      </div>
      {spark && <div className="mt-2">{spark}</div>}
      {hint && <p className="mt-1.5 truncate text-[11px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/** Single source of truth: status value → tone. Add new statuses here, never inline. */
export const STATUS_TONE: Record<string, Tone> = {
  // loads
  PLANNED: "neutral", BOOKED: "neutral", ASSIGNED: "info", DISPATCHED: "info", IN_TRANSIT: "progress",
  DELIVERED: "ok", INVOICED: "ok", CANCELLED: "danger", TONU: "warn",
  // billing stage
  MISSING_DOCS: "warn", READY_TO_INVOICE: "info",
  // assets
  ACTIVE: "ok", MAINTENANCE: "warn", OUT_OF_SERVICE: "danger", INACTIVE: "neutral",
  // trailers
  IN_USE: "progress", EMPTY: "ok", DROPPED: "info", YARD: "neutral", SHOP: "warn",
  // driver employment / board statuses
  AVAILABLE: "ok", READY: "ok", ON_DUTY: "info", DRIVING: "progress", EN_ROUTE: "progress", AT_PICKUP: "info",
  UNLOADING: "info", STOP: "danger", REST: "neutral", HOME: "neutral", OFF_DUTY: "neutral", ON_LEAVE: "warn", VACATION: "warn",
  COVERED: "info", HOLD: "warn",
  // maintenance / work orders / invoices
  SCHEDULED: "info", IN_PROGRESS: "warn", DONE: "ok", COMPLETED: "ok", OPEN: "info",
  DRAFT: "neutral", SENT: "info", PAID: "ok", OVERDUE: "danger", VOID: "neutral",
  // claims
  REPORTED: "warn", UNDER_REVIEW: "info", DOCS_COLLECTED: "info", SUBMITTED: "info", NEGOTIATION: "progress",
  APPROVED: "ok", DENIED: "danger", CLOSED: "neutral", DISPUTED: "warn", LITIGATION: "danger",
  // priority / severity
  LOW: "neutral", NORMAL: "neutral", MEDIUM: "info", HIGH: "warn", URGENT: "danger", CRITICAL: "danger",
};

export function Badge({ value, label, tone, className, dot }: {
  value: string; label?: string; tone?: Tone; className?: string; dot?: boolean;
}) {
  const t = tone ?? STATUS_TONE[value] ?? "neutral";
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-4", TONE_SOFT[t], className)}>
      {dot && <span className={clsx("h-1.5 w-1.5 rounded-full", TONE_DOT[t])} />}
      {label ?? humanize(value)}
    </span>
  );
}

/** Quiet flag chip in sentence case: Hold, No RC, Hazmat… */
export function Chip({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx("inline-flex items-center whitespace-nowrap rounded border px-1.5 text-[11px] font-medium leading-4",
      tone === "neutral" ? "border-line text-fg-muted" : clsx(TONE_SOFT[tone], "border-transparent"), className)}>
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral", pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={clsx("relative inline-flex h-2 w-2 shrink-0", className)}>
      {pulse && <span className={clsx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", TONE_DOT[tone])} />}
      <span className={clsx("relative inline-flex h-2 w-2 rounded-full", TONE_DOT[tone])} />
    </span>
  );
}

export function LiveDot({ label = "Live", className }: { label?: string; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-muted", className)}>
      <StatusDot tone="accent" pulse /> {label}
    </span>
  );
}

export function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-fg-faint">—</span>;
  if (days < 0) return <Badge value="OVERDUE" label={`Expired ${-days}d ago`} />;
  if (days <= 30) return <Badge value="HIGH" label={`${days}d left`} />;
  return <span className="num text-fg-muted">{days}d</span>;
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

const BTN = {
  primary: "bg-primary text-on-primary shadow-card hover:bg-primary-hover",
  accent: "bg-accent text-on-accent shadow-card hover:bg-accent-hover",
  secondary: "border border-line bg-surface text-fg shadow-card hover:border-line-strong hover:bg-raised",
  ghost: "text-fg-muted hover:bg-raised hover:text-fg",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-ok text-white hover:opacity-90",
};
export type ButtonVariant = keyof typeof BTN;
export const buttonClass = (variant: ButtonVariant = "primary", size: "sm" | "md" = "md") =>
  clsx(
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
    size === "sm" ? "h-7 px-2.5 text-[12px] [&_svg]:h-3.5 [&_svg]:w-3.5" : "h-8 px-3 text-[13px] [&_svg]:h-4 [&_svg]:w-4",
    BTN[variant],
  );

export function LinkButton({ href, variant, size, children, className, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string; variant?: ButtonVariant; size?: "sm" | "md"; children: ReactNode; className?: string;
}) {
  return <Link href={href} {...rest} className={clsx(buttonClass(variant, size), className)}>{children}</Link>;
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button type={props.type ?? "button"} {...props} className={clsx(buttonClass(variant, size), className)} />;
}

export function IconButton({ className, label, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...props}
      className={clsx("inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-[color,background-color,transform] duration-150 hover:bg-raised hover:text-fg active:scale-95 disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4", className)} />
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={clsx("inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-sunken px-1 font-mono text-[10px] text-fg-subtle", className)}>{children}</kbd>;
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

export const inputClass =
  "block h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-fg-faint hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50";

export function Field({ label, children, hint, className, required }: {
  label: string; children: ReactNode; hint?: ReactNode; className?: string; required?: boolean;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-[12px] font-medium text-fg-muted">{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={clsx(inputClass, props.type === "checkbox" && "h-4 w-4 rounded border-line-strong accent-[var(--accent)]", props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={clsx(inputClass, "h-auto py-1.5", props.className)} />;
}
export function Select({ options, placeholder, ...props }: ComponentProps<"select"> & {
  options: readonly (string | { value: string; label: string })[]; placeholder?: string;
}) {
  return (
    <select {...props} className={clsx(inputClass, "pr-7", props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? humanize(o) : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={clsx("inline-flex cursor-pointer items-center gap-2 text-[13px] text-fg", className)}>
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-line-strong accent-[var(--accent)]" />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function Table({ head, children, empty, emptyTitle, emptyDescription, dense, className, stickyHead = true }: {
  head: ReactNode[]; children: ReactNode; empty?: boolean; emptyTitle?: string; emptyDescription?: string;
  dense?: boolean; className?: string; stickyHead?: boolean;
}) {
  return (
    <div className={clsx("overflow-auto", className)}>
      <table className="w-full min-w-max text-[13px]">
        <thead className={clsx(stickyHead && "sticky top-0 z-10")}>
          <tr className="bg-surface text-left text-[12px] text-fg-muted">
            {head.map((h, i) => <th key={i} className={clsx("whitespace-nowrap border-b border-line px-3 font-medium", dense ? "py-1.5" : "py-2")}>{h}</th>)}
          </tr>
        </thead>
        <tbody className={clsx("divide-y divide-line [&_td]:px-3 [&_tr:hover]:bg-raised", dense ? "[&_td]:py-1.5" : "[&_td]:py-2")}>{children}</tbody>
      </table>
      {empty && <EmptyState title={emptyTitle ?? "Nothing here yet"} description={emptyDescription} />}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-fg-faint [&_svg]:h-6 [&_svg]:w-6">{icon}</div>}
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {description && <p className="max-w-sm text-[12px] text-fg-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function DL({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={clsx("grid gap-x-5 gap-y-3", cols === 1 ? "grid-cols-1" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-fg-muted">{k}</dt>
          <dd className="mt-0.5 truncate text-[13px] font-medium text-fg">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Progress({ value, className, tone = "progress", marker }: { value: number; className?: string; tone?: Tone; marker?: number }) {
  return (
    <div className={clsx("relative h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}>
      <div className={clsx("h-full rounded-full transition-all", TONE_DOT[tone])} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
      {marker != null && <div className="absolute top-0 h-full w-px bg-fg" style={{ left: `${Math.round(marker * 100)}%` }} />}
    </div>
  );
}

export function Tabs({ tabs, active, className }: { tabs: { href: string; label: ReactNode; key: string; count?: number }[]; active: string; className?: string }) {
  return (
    <div className={clsx("mb-4 flex gap-0.5 border-b border-line", className)}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href}
          className={clsx("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
            t.key === active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
          {t.label}
          {t.count != null && <span className="num rounded bg-neutral-soft px-1 text-[10px] text-fg-subtle">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Link-based segmented control (filters that live in the URL). */
export function Segmented({ items, active, className }: { items: { href: string; label: ReactNode; key: string; count?: number }[]; active: string; className?: string }) {
  return (
    <div className={clsx("inline-flex rounded-md border border-line bg-surface p-0.5", className)}>
      {items.map((i) => (
        <Link key={i.key} href={i.href}
          className={clsx("inline-flex h-6 items-center gap-1 rounded px-2 text-[12px] font-medium transition-colors",
            i.key === active ? "bg-primary text-on-primary" : "text-fg-muted hover:text-fg")}>
          {i.label}{i.count != null && <span className={clsx("num text-[10px]", i.key === active ? "opacity-70" : "text-fg-subtle")}>{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Pill-style filter links (status filters above tables). */
export function FilterPills({ items, active }: { items: { href: string; label: ReactNode; key: string; count?: number }[]; active: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Link key={i.key} href={i.href}
          className={clsx("inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
            i.key === active ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg")}>
          {i.label}{i.count != null && <span className={clsx("num text-[10px]", i.key === active ? "opacity-70" : "text-fg-subtle")}>{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return (
    <span className={clsx("inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-soft font-medium text-fg-muted", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>{initials}</span>
  );
}

/** Two-line cell: primary + muted secondary. */
export function Cell({ primary, secondary, mono, className }: { primary: ReactNode; secondary?: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className={clsx("truncate text-fg", mono && "num")}>{primary}</div>
      {secondary && <div className="truncate text-[11px] text-fg-subtle">{secondary}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading skeletons                                                   */
/* ------------------------------------------------------------------ */

/** One shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton", className)} />;
}

/**
 * Page-shaped placeholder shown while a route streams in (see the loading.tsx files). It appears only after a
 * short delay, so quick navigations never flash it.
 */
export function PageSkeleton({ variant = "list" }: { variant?: "list" | "detail" | "board" }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="skeleton-delay">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3 w-80 max-w-[60vw]" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      {variant === "detail" ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <div className="rounded-lg border border-line bg-surface p-4 shadow-card"><Skeleton className="h-56 w-full" /></div>
            <div className="rounded-lg border border-line bg-surface p-4 shadow-card space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          </div>
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface p-4 shadow-card space-y-3">
                <Skeleton className="h-4 w-32" />
                {Array.from({ length: 4 }).map((__, j) => <Skeleton key={j} className="h-3 w-full" />)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            {Array.from({ length: variant === "board" ? 6 : 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3"><Skeleton className="h-3 w-1/3" /></div>
            {Array.from({ length: variant === "board" ? 10 : 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-40 sm:block" />
                <Skeleton className="h-5 w-16 rounded" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
