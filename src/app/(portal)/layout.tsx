import { Shell } from "@/components/layout/shell";
import { describeScope, requirePageActor, unreadCount } from "@/lib/auth/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  const [scopeLabel, unread] = await Promise.all([describeScope(actor), unreadCount(actor.id)]);

  return (
    <Shell
      user={{ name: actor.name, email: actor.email, role: actor.role, scopeLabel }}
      unread={unread}
    >
      {children}
    </Shell>
  );
}
