"use client";

import Link from "next/link";
import { useState } from "react";
import { Container, Truck as TruckIcon } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Select, Textarea, buttonClass, cn } from "@/components/ui";
import { WORK_ORDER_CATEGORIES, WORK_ORDER_CATEGORY_LABELS, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES, humanize } from "@/lib/constants";
import { money2, number } from "@/lib/format";
import type { ActionState } from "@/lib/action";

export type UnitOption = { id: string; unitNumber: string; detail: string; odometerKm?: number };

/** Serialisable initial values (dates as yyyy-mm-dd strings). */
export type WorkOrderFormValues = {
  truckId?: string | null; trailerId?: string | null;
  title?: string | null; description?: string | null;
  category?: string | null; priority?: string | null; status?: string | null;
  vendor?: string | null;
  scheduledAt?: string | null; inAt?: string | null; outAt?: string | null;
  odometerKm?: number | null; laborCost?: number | null; partsCost?: number | null; cost?: number | null;
  notes?: string | null;
};

type Mode = "truck" | "trailer";

const CATEGORY_OPTIONS = WORK_ORDER_CATEGORIES.map((c) => ({ value: c, label: WORK_ORDER_CATEGORY_LABELS[c] ?? humanize(c) }));
const STATUS_HINT: Record<string, string> = {
  DRAFT: "Draft: visible in the list, no effect on the unit.",
  OPEN: "Open: scheduled work, the unit stays in service until you start it.",
  IN_PROGRESS: "In progress puts the unit in the shop (truck → maintenance, trailer → shop).",
  DONE: "Done releases the unit. For a PM it also resets the service interval from the odometer below.",
  CANCELLED: "Cancelled: kept for history, nothing changes on the unit.",
};

const numOrEmpty = (v: number | null | undefined) => (v == null ? "" : String(v));

export function WorkOrderForm({ action, trucks, trailers, vendors = [], initial = {}, submitLabel, cancelHref }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  trucks: UnitOption[];
  trailers: UnitOption[];
  /** Known vendors, offered as autocomplete suggestions. */
  vendors?: string[];
  initial?: WorkOrderFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const [mode, setMode] = useState<Mode>(initial.trailerId && !initial.truckId ? "trailer" : "truck");
  const [truckId, setTruckId] = useState(initial.truckId ?? "");
  const [trailerId, setTrailerId] = useState(initial.trailerId ?? "");
  const [category, setCategory] = useState(initial.category ?? "OTHER");
  const [status, setStatus] = useState(initial.status ?? "OPEN");
  const [odometer, setOdometer] = useState(numOrEmpty(initial.odometerKm));
  const [odometerTouched, setOdometerTouched] = useState(initial.odometerKm != null);
  const [labor, setLabor] = useState(numOrEmpty(initial.laborCost));
  const [parts, setParts] = useState(numOrEmpty(initial.partsCost));
  const sumOf = (a: string, b: string) => (Number(a) || 0) + (Number(b) || 0);
  const [manualTotal, setManualTotal] = useState(initial.cost != null && initial.cost !== sumOf(numOrEmpty(initial.laborCost), numOrEmpty(initial.partsCost)));
  const [total, setTotal] = useState(numOrEmpty(initial.cost));

  const sum = sumOf(labor, parts);
  const shownTotal = manualTotal ? total : sum ? String(sum) : "";
  const truck = trucks.find((t) => t.id === truckId);

  // The odometer follows the picked truck until the user types a reading of their own.
  const pickTruck = (id: string) => {
    setTruckId(id);
    const t = trucks.find((x) => x.id === id);
    if (!odometerTouched) setOdometer(numOrEmpty(t?.odometerKm));
  };
  const switchMode = (next: Mode) => {
    setMode(next);
    if (!odometerTouched) setOdometer(next === "truck" ? numOrEmpty(truck?.odometerKm) : "");
  };

  const toggle = (next: Mode) => (
    <button type="button" onClick={() => switchMode(next)} aria-pressed={mode === next}
      className={cn("inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors",
        mode === next ? "bg-primary text-on-primary" : "text-fg-muted hover:text-fg")}>
      {next === "truck" ? <TruckIcon className="h-3.5 w-3.5" /> : <Container className="h-3.5 w-3.5" />}
      {next === "truck" ? "Truck" : "Trailer"}
    </button>
  );

  return (
    <ActionForm action={action} className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card title="Unit" actions={<div className="inline-flex rounded-md border border-line bg-surface p-0.5">{toggle("truck")}{toggle("trailer")}</div>}>
          {mode === "truck" ? (
            <Field label="Truck" required hint={truck ? `Odometer ${number(truck.odometerKm)} km · ${truck.detail}` : "Pick the tractor this work is for."}>
              <Select name="truckId" required value={truckId} onChange={(e) => pickTruck(e.target.value)} placeholder="Select a truck…"
                options={trucks.map((t) => ({ value: t.id, label: `${t.unitNumber} · ${t.detail}` }))} />
            </Field>
          ) : (
            <Field label="Trailer" required hint="Pick the trailer this work is for.">
              <Select name="trailerId" required value={trailerId} onChange={(e) => setTrailerId(e.target.value)} placeholder="Select a trailer…"
                options={trailers.map((t) => ({ value: t.id, label: `${t.unitNumber} · ${t.detail}` }))} />
            </Field>
          )}
        </Card>

        <Card title="Work">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required className="sm:col-span-2">
              <Input name="title" required defaultValue={initial.title ?? (category === "PM" ? "PM service" : "")} placeholder="e.g. Replace front brake pads" />
            </Field>
            <Field label="Category">
              <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORY_OPTIONS} />
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue={initial.priority ?? "MEDIUM"} options={WORK_ORDER_PRIORITIES.map((p) => ({ value: p, label: humanize(p) }))} />
            </Field>
            <Field label="Status" hint={STATUS_HINT[status]}>
              <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)} options={WORK_ORDER_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
            </Field>
            <Field label="Vendor / shop" hint="Leave empty for the in-house workshop.">
              <Input name="vendor" defaultValue={initial.vendor ?? ""} placeholder="e.g. Volvo Center Tashkent" list={vendors.length ? "wo-vendors" : undefined} />
              {vendors.length > 0 && <datalist id="wo-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>}
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea name="description" defaultValue={initial.description ?? ""} placeholder="Symptoms, diagnosis, parts to order…" />
            </Field>
            <Field label="Internal notes" className="sm:col-span-2" hint="Not shown to vendors or drivers.">
              <Textarea name="notes" rows={2} defaultValue={initial.notes ?? ""} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Schedule">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Scheduled for" required><Input name="scheduledAt" type="date" required defaultValue={initial.scheduledAt ?? new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="Into the shop"><Input name="inAt" type="date" defaultValue={initial.inAt ?? ""} /></Field>
            <Field label="Out of the shop"><Input name="outAt" type="date" defaultValue={initial.outAt ?? ""} /></Field>
            <Field label="Odometer (km)" hint={mode === "truck" ? (category === "PM" ? "Used to reset the PM interval when this work order is done." : "Prefilled from the truck; adjust to the reading at check-in.") : "Optional for trailers."}>
              <Input name="odometerKm" type="number" inputMode="numeric" min={0} value={odometer} onChange={(e) => { setOdometer(e.target.value); setOdometerTouched(true); }} className="num" />
            </Field>
          </div>
        </Card>

        <Card title="Costs">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Labour"><Input name="laborCost" type="number" inputMode="decimal" min={0} step="0.01" value={labor} onChange={(e) => setLabor(e.target.value)} className="num" placeholder="0" /></Field>
            <Field label="Parts"><Input name="partsCost" type="number" inputMode="decimal" min={0} step="0.01" value={parts} onChange={(e) => setParts(e.target.value)} className="num" placeholder="0" /></Field>
            <Field label="Total" hint={manualTotal ? `Edited by hand · labour + parts = ${money2(sum)}. Clear the field to sum again.` : "Summed from labour + parts. Type to override."}>
              <Input name="cost" type="number" inputMode="decimal" min={0} step="0.01" value={shownTotal}
                onChange={(e) => { const v = e.target.value; if (v === "") { setManualTotal(false); setTotal(""); } else { setManualTotal(true); setTotal(v); } }}
                className="num font-semibold" placeholder="0" />
            </Field>
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <SubmitButton className="flex-1">{submitLabel}</SubmitButton>
          <Link href={cancelHref} className={buttonClass("secondary")}>Cancel</Link>
        </div>
      </div>
    </ActionForm>
  );
}
