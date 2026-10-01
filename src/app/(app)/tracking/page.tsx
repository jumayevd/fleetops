import { requireUser } from "@/lib/auth";
import { fleetSnapshot } from "@/lib/telemetry";
import { PageHeader } from "@/components/ui";
import { TrackingBoard } from "@/components/live-fleet";

export const metadata = { title: "Live tracking" };

export default async function TrackingPage() {
  await requireUser("tracking.view");
  const fleet = await fleetSnapshot();
  return (
    <>
      <PageHeader title="Live tracking" subtitle="Control tower — every truck, route and ETA. Refreshes every 10 seconds." />
      <TrackingBoard initial={fleet} />
    </>
  );
}
