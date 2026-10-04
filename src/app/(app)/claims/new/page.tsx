import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toLocalInput } from "@/lib/format";
import { saveClaim } from "@/app/actions/claims";
import { PageHeader } from "@/components/ui";
import { ClaimForm } from "../claim-form";
import { claimFormOptions } from "../options";
import type { ClaimDefaults } from "../shared";

export const metadata = { title: "New claim" };

export default async function NewClaimPage({ searchParams }: PageProps<"/claims/new">) {
  await requireUser("claims.edit");
  const sp = await searchParams;
  const loadId = typeof sp.load === "string" && sp.load.trim() ? sp.load.trim() : null;
  const load = loadId
    ? await db.load.findUnique({
        where: { id: loadId },
        select: {
          id: true, reference: true, originCity: true, destCity: true, destName: true, deliveredAt: true, deliveryAt: true,
          driverId: true, truckId: true, trailerId: true, customerId: true, brokerId: true,
          customer: { select: { name: true } }, broker: { select: { name: true } },
        },
      })
    : null;
  const options = await claimFormOptions(load ? { loadId: load.id, driverId: load.driverId, truckId: load.truckId, trailerId: load.trailerId, customerId: load.brokerId ?? load.customerId } : {});

  const now = new Date();
  const incidentDefault = load ? (load.deliveredAt ?? (load.deliveryAt <= now ? load.deliveryAt : null)) : null;
  const defaults: ClaimDefaults = load
    ? {
        loadId: load.id, driverId: load.driverId, truckId: load.truckId, trailerId: load.trailerId, customerId: load.brokerId ?? load.customerId,
        location: `${load.destName}, ${load.destCity}`, incidentAt: toLocalInput(incidentDefault ?? now),
      }
    : { incidentAt: toLocalInput(now) };

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/claims" className="hover:text-fg">Claims</Link>}
        title="New claim"
        subtitle={load
          ? <>Filed against <Link href={`/loads/${load.id}`} className="num font-medium text-fg hover:underline">{load.reference}</Link> · {load.originCity} → {load.destCity} · {load.broker?.name ?? load.customer.name}. The driver, unit and customer are prefilled from the load.</>
          : "Record the incident, link the load, driver and unit, and attach the evidence on the claim page once it is filed."}
      />
      <ClaimForm action={saveClaim.bind(null, null)} options={options} defaults={defaults} prefilledFrom={load?.reference ?? null} />
    </>
  );
}
