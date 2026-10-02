"use client";

import { WorkOrderStatusButtons } from "./_components/work-order-status";

/**
 * @deprecated Compatibility shim for pages that still import `MaintenanceActions`
 * (the truck detail page). New code should import `WorkOrderStatusButtons` from
 * `./_components/work-order-status`.
 */
export function MaintenanceActions({ id, status }: { id: string; status: string }) {
  return <WorkOrderStatusButtons id={id} status={status} compact />;
}
