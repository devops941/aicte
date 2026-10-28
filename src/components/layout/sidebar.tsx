"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileStack,
  FolderKanban,
  ShieldCheck,
  Bell,
  CalendarClock,
  BarChart3,
  History,
  GitBranch,
  Users,
  ArrowUpRight,
  CalendarDays,
  Gavel,
  ChevronsLeft,
  ChevronsRight,
  X,
  Building2,
  Settings,
  Database,
  UserCog,
} from "lucide-react";
import { NAV_BY_ROLE } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FileStack,
  FolderKanban,
  ShieldCheck,
  Bell,
  CalendarClock,
  BarChart3,
  History,
  GitBranch,
  Users,
  ArrowUpRight,
  CalendarDays,
  Gavel,
  Building2,
  Settings,
  Database,
  UserCog,
};

export function Sidebar({
  role,
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
  unread,
}: {
  role: string;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  unread: number;
}) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.AUDITOR;

  const content = (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className={cn("mb-2 flex items-center gap-2.5 px-2 py-2", collapsed && "justify-center")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white shadow-glow">
          A
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-ink">AICTE Portal</p>
            <p className="truncate text-[11px] text-muted">Approval Workflow</p>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const showBadge = item.href === "/notifications" && unread > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                active ? "text-brand-ink" : "text-muted hover:bg-canvas hover:text-ink",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-brand-soft"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className={cn("relative z-10 h-[18px] w-[18px] shrink-0", active && "text-brand")} />
              {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
              {showBadge && (
                <span
                  className={cn(
                    "relative z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white",
                    collapsed && "absolute right-1 top-1",
                  )}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        className="hidden items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-canvas hover:text-ink lg:flex"
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {!collapsed && "Collapse"}
      </button>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-line bg-surface transition-[width] duration-300 lg:block",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="absolute left-0 top-0 h-full w-64 border-r border-line bg-surface"
          >
            <button
              type="button"
              onClick={onCloseMobile}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-muted hover:bg-canvas"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            {content}
          </motion.aside>
        </div>
      )}
    </>
  );
}
