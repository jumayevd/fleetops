import type { Truck } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Select } from "@/components/ui";
import { TRUCK_STATUSES } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import type { ActionState } from "@/lib/action";

export function TruckForm({ action, truck, drivers }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  truck?: Truck | null;
  drivers: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={action}>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Unit number *"><Input name="unitNumber" required defaultValue={truck?.unitNumber} placeholder="T-120" /></Field>
          <Field label="Plate *"><Input name="plate" required defaultValue={truck?.plate} /></Field>
          <Field label="VIN"><Input name="vin" defaultValue={truck?.vin ?? ""} /></Field>
          <Field label="Make *"><Input name="make" required defaultValue={truck?.make} placeholder="Volvo" /></Field>
          <Field label="Model *"><Input name="model" required defaultValue={truck?.model} placeholder="FH 500" /></Field>
          <Field label="Year"><Input name="year" type="number" defaultValue={truck?.year ?? new Date().getFullYear()} /></Field>
          <Field label="Status"><Select name="status" defaultValue={truck?.status ?? "ACTIVE"} options={TRUCK_STATUSES} /></Field>
          <Field label="Assigned driver"><Select name="driverId" defaultValue={truck?.driverId ?? ""} placeholder="— None —" options={drivers.map((d) => ({ value: d.id, label: d.name }))} /></Field>
          <Field label="Fuel tank (L)"><Input name="fuelCapacityL" type="number" defaultValue={truck?.fuelCapacityL ?? 600} /></Field>
          <Field label="Odometer (km)"><Input name="odometerKm" type="number" defaultValue={truck?.odometerKm ?? 0} /></Field>
          <Field label="Next service at (km)"><Input name="nextServiceKm" type="number" defaultValue={truck?.nextServiceKm ?? ""} /></Field>
          <Field label="Fuel type"><Select name="fuelType" defaultValue={truck?.fuelType ?? "DIESEL"} options={["DIESEL", "LNG", "CNG", "ELECTRIC"]} /></Field>
          <Field label="Insurance expiry"><Input name="insuranceExpiry" type="date" defaultValue={toDateInput(truck?.insuranceExpiry)} /></Field>
          <Field label="Inspection expiry"><Input name="inspectionExpiry" type="date" defaultValue={toDateInput(truck?.inspectionExpiry)} /></Field>
        </div>
        <div className="mt-6"><SubmitButton>{truck ? "Save changes" : "Add truck"}</SubmitButton></div>
      </Card>
    </ActionForm>
  );
}
