"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function Shell({
  user,
  unread: initialUnread,
  children,
}: {
  user: { name: string; email: string; role: string; scopeLabel: string };
  unread: number;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    let mounted = true;
    const syncUnread = async () => {
      try {
        const res = await fetch("/api/notifications?limit=1");
        if (res.ok) {
          const data = await res.json();
          if (mounted && typeof data.unread === "number") {
            setUnread(data.unread);
          }
        }
      } catch {
        // ignore in offline/transient failure
      }
    };

    const interval = setInterval(syncUnread, 15000);
    const onFocus = () => {
      void syncUnread();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("aicte-sidebar-collapsed");
      if (stored !== null) {
        setCollapsed(stored === "true");
      }
    } catch {
      // ignore in environments without localStorage
    }
  }, []);

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("aicte-sidebar-collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        role={user.role}
        collapsed={collapsed}
        onToggle={handleToggle}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        unread={unread}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          unread={unread}
          sidebarCollapsed={collapsed}
          onToggleSidebar={handleToggle}
          onOpenMobile={() => setMobileOpen(true)}
        />
        {/* The only scroll region: the header above and the footer below stay put. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
        <footer className="shrink-0 border-t border-line bg-surface px-6 py-3 text-center text-[11px] text-muted">
          AICTE Approval Workflow, SLA and Compliance Platform · Decision support only — all statutory decisions rest with the authorised official.
        </footer>
      </div>
    </div>
  );
}
