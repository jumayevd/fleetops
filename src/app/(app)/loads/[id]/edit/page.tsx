import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveLoad } from "@/app/actions/loads";
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/constants";
import { Badge, PageHeader } from "@/components/ui";
import { LoadForm } from "../../load-form";
import { assignmentOptions } from "../../options";
import type { StopDefault } from "../../stops-editor";

export const metadata = { title: "Edit load" };

export default async function EditLoadPage({ params }: PageProps<"/loads/[id]/edit">) {
  await requireUser("loads.edit");
  const { id } = await params;
  const load = await db.load.findUnique({ where: { id }, include: { stops: { orderBy: { seq: "asc" } }, customer: { select: { name: true } } } });
  if (!load) notFound();
  const options = await assignmentOptions(id);
  const status = load.status as LoadStatus;
  const locked = !["PLANNED", "ASSIGNED"].includes(status);
  const stops: StopDefault[] = load.stops.map((st) => ({
    type: st.type, name: st.name, city: st.city, lat: st.lat, lng: st.lng, address: st.address,
    windowStart: st.windowStart?.toISOString() ?? null, windowEnd: st.windowEnd?.toISOString() ?? null, notes: st.notes, status: st.status,
  }));

  return (
    <>
      <PageHeader
        eyebrow={<>Loads / <span className="num">{load.reference}</span></>}
        title={<span className="flex items-center gap-2">Edit <span className="num">{load.reference}</span><Badge value={status} label={LOAD_STATUS_LABELS[status]} dot /></span>}
        subtitle={`${load.customer.name} · ${load.originCity} → ${load.destCity}`}
      />
      <LoadForm action={saveLoad.bind(null, id)} options={options} defaults={load} stops={stops} locked={locked}
        submitLabel="Save changes" cancelHref={`/loads/${id}`} />
    </>
  );
}
