import type { Driver } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { DRIVER_STATUSES } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import type { ActionState } from "@/lib/action";

export function DriverForm({ action, driver }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; driver?: Driver | null }) {
  return (
    <ActionForm action={action} className="space-y-6">
      <Card title="Profile">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name *"><Input name="name" required defaultValue={driver?.name} /></Field>
          <Field label="Phone"><Input name="phone" type="tel" defaultValue={driver?.phone ?? ""} /></Field>
          <Field label="Email"><Input name="email" type="email" defaultValue={driver?.email ?? ""} /></Field>
          <Field label="Status"><Select name="status" defaultValue={driver?.status ?? "AVAILABLE"} options={DRIVER_STATUSES} /></Field>
          <Field label="Hire date"><Input name="hireDate" type="date" defaultValue={toDateInput(driver?.hireDate ?? new Date())} /></Field>
          <Field label="Pay per km (USD)"><Input name="payPerKm" type="number" step="0.01" defaultValue={driver?.payPerKm ?? 0.35} /></Field>
        </div>
      </Card>
      <Card title="Compliance">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="License number *"><Input name="licenseNumber" required defaultValue={driver?.licenseNumber} /></Field>
          <Field label="License class"><Input name="licenseClass" defaultValue={driver?.licenseClass ?? "CE"} /></Field>
          <Field label="License expiry *"><Input name="licenseExpiry" type="date" required defaultValue={toDateInput(driver?.licenseExpiry)} /></Field>
          <Field label="Medical cert. expiry"><Input name="medicalExpiry" type="date" defaultValue={toDateInput(driver?.medicalExpiry)} /></Field>
          <Field label="Notes" className="sm:col-span-2 lg:col-span-4"><Textarea name="notes" defaultValue={driver?.notes ?? ""} /></Field>
        </div>
      </Card>
      {!driver && (
        <Card title="Driver app login (optional)">
          <p className="mb-3 text-sm text-slate-500">Set a password to let this driver sign in to the mobile driver portal with the email above.</p>
          <Field label="Initial password" className="max-w-xs"><Input name="password" type="password" minLength={8} autoComplete="new-password" /></Field>
        </Card>
      )}
      <SubmitButton>{driver ? "Save changes" : "Add driver"}</SubmitButton>
    </ActionForm>
  );
}
