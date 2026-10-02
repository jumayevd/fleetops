import { notFound } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/format";
import { saveWorkOrder } from "@/app/actions/fleet";
import { Badge, PageHeader } from "@/components/ui";
import { workOrderFormOptions } from "../../../_lib/data";
import { workOrderHref } from "../../../_lib/links";
import { WorkOrderForm } from "../../../_components/work-order-form";

export async function generateMetadata({ params }: PageProps<"/maintenance/work-orders/[id]/edit">) {
  if (!(await getCurrentUser())) return {};
  const wo = await db.workOrder.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: wo ? `Edit work order #${wo.number}` : "Not found" };
}

export default async function EditWorkOrder({ params }: PageProps<"/maintenance/work-orders/[id]/edit">) {
  await requireUser("fleet.edit");
  const { id } = await params;
  const [wo, options] = await Promise.all([
    db.workOrder.findUnique({ where: { id }, include: { truck: { select: { unitNumber: true } }, trailer: { select: { unitNumber: true } } } }),
    workOrderFormOptions(),
  ]);
  if (!wo) notFound();
  const unit = wo.truck?.unitNumber ?? wo.trailer?.unitNumber;

  return (
    <>
      <PageHeader
        eyebrow={<>Work order <span className="num">#{wo.number}</span></>}
        title={`Edit · ${wo.title}`}
        subtitle={<span className="inline-flex items-center gap-2"><Badge value={wo.status} dot />{unit && <span className="num">{unit}</span>}<span>Changing the status here applies the same shop and PM side effects as the buttons.</span></span>}
      />
      <WorkOrderForm
        action={saveWorkOrder.bind(null, id)}
        trucks={options.trucks}
        trailers={options.trailers}
        vendors={options.vendors}
        submitLabel="Save changes"
        cancelHref={workOrderHref(id)}
        initial={{
          truckId: wo.truckId, trailerId: wo.trailerId,
          title: wo.title, description: wo.description, category: wo.category, priority: wo.priority, status: wo.status, vendor: wo.vendor,
          scheduledAt: toDateInput(wo.scheduledAt), inAt: toDateInput(wo.inAt), outAt: toDateInput(wo.outAt),
          odometerKm: wo.odometerKm, laborCost: wo.laborCost, partsCost: wo.partsCost, cost: wo.cost, notes: wo.notes,
        }}
      />
    </>
  );
}
