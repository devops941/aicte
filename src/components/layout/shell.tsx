"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function Shell({
  user,
  unread,
  children,
}: {
  user: { name: string; email: string; role: string; scopeLabel: string };
  unread: number;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar
        role={user.role}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        unread={unread}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} unread={unread} onOpenMobile={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
        <footer className="border-t border-line px-6 py-4 text-center text-[11px] text-muted">
          AICTE Approval Workflow, SLA and Compliance Platform · Decision support only — all statutory decisions rest with the authorised official.
        </footer>
      </div>
    </div>
  );
}
