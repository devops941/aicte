"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime, initials } from "@/lib/utils";
import { UserForm, UserRowActions, type EditableUser } from "./user-admin";

type DirectoryUser = EditableUser & {
  totpEnabled: boolean;
  lastLoginAt: Date | string | null;
  lockedUntil: Date | string | null;
  region: { name: string } | null;
  institution: { name: string } | null;
};

type Option = { id: string; name: string; code?: string };

/**
 * Client shell for the user console. Filtering runs over the page the server
 * already scoped, so it cannot reveal an account the viewer may not see.
 */
export function UserConsole({
  users,
  regions,
  institutions,
  actorRole,
  canEdit,
}: {
  users: DirectoryUser[];
  regions: Option[];
  institutions: Option[];
  actorRole: string;
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editing, setEditing] = useState<EditableUser | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !`${u.name} ${u.email}`.toLowerCase().includes(q)) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      return true;
    });
  }, [users, query, roleFilter]);

  return (
    <div className="space-y-5">
      {canEdit && showForm && (
        <UserForm
          regions={regions}
          institutions={institutions}
          editing={editing}
          actorRole={actorRole}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {canEdit && !showForm && (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="btn-primary"
        >
          <UserPlus className="h-4 w-4" />
          Create account
        </button>
      )}

      <Card>
        <CardHeader
          title={`${filtered.length} account(s)`}
          subtitle="Row-level scope is applied in the query, not just in the interface."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  className="input pl-8"
                  placeholder="Search name or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search users"
                />
              </div>
              <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
                <option value="">All roles</option>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          }
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={users.length === 0 ? "No accounts in your scope" : "No accounts match those filters"}
            description="Adjust the search or role filter to see more."
          />
        ) : (
          <div className="table-wrap border-0">
            <table className="w-full">
              <thead className="bg-canvas">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Role</th>
                  <th className="th">Scope</th>
                  <th className="th">Security</th>
                  <th className="th">Last sign-in</th>
                  {canEdit && <th className="th text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-canvas">
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[11px] font-semibold text-brand-ink">
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{u.name}</p>
                          <p className="truncate text-[11px] text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone="brand">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                      {u.designation && <p className="mt-1 text-[10px] text-muted">{u.designation}</p>}
                    </td>
                    <td className="td text-muted">{u.institution?.name ?? u.region?.name ?? "All regions"}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={u.isActive ? "ok" : "danger"}>{u.isActive ? "Active" : "Disabled"}</Badge>
                        {u.totpEnabled && <Badge tone="info">TOTP</Badge>}
                        {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="warn">Locked</Badge>}
                      </div>
                    </td>
                    <td className="td text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                    {canEdit && (
                      <td className="td">
                        <UserRowActions
                          user={u}
                          onEdit={() => {
                            setEditing(u);
                            setShowForm(true);
                          }}
                        />
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
