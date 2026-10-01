import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveLoad } from "@/app/actions/loads";
import { PageHeader } from "@/components/ui";
import { LoadForm } from "../../load-form";
import { assignmentOptions } from "../../options";

export const metadata = { title: "Edit load" };

export default async function EditLoadPage({ params }: PageProps<"/loads/[id]/edit">) {
  await requireUser("loads.edit");
  const { id } = await params;
  const load = await db.load.findUnique({ where: { id } });
  if (!load) notFound();
  const opts = await assignmentOptions(id);
  return (
    <>
      <PageHeader title={`Edit ${load.reference}`} />
      <LoadForm action={saveLoad.bind(null, id)} {...opts} defaults={load} submitLabel="Save changes" />
    </>
  );
}
