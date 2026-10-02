import { requireUser } from "@/lib/auth";
import { WORK_ORDER_CATEGORIES, WORK_ORDER_STATUSES } from "@/lib/constants";
import { saveWorkOrder } from "@/app/actions/fleet";
import { PageHeader } from "@/components/ui";
import { str, workOrderFormOptions } from "../../_lib/data";
import { WorkOrderForm } from "../../_components/work-order-form";

export const metadata = { title: "New work order" };

export default async function NewWorkOrder({ searchParams }: PageProps<"/maintenance/work-orders/new">) {
  await requireUser("fleet.edit");
  const sp = await searchParams;
  const { trucks, trailers, vendors } = await workOrderFormOptions();
  const truckId = str(sp.truck);
  const trailerId = str(sp.trailer);
  const category = str(sp.category);
  const status = str(sp.status);
  const truck = trucks.find((t) => t.id === truckId);
  const trailer = trailers.find((t) => t.id === trailerId);
  const isPm = category === "PM";

  return (
    <>
      <PageHeader
        eyebrow="Fleet · Maintenance · Work orders"
        title={isPm && truck ? `PM service for ${truck.unitNumber}` : "New work order"}
        subtitle={truck ? `${truck.unitNumber} · ${truck.detail}` : trailer ? `${trailer.unitNumber} · ${trailer.detail}` : "Pick the unit, describe the work and set a date. Costs can be filled in later."}
      />
      <WorkOrderForm
        action={saveWorkOrder.bind(null, null)}
        trucks={trucks}
        trailers={trailers}
        vendors={vendors}
        submitLabel="Create work order"
        cancelHref={truck && isPm ? "/maintenance?tab=pm" : "/maintenance/work-orders"}
        initial={{
          truckId: truck?.id ?? null,
          trailerId: !truck && trailer ? trailer.id : null,
          category: category && (WORK_ORDER_CATEGORIES as readonly string[]).includes(category) ? category : "OTHER",
          status: status && (WORK_ORDER_STATUSES as readonly string[]).includes(status) ? status : "OPEN",
          title: isPm ? "PM service" : null,
          odometerKm: truck?.odometerKm ?? null,
        }}
      />
    </>
  );
}
