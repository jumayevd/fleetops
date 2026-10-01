import "server-only";
import type { Document } from "@prisma/client";
import { db } from "./db";
import { can } from "./permissions";
import type { CurrentUser } from "./auth";

export const DOC_KINDS = {
  load: ["BOL", "POD", "CMR", "CUSTOMS", "INVOICE", "PHOTO", "OTHER"],
  truck: ["REGISTRATION", "INSURANCE", "INSPECTION", "PHOTO", "OTHER"],
  driver: ["LICENSE", "MEDICAL", "CONTRACT", "OTHER"],
  customer: ["CONTRACT", "OTHER"],
} as const;

export type DocOwner = keyof typeof DOC_KINDS;
export type DocTarget = { type: DocOwner; id: string };

// Kinds a driver may upload for their own load (proof of delivery, photos, paperwork).
const DRIVER_LOAD_KINDS = ["POD", "PHOTO", "BOL", "CMR", "OTHER"];

export function targetOf(doc: Pick<Document, "loadId" | "truckId" | "driverId" | "customerId">): DocTarget | null {
  if (doc.loadId) return { type: "load", id: doc.loadId };
  if (doc.truckId) return { type: "truck", id: doc.truckId };
  if (doc.driverId) return { type: "driver", id: doc.driverId };
  if (doc.customerId) return { type: "customer", id: doc.customerId };
  return null;
}

async function isDriversLoad(user: CurrentUser, loadId: string) {
  if (!user.driver) return false;
  const load = await db.load.findUnique({ where: { id: loadId }, select: { driverId: true } });
  return load?.driverId === user.driver.id;
}

export async function canViewDocs(user: CurrentUser, t: DocTarget) {
  switch (t.type) {
    case "load": return can(user.role, "loads.view") || (await isDriversLoad(user, t.id));
    case "truck": return can(user.role, "fleet.view");
    case "driver": return can(user.role, "drivers.view") || user.driver?.id === t.id;
    case "customer": return can(user.role, "customers.view");
  }
}

export async function canUploadDoc(user: CurrentUser, t: DocTarget, kind: string) {
  if (!(DOC_KINDS[t.type] as readonly string[]).includes(kind)) return false;
  switch (t.type) {
    case "load":
      if (can(user.role, "loads.edit")) return true;
      if (kind === "INVOICE" && can(user.role, "finance.edit")) return true;
      return DRIVER_LOAD_KINDS.includes(kind) && (await isDriversLoad(user, t.id));
    case "truck": return can(user.role, "fleet.edit");
    case "driver": return can(user.role, "drivers.edit") || (user.driver?.id === t.id && ["LICENSE", "MEDICAL"].includes(kind));
    case "customer": return can(user.role, "customers.edit");
  }
}

export async function canDeleteDoc(user: CurrentUser, doc: Document) {
  if (doc.uploadedById === user.id) return true;
  if (can(user.role, "users.manage")) return true;
  const t = targetOf(doc);
  if (!t) return false;
  return (t.type === "load" && can(user.role, "loads.edit"))
    || (t.type === "truck" && can(user.role, "fleet.edit"))
    || (t.type === "driver" && can(user.role, "drivers.edit"))
    || (t.type === "customer" && can(user.role, "customers.edit"));
}

export function ownerField(t: DocTarget) {
  return ({ load: "loadId", truck: "truckId", driver: "driverId", customer: "customerId" } as const)[t.type];
}

export async function listDocs(t: DocTarget) {
  return db.document.findMany({
    where: { [ownerField(t)]: t.id },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
}

export const DOC_KIND_LABELS: Record<string, string> = {
  BOL: "Bill of lading", POD: "Proof of delivery", CMR: "CMR waybill", CUSTOMS: "Customs", INVOICE: "Invoice",
  PHOTO: "Photo", LICENSE: "Driving license", MEDICAL: "Medical certificate", INSURANCE: "Insurance",
  REGISTRATION: "Registration", INSPECTION: "Inspection", CONTRACT: "Contract", OTHER: "Other",
};
