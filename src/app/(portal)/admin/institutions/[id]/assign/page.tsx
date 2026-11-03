import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { institutionById, institutionAssignments, assignableUsers } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { InstitutionAssign } from "@/components/institution-assign";

export const metadata: Metadata = { title: "Assign team" };

export default async function AssignPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  if (!can(actor.role, "admin:config")) redirect("/dashboard");

  const { id } = await params;
  const institution = await institutionById(id);
  if (!institution) notFound();

  const [assignments, users] = await Promise.all([institutionAssignments(id), assignableUsers()]);

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title={`Assign team — ${institution.name}`}
        description="Assign the officers who handle this institution's cases. Assigned staff can see its applications and receive its notifications."
      />
      <InstitutionAssign
        institutionId={institution.id}
        assignments={assignments.map((a) => ({ id: a.id, role: a.role, user: a.user }))}
        users={users}
      />
    </div>
  );
}
