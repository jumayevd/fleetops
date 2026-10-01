import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fleetSnapshot } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "tracking.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ trucks: await fleetSnapshot(), at: new Date().toISOString() });
}
