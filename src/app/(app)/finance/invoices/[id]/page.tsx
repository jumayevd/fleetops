import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { money2, date, km, kg } from "@/lib/format";
import { Badge } from "@/components/ui";
import { InvoiceActions } from "../../invoice-actions";

export async function generateMetadata({ params }: PageProps<"/finance/invoices/[id]">) {
  if (!(await getCurrentUser())) return {};
  const r = await db.invoice.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: r?.number ?? "Not found" };
}

export default async function InvoicePage({ params }: PageProps<"/finance/invoices/[id]">) {
  const user = await requireUser("finance.view");
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, include: { customer: true, load: true } });
  if (!inv) notFound();
  const tax = inv.amount * inv.taxRate;
  const overdue = inv.status === "SENT" && inv.dueAt < new Date();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-800">← Finance</Link>
        {can(user.role, "finance.edit") && <InvoiceActions id={id} status={inv.status} />}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-10 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold"><Truck className="h-6 w-6 text-blue-600" />FleetOps Logistics</div>
            <p className="mt-2 text-sm text-slate-500">Tashkent, Uzbekistan<br />billing@fleetops.example</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-light tracking-tight text-slate-400">INVOICE</p>
            <p className="mt-1 font-semibold">{inv.number}</p>
            <div className="mt-2"><Badge value={overdue ? "OVERDUE" : inv.status} /></div>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bill to</p>
            <p className="mt-1 font-semibold">{inv.customer.name}</p>
            <p className="text-slate-600">{inv.customer.contactName}<br />{inv.customer.address}<br />{inv.customer.city}, {inv.customer.country}</p>
            {inv.customer.taxId && <p className="text-slate-500">Tax ID: {inv.customer.taxId}</p>}
          </div>
          <div className="text-right">
            <p><span className="text-slate-500">Issued:</span> {date(inv.issuedAt)}</p>
            <p><span className="text-slate-500">Due:</span> <span className={overdue ? "font-semibold text-rose-600" : ""}>{date(inv.dueAt)}</span></p>
            <p><span className="text-slate-500">Terms:</span> Net {inv.customer.paymentTerms}</p>
            {inv.paidAt && <p className="text-emerald-600">Paid {date(inv.paidAt)}</p>}
          </div>
        </div>
        <table className="mt-10 w-full text-sm">
          <thead><tr className="border-b-2 border-slate-900 text-left text-xs uppercase tracking-wide"><th className="py-2">Description</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-4">
                {inv.load ? (
                  <>
                    <p className="font-medium">Freight: {inv.load.originCity} → {inv.load.destCity} <span className="text-slate-500">({inv.load.reference})</span></p>
                    <p className="text-xs text-slate-500">{inv.load.commodity} · {kg(inv.load.weightKg)} · {km(inv.load.distanceKm)} · delivered {date(inv.load.deliveredAt)}{inv.load.podSignedBy && ` · POD ${inv.load.podSignedBy}`}</p>
                  </>
                ) : <p>Transportation services</p>}
              </td>
              <td className="py-4 text-right">{money2(inv.amount)}</td>
            </tr>
          </tbody>
        </table>
        <div className="ml-auto mt-6 w-64 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money2(inv.amount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">VAT {Math.round(inv.taxRate * 100)}%</span><span>{money2(tax)}</span></div>
          <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-semibold"><span>Total</span><span>{money2(inv.amount + tax)}</span></div>
        </div>
        {inv.notes && <p className="mt-8 text-sm text-slate-600">{inv.notes}</p>}
        <p className="mt-12 text-center text-xs text-slate-400">Thank you for your business.</p>
      </div>
    </div>
  );
}
