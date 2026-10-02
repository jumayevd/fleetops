"use client";

import { useRouter } from "next/navigation";
import type { Trailer } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { EQUIPMENT, EQUIPMENT_LABELS, TRAILER_STATUSES, TRAILER_STATUS_LABELS } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import type { ActionState } from "@/lib/action";
import { GPS_PROVIDERS } from "../lib";

export function TrailerForm({ action, trailer, trucks, redirectTo, cancelHref }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  trailer?: Trailer | null;
  trucks: { id: string; label: string }[];
  /** Where to go after a successful save (saveTrailer returns a message rather than redirecting). */
  redirectTo: string;
  cancelHref: string;
}) {
  const router = useRouter();
  return (
    <ActionForm action={action} onSuccess={() => { router.push(redirectTo); router.refresh(); }} className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Identity">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Unit number" required><Input name="unitNumber" required defaultValue={trailer?.unitNumber} placeholder="TR-220" className="num" /></Field>
              <Field label="Type" required><Select name="type" required defaultValue={trailer?.type ?? "DRY_VAN"} options={EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }))} /></Field>
              <Field label="Capacity (kg)"><Input name="capacityKg" type="number" min={0} step={500} defaultValue={trailer?.capacityKg ?? 22000} className="num" /></Field>
              <Field label="Plate"><Input name="plate" defaultValue={trailer?.plate ?? ""} placeholder="01 123 XA" className="num" /></Field>
              <Field label="Year"><Input name="year" type="number" min={1990} max={2100} defaultValue={trailer?.year ?? ""} className="num" /></Field>
            </div>
          </Card>

          <Card title="Status & pairing">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Status" hint={trailer ? "Changing it here resets the status timer." : undefined}>
                <Select name="status" defaultValue={trailer?.status ?? "EMPTY"} options={TRAILER_STATUSES.map((s) => ({ value: s, label: TRAILER_STATUS_LABELS[s] }))} />
              </Field>
              <Field label="Paired truck" hint="The tractor currently pulling this trailer.">
                <Select name="truckId" defaultValue={trailer?.truckId ?? ""} placeholder="Not paired" options={trucks.map((t) => ({ value: t.id, label: t.label }))} />
              </Field>
              <Field label="Location" hint="Yard, customer site or city."><Input name="locationName" defaultValue={trailer?.locationName ?? ""} placeholder="Tashkent yard" /></Field>
              <Field label="GPS provider" hint="Leave empty if the trailer has no tracker.">
                <Input name="gpsProvider" list="gps-providers" defaultValue={trailer?.gpsProvider ?? ""} placeholder="Teltonika" />
                <datalist id="gps-providers">{GPS_PROVIDERS.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Compliance dates">
            <div className="space-y-4">
              <Field label="Insurance expiry"><Input name="insuranceExpiry" type="date" defaultValue={toDateInput(trailer?.insuranceExpiry)} /></Field>
              <Field label="Technical inspection expiry"><Input name="inspectionExpiry" type="date" defaultValue={toDateInput(trailer?.inspectionExpiry)} /></Field>
              <p className="text-[11px] text-fg-subtle">Upload registration, insurance and inspection files on the trailer page.</p>
            </div>
          </Card>
          <Card title="Notes">
            <Textarea name="notes" rows={5} defaultValue={trailer?.notes ?? ""} placeholder="Door seal replaced, reefer unit serial, tyre sizes…" />
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
        <SubmitButton pendingText={trailer ? "Saving…" : "Adding…"}>{trailer ? "Save changes" : "Add trailer"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
