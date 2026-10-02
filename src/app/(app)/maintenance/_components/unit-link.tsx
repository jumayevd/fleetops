import Link from "next/link";
import { Container, Truck as TruckIcon } from "lucide-react";
import { cn } from "@/components/ui";
import { trailerHref, truckHref } from "../_lib/links";

type Ref = { id: string; unitNumber: string } | null | undefined;

/** Unit number as a link to the truck / trailer, with a quiet type glyph. */
export function UnitLink({ truck, trailer, secondary, className }: { truck?: Ref; trailer?: Ref; secondary?: string | null; className?: string }) {
  const unit = truck ?? trailer;
  if (!unit) return <span className="text-fg-faint">—</span>;
  const Icon = truck ? TruckIcon : Container;
  return (
    <div className={cn("min-w-0", className)}>
      <Link href={truck ? truckHref(unit.id) : trailerHref(unit.id)} className="inline-flex items-center gap-1.5 font-medium text-fg hover:underline">
        <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <span className="num">{unit.unitNumber}</span>
      </Link>
      {secondary && <div className="truncate pl-5 text-[11px] text-fg-subtle">{secondary}</div>}
    </div>
  );
}

/** Priority as quiet text for the common levels, a badge only when it needs attention. */
export const PRIORITY_QUIET = new Set(["LOW", "MEDIUM", "NORMAL"]);
