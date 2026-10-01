import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/constants";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { ago } from "@/lib/format";
import { createUser } from "@/app/actions/people";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";

export const metadata = { title: "Users & roles" };

const PERM_LABELS: Partial<Record<Permission, string>> = {
  "dashboard.view": "Dashboard", "loads.view": "View loads", "loads.edit": "Create / dispatch loads", "tracking.view": "Live tracking",
  "fleet.view": "View fleet", "fleet.edit": "Manage fleet & maintenance", "drivers.view": "View drivers", "drivers.edit": "Manage drivers",
  "customers.view": "View customers", "customers.edit": "Manage customers", "finance.view": "View finance", "finance.edit": "Invoice & payments",
  "reports.view": "Reports", "users.manage": "Manage users", "audit.view": "Audit log", "driver.portal": "Driver app",
};

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireUser("users.manage");
  const role = (await searchParams).role;
  const users = await db.user.findMany({
    where: typeof role === "string" && role ? { role } : {},
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const roleOptions = ROLES.filter((r) => r !== "OWNER" || me.role === "OWNER").map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <>
      <PageHeader title="Users & roles" subtitle="Who can sign in, and what each role is allowed to do." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${!role ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>All</Link>
            {ROLES.map((r) => (
              <Link key={r} href={`/admin/users?role=${r}`} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${role === r ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>{ROLE_LABELS[r]}</Link>
            ))}
          </div>
          <Card bodyClassName="p-0">
            <Table head={["Name", "Email", "Role", "Status", "Last sign-in", ""]}>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}{u.id === me.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}</td>
                  <td className="text-slate-600">{u.email}</td>
                  <td><Badge value={u.role === "OWNER" ? "URGENT" : u.role === "ADMIN" ? "HIGH" : "NORMAL"} label={ROLE_LABELS[u.role as Role]} /></td>
                  <td><Badge value={u.active ? "ACTIVE" : "VOID"} label={u.active ? "Active" : "Disabled"} /></td>
                  <td className="text-xs text-slate-500">{ago(u.lastLoginAt)}</td>
                  <td>{(u.role !== "OWNER" || me.role === "OWNER") && <Link href={`/admin/users/${u.id}`} className="text-sm font-medium text-blue-600 hover:underline">Edit</Link>}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Role permissions matrix" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Permission</th>
                    {ROLES.map((r) => <th key={r} className="px-2 py-2 font-medium text-slate-500">{ROLE_LABELS[r]}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
                    <tr key={p}>
                      <td className="px-4 py-2 text-slate-700">{PERM_LABELS[p] ?? p}</td>
                      {ROLES.map((r) => (
                        <td key={r} className="px-2 py-2 text-center">
                          {(PERMISSIONS[p] as readonly string[]).includes(r) ? <span className="text-emerald-600">●</span> : <span className="text-slate-200">○</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <Card title="Invite a team member" className="h-fit">
          <ActionForm action={createUser} resetOnSuccess className="space-y-3">
            <Field label="Full name *"><Input name="name" required /></Field>
            <Field label="Email *"><Input name="email" type="email" required /></Field>
            <Field label="Phone"><Input name="phone" /></Field>
            <Field label="Role *"><Select name="role" required defaultValue="DISPATCHER" options={roleOptions} /></Field>
            <Field label="Temporary password *" hint="At least 8 characters. Ask them to change it after first sign-in.">
              <Input name="password" type="password" minLength={8} required autoComplete="new-password" />
            </Field>
            <p className="text-xs text-slate-500">To give a driver the mobile app, add them from <Link href="/drivers/new" className="text-blue-600 hover:underline">Drivers</Link> so their profile and login are linked.</p>
            <SubmitButton className="w-full">Create user</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
