"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, cn, inputClass } from "@/components/ui";

const WEEK = 7 * 86_400_000;
const shift = (ymd: string, weeks: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + weeks * WEEK).toISOString().slice(0, 10);
const label = (ymd: string) => {
  const s = new Date(`${ymd}T12:00:00`);
  return `${format(s, "d MMM")} – ${format(addDays(s, 6), "d MMM yyyy")}`;
};

/** prev / this week / next + a list of recent weeks. */
export function WeekPicker({ week, thisWeek }: { week: string; thisWeek: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (ymd: string) => start(() => router.push(ymd === thisWeek ? "/dispatch/weekly" : `/dispatch/weekly?week=${ymd}`));
  const options = Array.from({ length: 30 }, (_, i) => shift(thisWeek, 3 - i));
  if (!options.includes(week)) options.push(week);
  options.sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className={cn("flex items-center gap-1", pending && "opacity-70")} aria-label="Week">
      <Button variant="secondary" size="sm" className="w-7 px-0" aria-label="Previous week" onClick={() => go(shift(week, -1))}><ChevronLeft /></Button>
      <Button variant={week === thisWeek ? "secondary" : "primary"} size="sm" disabled={week === thisWeek} onClick={() => go(thisWeek)}>This week</Button>
      <Button variant="secondary" size="sm" className="w-7 px-0" aria-label="Next week" onClick={() => go(shift(week, 1))}><ChevronRight /></Button>
      <label className="ml-1">
        <span className="sr-only">Pick a week</span>
        <select value={week} onChange={(e) => go(e.target.value)} className={cn(inputClass, "h-7 w-[210px] text-[12px]")}>
          {options.map((w) => (
            <option key={w} value={w}>{label(w)}{w === thisWeek ? " · this week" : w === shift(thisWeek, -1) ? " · last week" : ""}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
