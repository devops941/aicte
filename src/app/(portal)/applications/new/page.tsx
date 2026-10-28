import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { NewApplicationForm } from "@/components/new-application-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "New application" };

export default async function NewApplicationPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "application:create")) redirect("/dashboard");

  return (
    <div>
      <PageHeader
        eyebrow="Institution view"
        title="New application"
        description="Create a draft. Nothing moves until you submit it, and submitting routes it automatically."
      />
      <NewApplicationForm />
    </div>
  );
}
