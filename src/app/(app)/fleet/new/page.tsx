import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveTruck } from "@/app/actions/fleet";
import { PageHeader } from "@/components/ui";
import { TruckForm } from "../truck-form";

export const metadata = { title: "Add truck" };

export default async function NewTruck() {
  await requireUser("fleet.edit");
  const drivers = await db.driver.findMany({ where: { truck: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Add truck" />
      <TruckForm action={saveTruck.bind(null, null)} drivers={drivers} />
    </>
  );
}
