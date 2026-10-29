"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Filter, Loader2, Search, Sparkles, X } from "lucide-react";
import { Badge, RISK_TONE, SLA_TONE, STATUS_TONE } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SLA_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/constants";
import { cn, formatDate, humanise } from "@/lib/utils";
import { delayRisk } from "@/lib/ai";

export type CaseRow = {
  id: string;
  appNo: string;
  title: string;
  type: string;
  status: string;
  slaState: string;
  slaDueAt: string | Date | null;
  updatedAt: string | Date;
  institution: { id: string; name: string; state: string; aicteId: string };
  currentStage: { id: string; name: string; slaWorkingDays: number; assigneeRole: string } | null;
  assignments: { user: { id: string; name: string } }[];
  _count: { documents: number; clarifications: number };
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS);
const TYPE_OPTIONS = Object.keys(TYPE_LABELS);
const SLA_OPTIONS = ["ON_TRACK", "DUE_SOON", "OVERDUE", "PAUSED"];

export function CaseList({
  rows,
  basePath,
  canExport,
  showInstitution = true,
}: {
  rows: CaseRow[];
  basePath: string;
  canExport: boolean;
  showInstitution?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [sla, setSla] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [nlQuery, setNlQuery] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [nlNote, setNlNote] = useState<string | null>(null);
  const [nlRows, setNlRows] = useState<CaseRow[] | null>(null);

  const visible = useMemo(() => {
    const source = nlRows ?? rows;
    const q = search.trim().toLowerCase();
    return source.filter((r) => {
      if (status.length && !status.includes(r.status)) return false;
      if (type.length && !type.includes(r.type)) return false;
      if (sla.length && !sla.includes(r.slaState)) return false;
      if (!q) return true;
      return (
        r.appNo.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.institution.name.toLowerCase().includes(q)
      );
    });
  }, [rows, nlRows, search, status, type, sla]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const activeFilters = status.length + type.length + sla.length;

  async function runNlSearch() {
    if (nlQuery.trim().length < 3) return;
    setNlBusy(true);
    setNlNote(null);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nlQuery }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setNlRows(json.data.result.rows as CaseRow[]);
      setNlNote(json.data.filter.interpreted);
    } catch (e) {
      setNlNote(e instanceof Error ? e.message : "Search failed");
    } finally {
      setNlBusy(false);
    }
  }

  function clearNl() {
    setNlRows(null);
    setNlNote(null);
    setNlQuery("");
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden animate-fade-up">
        <div className="toolbar">
          <div className="relative w-full sm:max-w-md sm:flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by application number, title or institution"
              className="input pl-10"
            />
          </div>

          <div className="toolbar-group">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={cn("btn-ghost", activeFilters > 0 && "border-brand/40 bg-brand-soft text-brand-ink")}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFilters > 0 && (
                <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{activeFilters}</span>
              )}
            </button>

            {canExport && (
              <a href="/api/reports/export" className="btn-ghost" download>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">CSV</span>
              </a>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-b border-line px-5 py-4 sm:px-6">
                <FilterRow label="Status" options={STATUS_OPTIONS} selected={status} onToggle={(v) => toggle(status, setStatus, v)} labels={STATUS_LABELS} />
                <FilterRow label="Type" options={TYPE_OPTIONS} selected={type} onToggle={(v) => toggle(type, setType, v)} labels={TYPE_LABELS} />
                <FilterRow label="Timeline" options={SLA_OPTIONS} selected={sla} onToggle={(v) => toggle(sla, setSla, v)} labels={SLA_LABELS} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Sparkles className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
              <input
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runNlSearch()}
                placeholder="Describe what you need, e.g. overdue cases in Southern Region"
                className="input pl-10 pr-10"
              />
              {nlQuery && (
                <button
                  type="button"
                  onClick={clearNl}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  aria-label="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button type="button" onClick={() => void runNlSearch()} disabled={nlBusy} className="btn-ghost shrink-0">
              {nlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Search
            </button>
          </div>
          {nlNote && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
              <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {nlNote} · Translated to a filter, never to raw SQL. Your scope still applies.
            </p>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No cases match"
            description={
              nlRows
                ? "The interpreted filter returned nothing in your scope. Try a different phrase."
                : "Adjust the filters or clear the search to see more."
            }
            action={
              (search || activeFilters > 0 || nlRows) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatus([]);
                    setType([]);
                    setSla([]);
                    clearNl();
                  }}
                  className="btn-ghost btn-sm"
                >
                  Clear everything
                </button>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Table on wide screens. No transform/animation on this wrapper:
              a transformed ancestor becomes the containing block and would
              break the sticky table header. */}
          <div className="table-wrap hidden lg:block">
            <table className="w-full text-left border-collapse">
              <thead className="bg-canvas border-b border-line">
                <tr>
                  <th className="th min-w-[220px] pl-5">Application</th>
                  {showInstitution && <th className="th min-w-[170px]">Institution</th>}
                  <th className="th min-w-[150px]">Stage</th>
                  <th className="th min-w-[130px]">Status</th>
                  <th className="th min-w-[120px]">Timeline</th>
                  <th className="th min-w-[110px]">Deadline</th>
                  <th className="th min-w-[130px] pr-6">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row, i) => {
                  const risk = delayRisk({
                    stageAgeWorkingDays: 0,
                    slaWorkingDays: row.currentStage?.slaWorkingDays ?? 10,
                    openCasesForOwner: 0,
                    clarificationsRaised: row._count.clarifications,
                    avgStageDaysForType: 0,
                  });
                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="group cursor-pointer transition-colors hover:bg-canvas"
                      onClick={() => router.push(`${basePath}/${row.id}`)}
                    >
                      <td className="td pl-5">
                        <div className="max-w-[280px]">
                          <span className="font-mono text-[11px] font-semibold text-brand">{row.appNo}</span>
                          <p className="mt-0.5 truncate font-medium text-ink" title={row.title}>{row.title}</p>
                          <p className="mt-0.5 text-[11px] text-muted">{TYPE_LABELS[row.type] ?? row.type}</p>
                        </div>
                      </td>
                      {showInstitution && (
                        <td className="td">
                          <p className="max-w-[200px] truncate font-medium text-ink" title={row.institution.name}>{row.institution.name}</p>
                          <p className="text-[11px] text-muted">{row.institution.state}</p>
                        </td>
                      )}
                      <td className="td">
                        <span className="font-medium text-ink">{row.currentStage?.name ?? "—"}</span>
                      </td>
                      <td className="td">
                        <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{STATUS_LABELS[row.status] ?? row.status}</Badge>
                      </td>
                      <td className="td">
                        <Badge tone={SLA_TONE[row.slaState] ?? "neutral"} dot>
                          {SLA_LABELS[row.slaState] ?? row.slaState}
                        </Badge>
                      </td>
                      <td className="td">
                        <span className="font-medium text-ink">{formatDate(row.slaDueAt)}</span>
                      </td>
                      <td className="td pr-6">
                        <span className="font-medium text-muted">{row.assignments[0]?.user.name ?? "Unassigned"}</span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards on narrow screens */}
          <div className="space-y-3 lg:hidden">
            {visible.map((row, i) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
              >
                <Link href={`${basePath}/${row.id}`} className="card block card-pad transition-shadow hover:shadow-lift">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-brand">{row.appNo}</span>
                    <Badge tone={SLA_TONE[row.slaState] ?? "neutral"} dot>
                      {SLA_LABELS[row.slaState] ?? row.slaState}
                    </Badge>
                  </div>
                  <p className="mt-1.5 font-medium text-ink">{row.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{row.institution.name}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{STATUS_LABELS[row.status] ?? row.status}</Badge>
                    <Badge tone="neutral">{row.currentStage?.name ?? "—"}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                    <span>Due {formatDate(row.slaDueAt)}</span>
                    <span>{row.assignments[0]?.user.name ?? "Unassigned"}</span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-[11px] text-muted">
            Showing {visible.length} of {rows.length} case(s) in your scope
          </p>
        </>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  selected,
  onToggle,
  labels,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  labels: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
            selected.includes(opt)
              ? "border-brand/40 bg-brand-soft text-brand-ink"
              : "border-line bg-surface text-muted hover:border-brand/30 hover:text-ink",
          )}
        >
          {labels[opt] ?? humanise(opt)}
        </button>
      ))}
    </div>
  );
}
