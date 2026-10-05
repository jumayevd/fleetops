import Link from "next/link";
import { BadgeCheck, CalendarClock, FileWarning, FileX2, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DOC_KIND_LABELS } from "@/lib/documents";
import { ago, date } from "@/lib/format";
import { saveCompanyProfile } from "@/app/actions/company";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DocumentsPanel } from "@/components/documents/panel";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Stat, Textarea, type Tone } from "@/components/ui";
import { getCompanyCompliance, getCompanyProfileRecord } from "./profile";
import { REQUIRED_COMPANY_DOCS, companyDisplayName, complianceCounts, type DocCompliance, type DocComplianceStatus } from "./shared";
import { TeamsPanel, type TeamRow } from "./teams-panel";

export const metadata = { title: "Company profile" };

const STATUS_TONE: Record<DocComplianceStatus, Tone> = { valid: "ok", expiring: "warn", expired: "danger", missing: "danger" };
const STATUS_LABEL: Record<DocComplianceStatus, string> = { valid: "Valid", expiring: "Expiring", expired: "Expired", missing: "Missing" };
const kindLabel = (k: string) => DOC_KIND_LABELS[k] ?? k;

function statusText(r: DocCompliance) {
  if (r.status === "missing") return "Not uploaded";
  if (r.days === null) return "No expiry date";
  if (r.days < 0) return `Expired ${-r.days}d ago · ${date(r.doc?.expiresAt)}`;
  return `${r.days}d left · until ${date(r.doc?.expiresAt)}`;
}

export default async function CompanyPage() {
  const user = await requireUser("company.manage");
  const editable = can(user.role, "company.manage");

  const [{ profile, updatedAt }, compliance, teams, driverCounts, loadCounts] = await Promise.all([
    getCompanyProfileRecord(),
    getCompanyCompliance(),
    db.team.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { users: { where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
    db.driver.groupBy({ by: ["teamId"], where: { status: { not: "INACTIVE" }, teamId: { not: null } }, _count: true }),
    db.load.groupBy({ by: ["teamId"], where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] }, teamId: { not: null } }, _count: true }),
  ]);
  const driversFor = new Map(driverCounts.map((r) => [r.teamId, r._count]));
  const loadsFor = new Map(loadCounts.map((r) => [r.teamId, r._count]));
  const teamRows: TeamRow[] = teams.map((t) => ({
    id: t.id, name: t.name, color: t.color, sortOrder: t.sortOrder, dispatchers: t.users,
    driverCount: driversFor.get(t.id) ?? 0, activeLoads: loadsFor.get(t.id) ?? 0,
  }));

  const counts = complianceCounts(compliance);
  const names = (s: DocComplianceStatus) => compliance.filter((r) => r.status === s).map((r) => kindLabel(r.kind)).join(", ");
  const insurance = compliance.find((r) => r.kind === "COMPANY_INSURANCE");
  const problems = counts.expired + counts.missing;

  const subtitle = [
    profile.legalName && profile.brand ? profile.legalName : null,
    profile.taxId ? `INN ${profile.taxId}` : null,
    profile.licenseNumber ? `Licence ${profile.licenseNumber}` : null,
    updatedAt ? `Saved ${ago(updatedAt)}` : "Not saved yet",
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title={companyDisplayName(profile)}
        subtitle={subtitle}
        actions={
          <>
            <LinkButton href="/admin/users" variant="secondary"><Users />Users &amp; roles</LinkButton>
            <LinkButton href="/admin/audit?entity=company" variant="ghost">Change history</LinkButton>
          </>
        }
      />

      {/* Compliance summary: the three documents the company must keep valid */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Valid documents" value={`${counts.valid}/${REQUIRED_COMPANY_DOCS.length}`} tone={counts.valid === REQUIRED_COMPANY_DOCS.length ? "ok" : "neutral"} icon={<BadgeCheck />}
          hint={counts.valid ? names("valid") : "none of the required documents is valid"} />
        <Stat label="Expiring within 30 days" value={counts.expiring} tone={counts.expiring ? "warn" : "neutral"} icon={<CalendarClock />}
          hint={counts.expiring ? names("expiring") : "nothing is due for renewal"} />
        <Stat label="Expired" value={counts.expired} tone={counts.expired ? "danger" : "neutral"} icon={<FileWarning />}
          hint={counts.expired ? names("expired") : "nothing has lapsed"} />
        <Stat label="Missing" value={counts.missing} tone={counts.missing ? "danger" : "neutral"} icon={<FileX2 />}
          hint={counts.missing ? names("missing") : "everything required is on file"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Profile form */}
        <div className="xl:col-span-2">
          <ActionForm action={saveCompanyProfile} className="space-y-4">
            <fieldset disabled={!editable} className="contents">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Legal entity">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Legal name" required className="sm:col-span-2"><Input name="legalName" required defaultValue={profile.legalName} placeholder="«Fleet Logistics» LLC" /></Field>
                    <Field label="Brand / trading name" hint="Heads printed invoices. Leave empty to use the legal name."><Input name="brand" defaultValue={profile.brand} placeholder="FleetOps" /></Field>
                    <Field label="Director"><Input name="director" defaultValue={profile.director} placeholder="Full name" /></Field>
                    <Field label="INN (tax ID)"><Input name="taxId" defaultValue={profile.taxId} placeholder="123456789" className="num" inputMode="numeric" /></Field>
                    <Field label="Carrier licence number"><Input name="licenseNumber" defaultValue={profile.licenseNumber} placeholder="AA 0000000" className="num" /></Field>
                  </div>
                </Card>

                <Card title="Contacts">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Phone"><Input name="phone" type="tel" defaultValue={profile.phone} placeholder="+998 71 000 00 00" className="num" /></Field>
                    <Field label="Email"><Input name="email" type="email" defaultValue={profile.email} placeholder="office@company.uz" /></Field>
                    <Field label="Legal address" className="sm:col-span-2"><Textarea name="address" rows={2} defaultValue={profile.address} placeholder="Street, city, postcode, country" /></Field>
                  </div>
                </Card>

                <Card title="Bank details">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Bank" className="sm:col-span-2"><Input name="bankName" defaultValue={profile.bank.name} placeholder="Bank name and branch" /></Field>
                    <Field label="Account number" className="sm:col-span-2"><Input name="bankAccount" defaultValue={profile.bank.account} placeholder="2020 8000 0000 0000 0000" className="num" /></Field>
                    <Field label="MFO"><Input name="bankMfo" defaultValue={profile.bank.mfo} placeholder="00000" className="num" inputMode="numeric" /></Field>
                    <Field label="SWIFT / BIC"><Input name="bankSwift" defaultValue={profile.bank.swift} placeholder="XXXXUZ22" className="num" /></Field>
                  </div>
                  <p className="mt-3 text-[11px] text-fg-subtle">Printed on invoices so customers pay to the right account.</p>
                </Card>

                <Card title="Insurance">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Carrier (insurer)" className="sm:col-span-2"><Input name="insuranceCarrier" defaultValue={profile.insurance.carrier} placeholder="Insurance company" /></Field>
                    <Field label="Policy number"><Input name="insurancePolicy" defaultValue={profile.insurance.policy} placeholder="Policy no." className="num" /></Field>
                    <Field label="Agent / contact"><Input name="insuranceAgent" defaultValue={profile.insurance.agent} placeholder="Name, phone" /></Field>
                  </div>
                  {insurance && (
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
                      <Badge value={insurance.status} tone={STATUS_TONE[insurance.status]} label={`Certificate ${STATUS_LABEL[insurance.status].toLowerCase()}`} />
                      <span>{statusText(insurance)}{insurance.status === "missing" && " — upload it under Company documents"}</span>
                    </p>
                  )}
                </Card>
              </div>

              {editable && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
                  <p className="text-[12px] text-fg-muted">
                    {updatedAt ? <>Last saved <span className="num">{ago(updatedAt)}</span>. Changes are recorded in the audit log.</> : "Nothing saved yet. Fill in at least the legal name."}
                  </p>
                  <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
                </div>
              )}
            </fieldset>
          </ActionForm>
        </div>

        {/* Compliance detail + documents */}
        <div className="space-y-4">
          <Card title="Compliance" flush
            actions={problems ? <Badge value="HIGH" tone="danger" label={`${problems} to fix`} /> : counts.expiring ? <Badge value="HIGH" tone="warn" label="Renewal due" /> : <Badge value="ACTIVE" tone="ok" label="All in order" />}>
            <ul className="divide-y divide-line">
              {compliance.map((r) => (
                <li key={r.kind} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-fg">
                      {r.doc ? <a href={`/api/documents/${r.doc.id}`} target="_blank" rel="noreferrer" className="hover:underline">{kindLabel(r.kind)}</a> : kindLabel(r.kind)}
                    </p>
                    <p className="truncate text-[11px] text-fg-subtle">{statusText(r)}</p>
                  </div>
                  <Badge value={r.status} tone={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} dot />
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[11px] text-fg-subtle">
              Expiring means 30 days or fewer left. The newest document of each kind counts; one without an expiry date never lapses.
            </p>
          </Card>

          <DocumentsPanel user={user} target={{ type: "company", id: "company" }} path="/admin/company" title="Company documents"
            withExpiry required={REQUIRED_COMPANY_DOCS}
            description="Licence, insurance and tax certificate are required. Set the expiry date on upload so renewals show up here and on the overview." />
        </div>
      </div>

      <div className="mt-4">
        <TeamsPanel teams={teamRows} editable={can(user.role, "users.manage")} />
      </div>

      <p className="mt-3 text-[11px] text-fg-subtle">
        Looking for the Telegram bot or the audit trail? See <Link href="/admin/telegram" className="text-fg-muted hover:text-fg hover:underline">Telegram alerts</Link> and the <Link href="/admin/audit" className="text-fg-muted hover:text-fg hover:underline">audit log</Link>.
      </p>
    </>
  );
}
