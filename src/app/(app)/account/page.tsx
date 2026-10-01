import { requireUser } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { changePassword } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, DL, Field, Input, PageHeader } from "@/components/ui";
import { TelegramCard } from "./telegram-card";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card title="Profile"><DL items={[["Name", user.name], ["Email", user.email], ["Role", ROLE_LABELS[user.role as Role]]]} /></Card>
          <TelegramCard userId={user.id} />
        </div>
        <Card title="Change password">
          <ActionForm action={changePassword} resetOnSuccess className="space-y-3">
            <Field label="Current password"><Input name="current" type="password" required autoComplete="current-password" /></Field>
            <Field label="New password"><Input name="next" type="password" minLength={8} required autoComplete="new-password" /></Field>
            <Field label="Confirm new password"><Input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></Field>
            <SubmitButton>Update password</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
