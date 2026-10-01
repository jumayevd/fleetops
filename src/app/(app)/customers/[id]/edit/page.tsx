import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveCustomer } from "@/app/actions/people";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../../customer-form";

export const metadata = { title: "Edit customer" };

export default async function EditCustomer({ params }: PageProps<"/customers/[id]/edit">) {
  await requireUser("customers.edit");
  const { id } = await params;
  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) notFound();
  return (
    <>
      <PageHeader title={`Edit ${customer.name}`} />
      <CustomerForm action={saveCustomer.bind(null, id)} customer={customer} />
    </>
  );
}
