"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { CITIES, EQUIPMENT, EQUIPMENT_LABELS, PRIORITIES } from "@/lib/constants";
import { roadKm } from "@/lib/geo";
import { toLocalInput } from "@/lib/format";
import type { ActionState } from "@/lib/action";

type Opt = { id: string; label: string; disabled?: boolean };
type Defaults = Partial<Record<string, string | number | boolean | Date | null>>;

export function LoadForm({ action, customers, trucks, drivers, trailers, defaults = {}, submitLabel = "Create load" }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  customers: Opt[]; trucks: Opt[]; drivers: Opt[]; trailers: Opt[];
  defaults?: Defaults; submitLabel?: string;
}) {
  const [origin, setOrigin] = useState(String(defaults.originCity ?? "Tashkent"));
  const [dest, setDest] = useState(String(defaults.destCity ?? "Samarkand"));
  const [rate, setRate] = useState(defaults.rate != null ? String(defaults.rate) : "");
  const [equipment, setEquipment] = useState(String(defaults.equipment ?? "DRY_VAN"));

  const distance = useMemo(() => {
    const a = CITIES.find((c) => c.name === origin);
    const b = CITIES.find((c) => c.name === dest);
    return a && b ? roadKm(a, b) : null;
  }, [origin, dest]);
  const suggestedRate = distance ? Math.round((distance * 1.6 + 150) / 10) * 10 : null;
  const d = (k: string) => (defaults[k] == null ? undefined : String(defaults[k]));
  const cityOpts = CITIES.map((c) => ({ value: c.name, label: `${c.name} (${c.country})` }));
  const opts = (xs: Opt[]) => xs.map((x) => ({ value: x.id, label: x.label + (x.disabled ? " — busy" : "") }));

  return (
    <ActionForm action={action} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Customer & route">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer *" className="sm:col-span-2">
                <Select name="customerId" required defaultValue={d("customerId")} placeholder="Select customer…" options={customers.map((c) => ({ value: c.id, label: c.label }))} />
              </Field>
              <Field label="Pickup city *"><Select name="originCity" value={origin} onChange={(e) => setOrigin(e.target.value)} options={cityOpts} /></Field>
              <Field label="Delivery city *"><Select name="destCity" value={dest} onChange={(e) => setDest(e.target.value)} options={cityOpts} /></Field>
              <Field label="Pickup location / address"><Input name="originName" defaultValue={d("originName")} placeholder={`${origin} warehouse`} /></Field>
              <Field label="Delivery location / address"><Input name="destName" defaultValue={d("destName")} placeholder={`${dest} customer site`} /></Field>
              <Field label="Pickup time *"><Input type="datetime-local" name="pickupAt" required defaultValue={defaults.pickupAt ? toLocalInput(defaults.pickupAt as Date) : undefined} /></Field>
              <Field label="Delivery deadline *"><Input type="datetime-local" name="deliveryAt" required defaultValue={defaults.deliveryAt ? toLocalInput(defaults.deliveryAt as Date) : undefined} /></Field>
              <Field label="Distance (km)" hint={distance ? `Estimated road distance: ${distance} km` : undefined}>
                <Input type="number" name="distanceKm" step="1" min="1" defaultValue={d("distanceKm")} placeholder={distance ? String(distance) : ""} key={`${origin}-${dest}`} />
              </Field>
              <Field label="Priority"><Select name="priority" defaultValue={d("priority") ?? "NORMAL"} options={PRIORITIES} /></Field>
            </div>
          </Card>

          <Card title="Cargo">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Commodity *" className="sm:col-span-2"><Input name="commodity" required defaultValue={d("commodity")} placeholder="e.g. Cotton yarn" /></Field>
              <Field label="Equipment"><Select name="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} options={EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }))} /></Field>
              <Field label="Weight (kg)"><Input type="number" name="weightKg" min="0" defaultValue={d("weightKg")} /></Field>
              <Field label="Pallets"><Input type="number" name="pallets" min="0" defaultValue={d("pallets")} /></Field>
              {equipment === "REEFER"
                ? <Field label="Temperature (°C)"><Input type="number" name="temperatureC" step="0.5" defaultValue={d("temperatureC")} /></Field>
                : <div />}
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
                <input type="checkbox" name="hazmat" defaultChecked={Boolean(defaults.hazmat)} className="h-4 w-4 rounded border-slate-300" />
                Hazardous materials (ADR)
              </label>
              <Field label="Notes / instructions" className="sm:col-span-3"><Textarea name="notes" defaultValue={d("notes")} placeholder="Dock number, contact on site, customs docs…" /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Pricing">
            <div className="space-y-4">
              <Field label="Customer rate (USD) *" hint={suggestedRate ? `Market guide ≈ $${suggestedRate.toLocaleString()} for this lane` : undefined}>
                <Input type="number" name="rate" required min="0" step="10" value={rate} onChange={(e) => setRate(e.target.value)} />
              </Field>
              {suggestedRate && !rate && (
                <button type="button" onClick={() => setRate(String(suggestedRate))} className="text-xs font-medium text-blue-600 hover:underline">Use suggested rate</button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Driver pay" hint="auto from driver rate"><Input type="number" name="driverPay" min="0" defaultValue={d("driverPay")} /></Field>
                <Field label="Fuel est." hint="auto from distance"><Input type="number" name="fuelCost" min="0" defaultValue={d("fuelCost")} /></Field>
                <Field label="Other costs" hint="tolls, permits"><Input type="number" name="otherCost" min="0" defaultValue={d("otherCost")} /></Field>
              </div>
            </div>
          </Card>
          <Card title="Assignment (optional)">
            <div className="space-y-4">
              <Field label="Truck"><Select name="truckId" defaultValue={d("truckId")} placeholder="— Assign later —" options={opts(trucks)} /></Field>
              <Field label="Driver"><Select name="driverId" defaultValue={d("driverId")} placeholder="— Assign later —" options={opts(drivers)} /></Field>
              <Field label="Trailer"><Select name="trailerId" defaultValue={d("trailerId")} placeholder="— None —" options={opts(trailers)} /></Field>
              <p className="text-xs text-slate-500">Assigning truck + driver moves the load to <b>Assigned</b>. Busy units are rejected.</p>
            </div>
          </Card>
          <SubmitButton className="w-full">{submitLabel}</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
