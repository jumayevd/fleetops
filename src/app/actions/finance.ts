"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyInvoicePaid } from "@/lib/notify";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { INVOICE_STATUSES } from "@/lib/constants";
import { createInvoiceForLoad } from "@/lib/workflow";

export async function setInvoiceStatus(invoiceId: string, status: string) {
  const me = await requireUser("finance.edit");
  if (!INVOICE_STATUSES.includes(status as never)) throw new Error("Invalid status");
  const inv = await db.invoice.update({
    where: { id: invoiceId },
    data: { status, paidAt: status === "PAID" ? new Date() : null, issuedAt: status === "SENT" ? new Date() : undefined },
  });
  await audit(me.id, "status", "invoice", invoiceId, `${inv.number} → ${status}`);
  if (status === "PAID") after(() => notifyInvoicePaid(invoiceId));
  revalidatePath("/finance");
  revalidatePath(`/finance/invoices/${invoiceId}`);
}

export async function invoiceLoad(loadId: string) {
  const me = await requireUser("finance.edit");
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId } });
  if (load.status !== "DELIVERED") throw new Error("Only delivered loads can be invoiced");
  const inv = await createInvoiceForLoad(loadId, me.id);
  await db.load.update({ where: { id: loadId }, data: { status: "INVOICED" } });
  await db.loadEvent.create({ data: { loadId, type: "STATUS", message: `Invoice ${inv.number} generated`, userId: me.id } });
  revalidatePath("/finance");
  redirect(`/finance/invoices/${inv.id}`);
}
