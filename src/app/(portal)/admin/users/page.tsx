import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { userList } from "@/lib/queries";
import { can } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "admin:users") && actor.role !== "REGIONAL_OFFICER" && actor.role !== "INSTITUTION_ADMIN") {
    redirect("/dashboard");
  }

  const users = await userList(actor);

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Users"
        description="Accounts within your scope. Each carries a role and a region or institution, which determines what they can see."
      />

      <Card>
        <CardHeader title={`${users.length} user(s)`} subtitle="Role and scope decide access; row-level scoping is applied in every query" />
        <div className="table-wrap border-0">
          <table className="w-full">
            <thead className="bg-canvas">
              <tr>
                <th className="th">Name</th>
                <th className="th">Role</th>
                <th className="th">Scope</th>
                <th className="th">Security</th>
                <th className="th">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
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
                      {u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="warn">Locked</Badge>}
                    </div>
                  </td>
                  <td className="td text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
