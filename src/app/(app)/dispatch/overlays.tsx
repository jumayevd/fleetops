"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn, IconButton } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Menu — floating, portalled so table overflow never clips it         */
/* ------------------------------------------------------------------ */

export function Menu({ anchor, onClose, children, width = 224, className }: {
  anchor: HTMLElement | null; onClose: () => void; children: ReactNode; width?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 320;
      const below = r.bottom + 4 + h <= window.innerHeight - 8;
      const top = below ? r.bottom + 4 : Math.max(8, r.top - 4 - h);
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, width]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [anchor, onClose]);

  if (!anchor || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} role="menu" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
      className={cn("fixed z-[90] overflow-hidden rounded-lg border border-line bg-overlay p-1 shadow-float", className)}>
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled, shortcut, trailing }: {
  icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; shortcut?: string; trailing?: ReactNode;
}) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick}
      className={cn("flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] disabled:opacity-40",
        danger ? "text-danger hover:bg-danger-soft" : "text-fg hover:bg-raised", "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 [&_svg]:text-fg-subtle")}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
      {shortcut && <kbd className="num rounded border border-line bg-sunken px-1 text-[10px] text-fg-subtle">{shortcut}</kbd>}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="eyebrow px-2 pb-1 pt-1.5">{children}</p>;
}
export function MenuDivider() {
  return <div className="my-1 border-t border-line" />;
}

/* ------------------------------------------------------------------ */
/* Drawer — right side panel                                           */
/* ------------------------------------------------------------------ */

export function Drawer({ title, eyebrow, onClose, children, footer, width = 420 }: {
  title: ReactNode; eyebrow?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev; };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside style={{ width: `min(${width}px, 100vw)` }} className="absolute inset-y-0 right-0 flex flex-col border-l border-line bg-overlay shadow-float">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
            <h2 className="truncate text-[15px] font-semibold text-fg">{title}</h2>
          </div>
          <IconButton label="Close" onClick={onClose}><X /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="border-t border-line px-4 py-3">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
