import { NextResponse, type NextRequest } from "next/server";
import { format, startOfWeek } from "date-fns";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { weeklyProduction } from "@/lib/stats";
import { DRIVER_TYPE_SHORT } from "@/lib/constants";

export const dynamic = "force-dynamic";

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /api/export/weekly?week=YYYY-MM-DD → CSV of the weekly production board (one line per driver, plus team and grand totals). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!can(user.role, "loads.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const raw = req.nextUrl.searchParams.get("week");
  const parsed = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : new Date();
  const data = await weeklyProduction(startOfWeek(parsed, { weekStartsOn: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => format(new Date(data.start.getTime() + i * 86_400_000), "EEE dd MMM"));

  const lines: string[] = [];
  lines.push(["Team", "Driver", "Type", "Truck", "Hold", ...days.flatMap((d) => [`${d} $`, `${d} km`, `${d} loads`]), "Total $", "Total km", "Avg $/km", "Goal $", "Plan delta $", "Days worked", "Efficiency %"].map(csvCell).join(","));
  for (const g of data.groups) {
    for (const r of g.rows) {
      lines.push([
        g.team.name, r.driver.name, DRIVER_TYPE_SHORT[r.driver.type] ?? r.driver.type, r.driver.truck ?? "", r.driver.hold ? "yes" : "",
        ...r.days.flatMap((c) => [Math.round(c.amount), Math.round(c.km), c.loads.map((l) => l.reference).join(" ")]),
        Math.round(r.total), Math.round(r.km), r.rpk.toFixed(2), r.goal, Math.round(r.planDelta), r.daysWorked, r.efficiency,
      ].map(csvCell).join(","));
    }
    lines.push([g.team.name, "Team total", "", "", "", ...Array(21).fill(""), Math.round(g.total), Math.round(g.km), g.km ? (g.total / g.km).toFixed(2) : "0.00", "", "", "", g.efficiency].map(csvCell).join(","));
  }
  lines.push(["All teams", "Grand total", "", "", "", ...Array(21).fill(""), Math.round(data.grand.total), Math.round(data.grand.km), data.grand.rpk.toFixed(2), "", "", "", ""].map(csvCell).join(","));

  const name = `weekly-production-${format(data.start, "yyyy-MM-dd")}.csv`;
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
