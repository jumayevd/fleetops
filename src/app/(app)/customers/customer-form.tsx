import type { Customer } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function CustomerForm({ action, customer }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; customer?: Customer | null }) {
  return (
    <ActionForm action={action}>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company name *" className="lg:col-span-2"><Input name="name" required defaultValue={customer?.name} /></Field>
          <Field label="Tax ID (INN)"><Input name="taxId" defaultValue={customer?.taxId ?? ""} /></Field>
          <Field label="Contact person"><Input name="contactName" defaultValue={customer?.contactName ?? ""} /></Field>
          <Field label="Email"><Input name="email" type="email" defaultValue={customer?.email ?? ""} /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={customer?.phone ?? ""} /></Field>
          <Field label="Address"><Input name="address" defaultValue={customer?.address ?? ""} /></Field>
          <Field label="City"><Input name="city" defaultValue={customer?.city ?? ""} /></Field>
          <Field label="Country"><Input name="country" defaultValue={customer?.country ?? "Uzbekistan"} /></Field>
          <Field label="Payment terms (days)"><Input name="paymentTerms" type="number" defaultValue={customer?.paymentTerms ?? 30} /></Field>
          <Field label="Credit limit (USD)"><Input name="creditLimit" type="number" defaultValue={customer?.creditLimit ?? 50000} /></Field>
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><Textarea name="notes" defaultValue={customer?.notes ?? ""} /></Field>
        </div>
        <div className="mt-6"><SubmitButton>{customer ? "Save changes" : "Add customer"}</SubmitButton></div>
      </Card>
    </ActionForm>
  );
}
