import { requireUser } from "@/lib/auth";
import { saveDriver } from "@/app/actions/people";
import { PageHeader } from "@/components/ui";
import { DriverForm } from "../driver-form";

export const metadata = { title: "Add driver" };

export default async function NewDriver() {
  await requireUser("drivers.edit");
  return (
    <>
      <PageHeader title="Add driver" />
      <DriverForm action={saveDriver.bind(null, null)} />
    </>
  );
}
