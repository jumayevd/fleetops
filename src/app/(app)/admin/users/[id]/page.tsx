import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { dateTime } from "@/lib/format";
import { updateUser } from "@/app/actions/people";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/admin/users/[id]">) {
  if (!(await getCurrentUser())) return {};
  const r = await db.user.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: r?.name ?? "Not found" };
}

export default async function EditUser({ params }: PageProps<"/admin/users/[id]">) {
  const me = await requireUser("users.manage");
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, include: { audits: { orderBy: { createdAt: "desc" }, take: 15 } } });
  if (!user) notFound();
  if (user.role === "OWNER" && me.role !== "OWNER") redirect("/admin/users");
  const roleOptions = ROLES.filter((r) => r !== "OWNER" || me.role === "OWNER").map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <>
      <PageHeader title={user.name} subtitle={user.email} actions={<Link href="/admin/users" className="text-sm text-slate-500 hover:text-slate-800">← All users</Link>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Account" className="h-fit">
          <ActionForm action={updateUser.bind(null, id)} className="space-y-3">
            <Field label="Name"><Input name="name" defaultValue={user.name} required /></Field>
            <Field label="Role"><Select name="role" defaultValue={user.role} options={roleOptions} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={user.active} className="h-4 w-4" /> Account active (can sign in)</label>
            <Field label="Reset password" hint="Leave empty to keep the current password"><Input name="password" type="password" minLength={8} autoComplete="new-password" /></Field>
            <SubmitButton className="w-full">Save</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Recent activity by this user" className="xl:col-span-2" bodyClassName="p-0">
          <Table head={["When", "Action", "Entity", "Details"]} empty={user.audits.length === 0}>
            {user.audits.map((a) => (
              <tr key={a.id}><td className="whitespace-nowrap text-xs">{dateTime(a.createdAt)}</td><td>{a.action}</td><td>{a.entity}</td><td className="text-slate-600">{a.details}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
