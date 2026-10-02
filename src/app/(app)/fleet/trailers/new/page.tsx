import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveTrailer } from "@/app/actions/fleet";
import { PageHeader } from "@/components/ui";
import { TrailerForm } from "../trailer-form";

export const metadata = { title: "Add trailer" };

export default async function NewTrailer() {
  await requireUser("fleet.edit");
  const trucks = await db.truck.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { unitNumber: "asc" }, select: { id: true, unitNumber: true, make: true, model: true } });
  return (
    <>
      <PageHeader eyebrow="Fleet · Trailers" title="Add trailer" subtitle="Type, capacity, pairing and paperwork dates. Documents can be uploaded once it is saved." />
      <TrailerForm action={saveTrailer.bind(null, null)} trucks={trucks.map((t) => ({ id: t.id, label: `${t.unitNumber} · ${t.make} ${t.model}` }))} redirectTo="/fleet/trailers" cancelHref="/fleet/trailers" />
    </>
  );
}
