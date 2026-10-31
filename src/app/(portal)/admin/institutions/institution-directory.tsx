"use client";

import { useMemo, useState } from "react";
import { Building2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { InstitutionForm, InstitutionRowActions, type InstitutionRow } from "./institution-form";

export type DirectoryRow = InstitutionRow & {
  region: { id: string; name: string; code: string };
  _count: { applications: number; users: number; undertakings: number };
};

type Region = { id: string; name: string; code: string };

/**
 * Client shell for the institution directory: filters, the create/edit form and
 * the table. Filtering here is over the already-scoped page the server sent, so
 * it never widens access — the server remains the authority on scope.
 */
export function InstitutionDirectory({
  rows,
  regions,
  canEdit,
}: {
  rows: DirectoryRow[];
  regions: Region[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [editing, setEditing] = useState<InstitutionRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.aicteId} ${r.city ?? ""}`.toLowerCase().includes(q)) return false;
      if (regionFilter && r.regionId !== regionFilter) return false;
      if (activeFilter === "active" && !r.isActive) return false;
      if (activeFilter === "inactive" && r.isActive) return false;
      return true;
    });
  }, [rows, query, regionFilter, activeFilter]);

  function startEdit(row: DirectoryRow) {
    setEditing(row);
    setShowForm(true);
  }

  return (
    <div className="space-y-5">
      {canEdit && showForm && (
        <InstitutionForm
          regions={regions}
          editing={editing}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      <Card>
        <CardHeader
          title={`${filtered.length} institution(s)`}
          subtitle="Only institutions inside your scope are shown; scope is applied in the database query."
          action={
            <>
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  className="input pl-8"
                  placeholder="Search name, id or city"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search institutions"
                />
              </div>
              <select className="input w-full sm:w-36" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} aria-label="Filter by region">
                <option value="">All regions</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code}
                  </option>
                ))}
              </select>
              <select className="input w-full sm:w-36" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} aria-label="Filter by status">
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {canEdit && !showForm && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setShowForm(true);
                  }}
                  className="btn-primary shrink-0"
                >
                  <Building2 className="h-4 w-4" />
                  Register institution
                </button>
              )}
            </>
          }
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title={rows.length === 0 ? "No institutions yet" : "No institutions match those filters"}
            description={
              rows.length === 0
                ? canEdit
                  ? "Register the first institution to begin."
                  : "Institutions registered by an administrator will appear here."
                : "Adjust the search or filters to see more."
            }
          />
        ) : (
          <div className="table-wrap border-0">
            <table className="w-full">
              <thead className="bg-canvas">
                <tr>
                  <th className="th">Institution</th>
                  <th className="th">Region</th>
                  <th className="th">Contact</th>
                  <th className="th">Records</th>
                  <th className="th">Status</th>
                  {canEdit && <th className="th th-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-canvas">
                    <td className="td">
                      <p className="font-medium text-ink">{r.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted">{r.aicteId}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {[r.city, r.district, r.state].filter(Boolean).join(", ")}
                      </p>
                    </td>
                    <td className="td">
                      <Badge tone="brand">{r.region.code}</Badge>
                      <p className="mt-1 text-[11px] text-muted">{r.region.name}</p>
                    </td>
                    <td className="td">
                      <p className="text-xs text-ink">{r.contactEmail ?? "—"}</p>
                      <p className="text-[11px] text-muted">{r.contactPhone ?? ""}</p>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone="neutral">{r._count.applications} app</Badge>
                        <Badge tone="neutral">{r._count.users} user</Badge>
                        <Badge tone="neutral">{r._count.undertakings} und</Badge>
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={r.isActive ? "ok" : "danger"} dot>
                        {r.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className="td">
                        <InstitutionRowActions row={r} onEdit={() => startEdit(r)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
