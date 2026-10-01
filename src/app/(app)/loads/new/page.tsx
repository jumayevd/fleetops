import { requireUser } from "@/lib/auth";
import { saveLoad } from "@/app/actions/loads";
import { PageHeader } from "@/components/ui";
import { LoadForm } from "../load-form";
import { assignmentOptions } from "../options";

export const metadata = { title: "New load" };

export default async function NewLoadPage({ searchParams }: PageProps<"/loads/new">) {
  await requireUser("loads.edit");
  const sp = await searchParams;
  const opts = await assignmentOptions();
  const now = new Date();
  const pickup = new Date(now.getTime() + 24 * 3_600_000);
  pickup.setMinutes(0, 0, 0);
  return (
    <>
      <PageHeader title="New load" subtitle="Book a shipment. You can assign equipment now or later from the dispatch board." />
      <LoadForm
        action={saveLoad.bind(null, null)}
        {...opts}
        defaults={{ pickupAt: pickup, deliveryAt: new Date(pickup.getTime() + 24 * 3_600_000), customerId: typeof sp.customer === "string" ? sp.customer : null }}
      />
    </>
  );
}
