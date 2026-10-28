import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { SETTINGS, parseSetting } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { SettingsForm, type SettingView } from "./settings-form";

export const metadata: Metadata = { title: "System Settings" };

export default async function SettingsPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "admin:config")) redirect("/dashboard");

  const rows = await prisma.systemSetting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r]));

  // Secret values are dropped here, on the server, so they never reach the page
  // payload. A secret is represented only by whether it has been configured.
  const settings: SettingView[] = SETTINGS.map((def) => {
    const row = stored.get(def.key);
    const isSet = row !== undefined && row.value !== "";
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      type: def.type,
      options: def.options ?? null,
      help: def.help ?? null,
      secret: def.secret ?? false,
      value: def.secret ? null : parseSetting(def, row?.value),
      isSet,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="System Settings"
        description="Platform-wide configuration. Secrets such as the SMTP password are write-only: the stored value is never returned to the browser, and leaving the field blank keeps it unchanged."
      />
      <SettingsForm settings={settings} />
    </div>
  );
}
