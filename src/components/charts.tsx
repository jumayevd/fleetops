"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

const fmtMoney = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);
const axis = { fontSize: 11, fill: "#64748b" };

export function RevenueChart({ data }: { data: { month: string; revenue: number; cost: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtMoney} tick={axis} axisLine={false} tickLine={false} width={50} />
        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2} fill="url(#rev)" />
        <Area type="monotone" dataKey="cost" name="Direct costs" stroke="#f59e0b" strokeWidth={2} fill="transparent" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBar({ data, dataKey, nameKey, money = false, color = "#2563eb", height = 260, layout = "horizontal" }: {
  data: Record<string, string | number>[]; dataKey: string; nameKey: string; money?: boolean; color?: string; height?: number; layout?: "horizontal" | "vertical";
}) {
  const fmt = money ? fmtMoney : (v: number) => v.toLocaleString();
  return (
    <ResponsiveContainer width="100%" height={height}>
      {layout === "vertical" ? (
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tickFormatter={fmt} tick={axis} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={nameKey} tick={axis} axisLine={false} tickLine={false} width={150} />
          <Tooltip formatter={(v) => (money ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString())} />
          <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey={nameKey} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={axis} axisLine={false} tickLine={false} width={50} />
          <Tooltip formatter={(v) => (money ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString())} />
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function TrendLine({ data, lines, height = 240, suffix = "" }: {
  data: Record<string, string | number>[]; lines: { key: string; name: string; color: string }[]; height?: number; suffix?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} width={40} unit={suffix} />
        <Tooltip formatter={(v) => `${v}${suffix}`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ["#2563eb", "#7c3aed", "#10b981", "#f59e0b", "#ef4444", "#14b8a6", "#64748b"];
export function Donut({ data, height = 220 }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend iconType="circle" layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
