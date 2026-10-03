import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";

/**
 * Permission gate for /dashboard/**. Pages check `dashboard.view` too, but a page's redirect
 * fires inside the loading.tsx Suspense boundary, after the shell has streamed (HTTP 200 plus a
 * client-side redirect). Checking here, in the layout, turns it into a proper 307 before the first
 * flush, which is what the rest of the app and the permission checks expect.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireUser("dashboard.view");
  return children;
}
