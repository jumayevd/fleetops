/** URL helpers shared by the maintenance pages (server and client safe). */

export const truckHref = (id: string) => `/fleet/${id}`;
/** Trailers have no detail page yet; the list accepts ?unit= to focus a row. */
export const trailerHref = (id: string) => `/fleet/trailers?unit=${id}`;
export const unitComplianceHref = (type: "truck" | "trailer", id: string) =>
  type === "truck" ? `/fleet/${id}?tab=compliance` : `/fleet/trailers?unit=${id}&tab=compliance`;
export const workOrderHref = (id: string) => `/maintenance/work-orders/${id}`;

type Query = Record<string, string | number | null | undefined>;

function withQuery(base: string, q: Query) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export const maintenanceHref = (q: Query) => withQuery("/maintenance", q);
export const workOrdersHref = (q: Query) => withQuery("/maintenance/work-orders", q);
export const newWorkOrderHref = (q: Query = {}) => withQuery("/maintenance/work-orders/new", q);
