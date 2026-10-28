import type { Metadata } from "next";
import { requirePageActor, describeScope } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS } from "@/lib/constants";
import { humanise } from "@/lib/utils";
import { TotpSetup } from "@/components/totp-setup";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const actor = await requirePageActor();
  const scopeLabel = await describeScope(actor);
  const permissions = permissionsFor(actor.role);

  return (
    <div>
      <PageHeader eyebrow="Account" title="Profile and security" description="Your role and scope determine what you can see and do." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Identity" subtitle="Read from the database on every request, so a change takes effect immediately" />
          <CardBody className="space-y-3.5">
            <Field label="Name" value={actor.name} />
            <Field label="Email" value={actor.email} />
            <Field label="Role" value={<Badge tone="brand">{ROLE_LABELS[actor.role] ?? actor.role}</Badge>} />
            <Field label="Scope" value={scopeLabel || "All regions"} />
          </CardBody>
        </Card>

        <TotpSetup />
      </div>

      <Card className="mt-5">
        <CardHeader title="Permissions" subtitle="What your role is allowed to do" />
        <CardBody>
          <div className="flex flex-wrap gap-1.5">
            {permissions.map((p) => (
              <Badge key={p} tone="neutral">
                {humanise(p.replace(":", " "))}
              </Badge>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3.5 text-[11px] leading-relaxed text-muted">
            Scope is applied inside each database query, not filtered afterwards. That means a regional officer
            cannot load another region's cases even by guessing an identifier.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-medium text-ink">{value}</span>
    </div>
  );
}
