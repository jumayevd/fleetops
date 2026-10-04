/** Client-safe helpers shared by the audit page (server) and its filter bar (client). */

export type AuditFilterParams = { entity?: string; user?: string; action?: string; from?: string; to?: string; q?: string };

/** Build the audit URL for a set of filters (page resets whenever a filter changes). */
export function auditHref(params: AuditFilterParams, patch: Partial<AuditFilterParams> & { page?: number } = {}) {
  const p = new URLSearchParams();
  const { page, ...rest } = patch;
  for (const [k, v] of Object.entries({ ...params, ...rest })) if (v) p.set(k, v);
  if (page && page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/admin/audit${s ? `?${s}` : ""}`;
}
