export const ROLES = ["OWNER", "ADMIN", "DISPATCHER", "FLEET_MANAGER", "ACCOUNTANT", "DRIVER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  DISPATCHER: "Dispatcher",
  FLEET_MANAGER: "Fleet Manager",
  ACCOUNTANT: "Accountant",
  DRIVER: "Driver",
};

export const LOAD_STATUSES = ["PLANNED", "ASSIGNED", "IN_TRANSIT", "DELIVERED", "INVOICED", "CANCELLED"] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  INVOICED: "Invoiced",
  CANCELLED: "Cancelled",
};

// Allowed next statuses from each status (the dispatch workflow).
export const LOAD_TRANSITIONS: Record<LoadStatus, LoadStatus[]> = {
  PLANNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_TRANSIT", "PLANNED", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: ["INVOICED"],
  INVOICED: [],
  CANCELLED: ["PLANNED"],
};

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const EQUIPMENT = ["DRY_VAN", "REEFER", "FLATBED", "TANKER", "CONTAINER"] as const;
export const EQUIPMENT_LABELS: Record<string, string> = {
  DRY_VAN: "Dry van",
  REEFER: "Reefer",
  FLATBED: "Flatbed",
  TANKER: "Tanker",
  CONTAINER: "Container",
};

export const TRUCK_STATUSES = ["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
export const DRIVER_STATUSES = ["AVAILABLE", "ON_DUTY", "DRIVING", "OFF_DUTY", "ON_LEAVE"] as const;
export const MAINTENANCE_TYPES = ["PREVENTIVE", "REPAIR", "INSPECTION", "TIRES", "OIL_CHANGE"] as const;
export const MAINTENANCE_STATUSES = ["SCHEDULED", "IN_PROGRESS", "DONE"] as const;
export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "VOID"] as const;

export function humanize(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Known depots / cities used for quick route entry and demo data.
export const CITIES: { name: string; country: string; lat: number; lng: number }[] = [
  { name: "Tashkent", country: "UZ", lat: 41.2995, lng: 69.2401 },
  { name: "Samarkand", country: "UZ", lat: 39.6542, lng: 66.9597 },
  { name: "Bukhara", country: "UZ", lat: 39.7747, lng: 64.4286 },
  { name: "Navoi", country: "UZ", lat: 40.0844, lng: 65.3792 },
  { name: "Karshi", country: "UZ", lat: 38.8606, lng: 65.7891 },
  { name: "Termez", country: "UZ", lat: 37.2242, lng: 67.2783 },
  { name: "Jizzakh", country: "UZ", lat: 40.1158, lng: 67.8422 },
  { name: "Andijan", country: "UZ", lat: 40.7821, lng: 72.3442 },
  { name: "Namangan", country: "UZ", lat: 40.9983, lng: 71.6726 },
  { name: "Fergana", country: "UZ", lat: 40.3894, lng: 71.7864 },
  { name: "Kokand", country: "UZ", lat: 40.5286, lng: 70.9425 },
  { name: "Urgench", country: "UZ", lat: 41.55, lng: 60.6333 },
  { name: "Nukus", country: "UZ", lat: 42.4611, lng: 59.6003 },
  { name: "Almaty", country: "KZ", lat: 43.2389, lng: 76.8897 },
  { name: "Shymkent", country: "KZ", lat: 42.3417, lng: 69.5901 },
  { name: "Bishkek", country: "KG", lat: 42.8746, lng: 74.5698 },
  { name: "Osh", country: "KG", lat: 40.5283, lng: 72.7985 },
  { name: "Dushanbe", country: "TJ", lat: 38.5598, lng: 68.787 },
  { name: "Khujand", country: "TJ", lat: 40.2826, lng: 69.6222 },
  { name: "Ashgabat", country: "TM", lat: 37.9601, lng: 58.3261 },
];
