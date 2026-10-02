"use client";

import Link from "next/link";
import { useId, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area,
  PieChart, Pie, Cell, Legend, LineChart, Line, Label,
} from "recharts";
import { cn } from "./ui";
import { money, number } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Theme — charts read Graphite tokens at runtime                       */
/* ------------------------------------------------------------------ */

const TOKEN_VARS = {
  accent: "--accent", ok: "--ok", warn: "--warn", danger: "--danger", info: "--info", progress: "--progress",
  fg: "--fg", fgMuted: "--fg-muted", fgSubtle: "--fg-subtle", fgFaint: "--fg-faint",
  line: "--line", lineStrong: "--line-strong", surface: "--surface", overlay: "--overlay", sunken: "--sunken",
  raised: "--raised", canvas: "--canvas", neutralSoft: "--neutral-soft",
} as const;

export type ChartTokens = { [K in keyof typeof TOKEN_VARS]: string };
export type ChartTone = "accent" | "ok" | "warn" | "danger" | "info" | "progress" | "neutral";

export type ChartTheme = ChartTokens & {
  mode: "light" | "dark";
  /** Fixed-order categorical palette (SERIES_TONES resolved to colours). Index 6 is the grey "Other" slot. */
  series: string[];
  /** Spread onto a Recharts <Tooltip>: overlay background, hairline border, fg text. */
  tooltip: { contentStyle: CSSProperties; itemStyle: CSSProperties; labelStyle: CSSProperties };
  /** Tooltip cursor for line / area charts (vertical hairline). */
  cursorLine: { stroke: string; strokeWidth: number };
  /** Tooltip cursor for bar charts (quiet band). */
  cursorFill: { fill: string };
  /** Axis tick style: 11px fg-subtle. */
  tick: { fontSize: number; fill: string };
  /** Grid stroke: the hairline token. */
  grid: string;
};

/**
 * Categorical series order. Chosen by running the Graphite tokens through a CVD validator:
 * every 2-, 3- and 4-series prefix clears the adjacent-pair separation target in both themes,
 * and amber stays out of the first three slots so "accent = signal" still holds on most charts.
 * Slots 5–6 (ok, danger) are red/green neighbours — charts with that many series always carry a
 * legend. Never cycle past the list: the last slot (neutral grey) is for "Other".
 */
export const SERIES_TONES: readonly ChartTone[] = ["info", "warn", "progress", "accent", "ok", "danger", "neutral"];

const toneVarName = (tone: ChartTone) => (tone === "neutral" ? "--fg-subtle" : `--${tone}`);
/** `var(--tone)` string for inline styles outside the hook (server components, Leaflet HTML). */
export const toneVar = (tone: ChartTone) => `var(${toneVarName(tone)})`;

function build(read: (cssVar: string) => string, mode: "light" | "dark"): ChartTheme {
  const keys = Object.keys(TOKEN_VARS) as (keyof typeof TOKEN_VARS)[];
  const t = Object.fromEntries(keys.map((k) => [k, read(TOKEN_VARS[k])])) as ChartTokens;
  const tone = (x: ChartTone) => (x === "neutral" ? t.fgSubtle : t[x]);
  return {
    ...t,
    mode,
    series: SERIES_TONES.map(tone),
    tooltip: {
      contentStyle: {
        background: t.overlay, border: `1px solid ${t.line}`, borderRadius: 6, boxShadow: "var(--shadow-float)",
        color: t.fg, fontSize: 12, lineHeight: "16px", padding: "6px 10px",
      },
      itemStyle: { color: t.fg, padding: "1px 0" },
      labelStyle: { color: t.fgMuted, fontSize: 11, marginBottom: 4 },
    },
    cursorLine: { stroke: t.lineStrong, strokeWidth: 1 },
    cursorFill: { fill: t.neutralSoft },
    tick: { fontSize: 11, fill: t.fgSubtle },
    grid: t.line,
  };
}

// Server / pre-hydration snapshot: plain var() references, so SSR markup is still theme-correct.
const SERVER_THEME = build((v) => `var(${v})`, "light");

const currentMode = (): "light" | "dark" => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function readTheme(): ChartTheme {
  const cs = getComputedStyle(document.documentElement);
  return build((v) => cs.getPropertyValue(v).trim() || `var(${v})`, currentMode());
}

// Tiny external store: one MutationObserver on <html data-theme>, shared by every chart on the page.
let cached: ChartTheme | null = null;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function getSnapshot(): ChartTheme {
  if (!cached || cached.mode !== currentMode()) cached = readTheme();
  return cached;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!observer) {
    observer = new MutationObserver(() => {
      cached = readTheme();
      listeners.forEach((l) => l());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
      cached = null;
    }
  };
}

/** Resolved Graphite tokens for charts; re-renders when the theme toggle flips `data-theme`. */
export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_THEME);
}

/** Non-hook access (event handlers, imperative code). Falls back to var() strings on the server. */
export function chartThemeSnapshot(): ChartTheme {
  return typeof document === "undefined" ? SERVER_THEME : getSnapshot();
}

/* ------------------------------------------------------------------ */
/* Palette helpers                                                     */
/* ------------------------------------------------------------------ */

export function toneColor(theme: ChartTheme, tone: ChartTone): string {
  return tone === "neutral" ? theme.fgSubtle : theme[tone];
}
/** Series colour by index in the fixed order; indexes past the list fold into the grey "Other" slot. */
export function seriesColor(theme: ChartTheme, index: number): string {
  return theme.series[Math.min(Math.max(0, index), theme.series.length - 1)];
}
/** Accepts a tone name ("progress"), a var() string or any CSS colour. Tone names are theme-aware. */
export function resolveColor(theme: ChartTheme, color: string | undefined, fallback: ChartTone = "info"): string {
  if (!color) return toneColor(theme, fallback);
  return (SERIES_TONES as readonly string[]).includes(color) ? toneColor(theme, color as ChartTone) : color;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** 1,284 → "1.3k", 12,900 → "13k", 4,200,000 → "4.2M". For axis ticks and sparkline captions. */
export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e3)}k`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}k`;
  return `${sign}${Math.round(a)}`;
}
export const fmtMoneyCompact = (v: number) => (v < 0 ? "-$" : "$") + fmtCompact(Math.abs(v));
const fmtDecimal = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });

function legendProps(t: ChartTheme, icon: "square" | "plainline" | "circle" = "plainline") {
  return {
    iconType: icon,
    iconSize: 8,
    wrapperStyle: { fontSize: 12, paddingTop: 6 },
    // Text wears text tokens; the swatch beside it carries identity.
    formatter: (value: ReactNode) => <span style={{ color: t.fgMuted }}>{value}</span>,
  } as const;
}

/** Placeholder for a chart slot with no data yet. Says what to do next. */
export function ChartEmpty({ height = 220, title = "No data yet", hint, className }: { height?: number; title?: string; hint?: string; className?: string }) {
  return (
    <div style={{ height }} className={cn("flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-center", className)}>
      <p className="text-[12px] font-medium text-fg-muted">{title}</p>
      {hint && <p className="max-w-xs text-[11px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

/** Revenue (area wash) against direct costs (graphite line). The gap between them is the margin. */
export function RevenueChart({ data, height = 260 }: { data: { month: string; revenue: number; cost: number }[]; height?: number }) {
  const t = useChartTheme();
  const rawId = useId();
  const gid = `rev-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (data.length === 0) return <ChartEmpty height={height} hint="Revenue appears here once loads are delivered and invoiced." />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.info} stopOpacity={0.2} />
            <stop offset="100%" stopColor={t.info} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="month" tick={t.tick} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtMoneyCompact} tick={t.tick} axisLine={false} tickLine={false} width={52} />
        <Tooltip {...t.tooltip} cursor={t.cursorLine} formatter={(v) => money(Number(v))} />
        <Legend {...legendProps(t)} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={t.info} strokeWidth={2} fill={`url(#${gid})`}
          activeDot={{ r: 4, fill: t.info, stroke: t.surface, strokeWidth: 2 }} />
        <Area type="monotone" dataKey="cost" name="Direct costs" stroke={t.fgMuted} strokeWidth={2} fill="transparent"
          activeDot={{ r: 4, fill: t.fgMuted, stroke: t.surface, strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Single-series bar chart. `layout="vertical"` for ranked categories (bars grow to the right). */
export function SimpleBar({ data, dataKey, nameKey, money: isMoney = false, color, tone, height = 260, layout = "horizontal", labelWidth = 150, format }: {
  data: Record<string, string | number>[];
  dataKey: string;
  nameKey: string;
  money?: boolean;
  /** Prefer `tone`. Kept for compatibility: a tone name ("progress") or any CSS colour. */
  color?: string;
  tone?: ChartTone;
  height?: number;
  layout?: "horizontal" | "vertical";
  /** Category label column width in vertical layout. */
  labelWidth?: number;
  /** Value formatter for ticks and tooltip; defaults to compact numbers / money. */
  format?: (v: number) => string;
}) {
  const t = useChartTheme();
  const fill = resolveColor(t, color ?? tone, "info");
  const tickFmt = format ?? (isMoney ? fmtMoneyCompact : fmtCompact);
  const fullFmt = format ?? (isMoney ? (v: number) => money(v) : (v: number) => number(v));
  if (data.length === 0) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {layout === "vertical" ? (
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke={t.grid} horizontal={false} />
          <XAxis type="number" tickFormatter={tickFmt} tick={t.tick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={nameKey} tick={t.tick} axisLine={false} tickLine={false} width={labelWidth} />
          <Tooltip {...t.tooltip} cursor={t.cursorFill} formatter={(v) => fullFmt(Number(v))} />
          <Bar dataKey={dataKey} fill={fill} maxBarSize={24} radius={[0, 4, 4, 0]} activeBar={{ fillOpacity: 0.8 }} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey={nameKey} tick={t.tick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={tickFmt} tick={t.tick} axisLine={false} tickLine={false} width={52} />
          <Tooltip {...t.tooltip} cursor={t.cursorFill} formatter={(v) => fullFmt(Number(v))} />
          <Bar dataKey={dataKey} fill={fill} maxBarSize={24} radius={[4, 4, 0, 0]} activeBar={{ fillOpacity: 0.8 }} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

/** One or more 2 px lines on a shared axis. Series without `tone`/`color` take the fixed palette order. */
export function TrendLine({ data, lines, height = 240, suffix = "", xKey = "month", format }: {
  data: Record<string, string | number>[];
  lines: { key: string; name: string; color?: string; tone?: ChartTone }[];
  height?: number;
  suffix?: string;
  xKey?: string;
  format?: (v: number) => string;
}) {
  const t = useChartTheme();
  if (data.length === 0) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={t.tick} axisLine={false} tickLine={false} />
        <YAxis tick={t.tick} axisLine={false} tickLine={false} width={44} unit={suffix} />
        <Tooltip {...t.tooltip} cursor={t.cursorLine} formatter={(v) => (format ? format(Number(v)) : `${fmtDecimal(Number(v))}${suffix}`)} />
        {lines.length > 1 && <Legend {...legendProps(t)} />}
        {lines.map((l, i) => {
          const c = resolveColor(t, l.color ?? l.tone, SERIES_TONES[i] ?? "neutral");
          return (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={c} strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: c, stroke: t.surface, strokeWidth: 2 }} />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

type Slice = { name: string; value: number; other?: boolean };
/** Part-to-whole reads at a glance only up to ~6 slices; the tail folds into "Other". */
function foldSlices(data: { name: string; value: number }[], max: number): Slice[] {
  const clean = data.filter((d) => d.value > 0);
  if (clean.length <= max) return clean;
  const sorted = [...clean].sort((a, b) => b.value - a.value);
  const rest = sorted.slice(max - 1).reduce((a, d) => a + d.value, 0);
  return [...sorted.slice(0, max - 1), { name: "Other", value: rest, other: true }];
}

function DonutCenter({ viewBox, value, label, theme }: { viewBox?: { cx?: number; cy?: number }; value: ReactNode; label?: string; theme: ChartTheme }) {
  if (!viewBox || viewBox.cx == null || viewBox.cy == null) return null;
  const { cx, cy } = viewBox;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy={label ? -7 : 0} style={{ fontSize: 18, fontWeight: 600, fill: theme.fg, fontFamily: "var(--font-mono)" }}>{value}</tspan>
      {label && <tspan x={cx} dy={17} style={{ fontSize: 11, fill: theme.fgSubtle }}>{label}</tspan>}
    </text>
  );
}

/** Donut with the total in the centre and a legend that carries the numbers (no label on every slice). */
export function Donut({ data, height = 220, tones, total = true, totalLabel }: {
  data: { name: string; value: number }[];
  height?: number;
  /** Override the palette per slice, e.g. status tones. */
  tones?: ChartTone[];
  /** Centre figure: the sum by default; `false` to hide, or any node to override. */
  total?: ReactNode;
  totalLabel?: string;
}) {
  const t = useChartTheme();
  const slices = foldSlices(data, 6);
  const sum = slices.reduce((a, d) => a + d.value, 0);
  if (slices.length === 0) return <ChartEmpty height={height} />;
  const colorAt = (s: Slice, i: number) => (s.other ? t.fgSubtle : tones?.[i] ? toneColor(t, tones[i]) : seriesColor(t, i));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        {/* 2 px stroke in the surface colour is the gap between slices — no border ink. */}
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={0}
          stroke={t.surface} strokeWidth={2} startAngle={90} endAngle={-270}>
          {slices.map((s, i) => <Cell key={s.name} fill={colorAt(s, i)} />)}
          {total !== false && (
            <Label position="center" content={<DonutCenter value={total === true ? fmtCompact(sum) : total} label={totalLabel} theme={t} />} />
          )}
        </Pie>
        <Tooltip {...t.tooltip} formatter={(v, name) => [`${number(Number(v))} · ${sum ? Math.round((Number(v) / sum) * 100) : 0}%`, name]} />
        <Legend iconType="circle" iconSize={8} layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }}
          formatter={(value: ReactNode, entry) => {
            const n = (entry as { payload?: { value?: number } }).payload?.value;
            return (
              <span style={{ color: t.fgMuted }}>
                {value}
                {typeof n === "number" && <span className="num" style={{ color: t.fgSubtle, marginLeft: 6 }}>{number(n)}</span>}
              </span>
            );
          }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Small figures: sparkline and ranking bars (plain SVG / HTML)        */
/* ------------------------------------------------------------------ */

/**
 * Tiny area sparkline for Stat tiles. No axes, no tooltip; the tile's value is the readout.
 * Renders on the server (pure SVG with var() colours) so tiles never flash empty.
 */
export function Spark({ data, tone = "neutral", height = 28, className, fill = true, dot = true }: {
  data: number[];
  tone?: ChartTone;
  height?: number;
  className?: string;
  /** Area wash under the line (~12 % opacity). */
  fill?: boolean;
  /** Mark the latest point. Neutral sparklines mark it in amber (the current period is the signal). */
  dot?: boolean;
}) {
  const clean = data.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <div style={{ height }} className={cn("rounded-sm bg-sunken/60", className)} aria-hidden />;
  const w = 100;
  const pad = 2;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const pts = clean.map((v, i) => [(i / (clean.length - 1)) * w, pad + (1 - (v - min) / range) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w} ${height} L0 ${height} Z`;
  const color = toneVar(tone);
  const dotColor = tone === "neutral" ? toneVar("accent") : color;
  const [, lastY] = pts[pts.length - 1];
  return (
    <div className={cn("relative", className)} style={{ height }} aria-hidden>
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="block overflow-visible">
        {fill && <path d={area} style={{ fill: color, fillOpacity: 0.12 }} />}
        <path d={line} vectorEffect="non-scaling-stroke" style={{ fill: "none", stroke: color, strokeWidth: 1.5, strokeLinejoin: "round", strokeLinecap: "round" }} />
      </svg>
      {dot && (
        <span className="absolute h-1.5 w-1.5 rounded-full"
          style={{ right: -3, top: lastY - 3, background: dotColor, boxShadow: "0 0 0 2px var(--surface)" }} />
      )}
    </div>
  );
}

export type BarsItem = { label: ReactNode; value: number; hint?: string; tone?: ChartTone; href?: string };

/** Horizontal mini bars for ranking lists (top customers, spend by category). HTML, server-renderable. */
export function Bars({ data, tone = "info", format = (v) => number(v), max, labelWidth = 120, valueWidth = 64, showValue = true, className }: {
  data: BarsItem[];
  tone?: ChartTone;
  format?: (v: number) => string;
  /** Scale top; defaults to the largest value. */
  max?: number;
  labelWidth?: number | string;
  valueWidth?: number | string;
  showValue?: boolean;
  className?: string;
}) {
  if (data.length === 0) return <ChartEmpty height={96} className={className} />;
  const top = max ?? (Math.max(...data.map((d) => d.value), 0) || 1);
  return (
    <ul className={cn("space-y-1", className)}>
      {data.map((d, i) => {
        const pct = Math.max(0, Math.min(100, (d.value / top) * 100));
        const color = toneVar(d.tone ?? tone);
        const row = (
          <>
            <span className="min-w-0 shrink-0 truncate text-[12px] text-fg-muted" style={{ width: labelWidth }}>{d.label}</span>
            <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-sunken">
              <span className="absolute inset-y-0 left-0 rounded-r-sm" style={{ width: `${pct}%`, background: color }} />
            </span>
            {showValue && <span className="num shrink-0 text-right text-[12px] text-fg" style={{ width: valueWidth }}>{format(d.value)}</span>}
          </>
        );
        const cls = "-mx-1.5 flex items-center gap-3 rounded px-1.5 py-1 hover:bg-raised";
        return (
          <li key={i} title={d.hint}>
            {d.href ? <Link href={d.href} className={cls}>{row}</Link> : <div className={cls}>{row}</div>}
          </li>
        );
      })}
    </ul>
  );
}
