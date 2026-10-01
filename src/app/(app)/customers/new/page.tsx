import { requireUser } from "@/lib/auth";
import { saveCustomer } from "@/app/actions/people";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "Add customer" };

export default async function NewCustomer() {
  await requireUser("customers.edit");
  return (
    <>
      <PageHeader title="Add customer" />
      <CustomerForm action={saveCustomer.bind(null, null)} />
    </>
  );
}
