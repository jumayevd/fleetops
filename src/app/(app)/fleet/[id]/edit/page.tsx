import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveTruck } from "@/app/actions/fleet";
import { PageHeader } from "@/components/ui";
import { TruckForm } from "../../truck-form";

export const metadata = { title: "Edit truck" };

export default async function EditTruck({ params }: PageProps<"/fleet/[id]/edit">) {
  await requireUser("fleet.edit");
  const { id } = await params;
  const truck = await db.truck.findUnique({ where: { id } });
  if (!truck) notFound();
  const drivers = await db.driver.findMany({
    where: { OR: [{ truck: null }, { id: truck.driverId ?? "" }] }, orderBy: { name: "asc" }, select: { id: true, name: true },
  });
  return (
    <>
      <PageHeader title={`Edit ${truck.unitNumber}`} />
      <TruckForm action={saveTruck.bind(null, id)} truck={truck} drivers={drivers} />
    </>
  );
}
