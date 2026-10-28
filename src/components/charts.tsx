"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#2563eb";
const OK = "#109169";
const WARN = "#ca8a04";
const DANGER = "#dc2626";
const INFO = "#0284c7";
const NEUTRAL = "#94a3b8";

const SLA_COLORS: Record<string, string> = {
  ON_TRACK: OK,
  DUE_SOON: WARN,
  OVERDUE: DANGER,
  PAUSED: INFO,
  MET: OK,
  BREACHED: DANGER,
};

function tooltipStyle() {
  return {
    contentStyle: {
      borderRadius: 12,
      border: "1px solid rgb(var(--line))",
      background: "rgb(var(--surface))",
      color: "rgb(var(--ink))",
      fontSize: 12,
      boxShadow: "0 8px 24px -12px rgb(16 24 40 / 0.25)",
    },
    labelStyle: { color: "rgb(var(--muted))", fontSize: 11, fontWeight: 600 },
  };
}

export function SlaDonut({ data }: { data: { name: string; value: number; key: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-xs text-muted">No cases in scope yet.</p>;
  }
  return (
    <div className="relative h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={84}
            paddingAngle={3}
            strokeWidth={0}
            animationDuration={900}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={SLA_COLORS[d.key] ?? NEUTRAL} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle()} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-ink">{total}</span>
        <span className="text-[11px] text-muted">in scope</span>
      </div>
    </div>
  );
}

export function StageBars({ data }: { data: { stage: string; avgDays: number; sla: number; breaches: number }[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-xs text-muted">No completed stage transitions yet.</p>;
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
          <XAxis
            dataKey="stage"
            tick={{ fontSize: 10, fill: "rgb(var(--muted))" }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={54}
          />
          <YAxis tick={{ fontSize: 10, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle()} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="avgDays" name="Avg days" fill={BRAND} radius={[6, 6, 0, 0]} animationDuration={800} />
          <Bar dataKey="sla" name="Allowance" fill="rgb(var(--line))" radius={[6, 6, 0, 0]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusBars({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-xs text-muted">Nothing to show.</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
            tick={{ fontSize: 10, fill: "rgb(var(--muted))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...tooltipStyle()} />
          <Bar dataKey="value" name="Cases" fill={BRAND} radius={[0, 6, 6, 0]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RegionTrend({ data }: { data: { name: string; total: number; overdue: number }[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-xs text-muted">No regional data.</p>;
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle()} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="total"
            name="Total"
            stroke={BRAND}
            strokeWidth={2.5}
            dot={{ r: 3, fill: BRAND }}
            animationDuration={900}
          />
          <Line
            type="monotone"
            dataKey="overdue"
            name="Overdue"
            stroke={DANGER}
            strokeWidth={2.5}
            dot={{ r: 3, fill: DANGER }}
            animationDuration={900}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WorkloadBars({ data }: { data: { name: string; open: number; overdue: number }[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-xs text-muted">No open assignments.</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle()} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="open" name="Open" stackId="a" fill={BRAND} radius={[0, 0, 0, 0]} animationDuration={800} />
          <Bar dataKey="overdue" name="Overdue" stackId="a" fill={DANGER} radius={[6, 6, 0, 0]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
