"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronDown, LogOut, Menu, Moon, Sun, User as UserIcon } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";

export function Topbar({
  user,
  unread,
  onOpenMobile,
}: {
  user: { name: string; email: string; role: string; scopeLabel: string };
  unread: number;
  onOpenMobile: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("aicte-theme");
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored ? stored === "dark" : prefers;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("aicte-theme", next ? "dark" : "light");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMobile}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="truncate text-xs text-muted">
            {ROLE_LABELS[user.role] ?? user.role}
            {user.scopeLabel ? ` · ${user.scopeLabel}` : ""}
          </p>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-xl border border-line p-2.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={dark ? "moon" : "sun"}
                initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.2 }}
                className="block"
              >
                {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </button>

          <Link
            href="/notifications"
            className="relative rounded-xl border border-line p-2.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <>
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse-ring rounded-full bg-danger" />
              </>
            )}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-xl border border-line py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-canvas"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-semibold text-white">
                {initials(user.name)}
              </span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block max-w-[150px] truncate text-xs font-semibold leading-tight text-ink">
                  {user.name}
                </span>
                <span className="block max-w-[150px] truncate text-[11px] text-muted">{user.email}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", menuOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                  className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
                >
                  <div className="border-b border-line px-4 py-3">
                    <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                    <p className="mt-1.5 text-[11px] font-medium text-brand">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink"
                  >
                    <UserIcon className="h-4 w-4" />
                    Profile and security
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-sm text-danger transition-colors hover:bg-danger/5"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
