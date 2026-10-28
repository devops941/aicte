import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { regionOptions, userList } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { UserConsole } from "./user-console";

export const metadata: Metadata = { title: "Users & Roles" };

export default async function UsersPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "admin:users") && actor.role !== "REGIONAL_OFFICER" && actor.role !== "INSTITUTION_ADMIN") {
    redirect("/dashboard");
  }

  const [users, regions, institutions] = await Promise.all([
    userList(actor),
    regionOptions(),
    prisma.institution.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Users & Roles"
        description="Accounts within your scope. A role and a region or institution decide what each account can see; the server re-checks every rule, so the controls below cannot be bypassed by editing a request."
      />
      <UserConsole
        users={users}
        regions={regions}
        institutions={institutions}
        actorRole={actor.role}
        canEdit={can(actor.role, "admin:users")}
      />
    </div>
  );
}
