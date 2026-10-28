"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  GitBranch,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const DEMO_ACCOUNTS = [
  { label: "System Admin", email: "admin@gmail.com", role: "Configuration, users, SLA" },
  { label: "Institution", email: "institution@sri.edu.in", role: "Submit and respond" },
  { label: "Regional Officer", email: "ro.south@aicte.gov.in", role: "Scrutiny, Southern region" },
  { label: "Bureau Officer", email: "bureau.south@aicte.gov.in", role: "Stage processing" },
  { label: "EVC Member", email: "evc.member1@aicte.gov.in", role: "Visit observations" },
  { label: "Competent Authority", email: "authority@aicte.gov.in", role: "Statutory decisions" },
  { label: "Auditor", email: "auditor@aicte.gov.in", role: "Read-only oversight" },
];

const DEMO_PASSWORD = "Admin@123";

const FEATURES = [
  { icon: GitBranch, title: "Data-driven routing", body: "Stage sequences and SLAs live in tables, versioned per application type." },
  { icon: Clock, title: "Working-day deadlines", body: "Holiday-aware SLA clocks that pause while the institution responds." },
  { icon: ShieldCheck, title: "Tamper-evident audit", body: "Hash-chained history that detects any edited or removed entry." },
  { icon: Sparkles, title: "Assistive, never decisive", body: "AI suggests and cites its sources. It never changes a stage or status." },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("admin@gmail.com");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [totp, setTotp] = useState("");
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        totp: totp || undefined,
        redirect: false,
      });
      if (res?.error) {
        setError("Those credentials were not accepted. Check the email and password, or use a demo account below.");
        setLoading(false);
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Sign in could not be completed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left: brand and capability panel */}
      <div className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 grid-noise opacity-[0.15]" />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, rgb(var(--brand)) 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, rgb(var(--info)) 0%, transparent 70%)" }}
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-white shadow-glow">
              A
            </div>
            <div>
              <p className="text-sm font-semibold text-white">AICTE Approval Workflow</p>
              <p className="text-xs text-white/60">SLA, compliance and escalation platform</p>
            </div>
          </div>

          <h1 className="mt-12 max-w-lg text-3xl font-semibold leading-tight tracking-tight text-white">
            Every application moves through its prescribed stages, on time, with a full record.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
            The platform routes cases, measures pendency against prescribed timelines, chases
            obligations and escalates overdue work. It does not make statutory decisions.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.5 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.08]"
              >
                <f.icon className="h-4 w-4 text-brand" style={{ color: "rgb(var(--brand))" }} />
                <p className="mt-2.5 text-xs font-semibold text-white">{f.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/60">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="relative z-10 text-[11px] text-white/40"
        >
          Decision support only. All statutory decisions rest with the authorised official.
        </motion.p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center bg-canvas px-5 py-10 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-base font-bold text-white">
              A
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">AICTE Approval Workflow</p>
              <p className="text-[11px] text-muted">SLA and compliance platform</p>
            </div>
          </div>

          <h2 className="text-lg font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use your official account to continue.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="you@aicte.gov.in"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <AnimatePresence initial={false}>
              {showTotp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <label htmlFor="totp" className="label">
                    Authenticator code
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      id="totp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={totp}
                      onChange={(e) => setTotp(e.target.value)}
                      className="input pl-10 tracking-[0.3em]"
                      placeholder="000000"
                      maxLength={6}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 px-3.5 py-3 text-xs text-danger"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setShowTotp((v) => !v)}
            className="mt-3 w-full text-center text-[11px] text-muted transition-colors hover:text-brand"
          >
            {showTotp ? "Hide authenticator field" : "I have an authenticator code"}
          </button>

          <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
            <button
              type="button"
              onClick={() => setShowAccounts((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
                Demo accounts
              </span>
              <span className="text-[11px] text-brand">{showAccounts ? "Hide" : "Show"}</span>
            </button>

            <AnimatePresence initial={false}>
              {showAccounts && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-1">
                    {DEMO_ACCOUNTS.map((a) => (
                      <button
                        key={a.email}
                        type="button"
                        onClick={() => {
                          setEmail(a.email);
                          setPassword(DEMO_PASSWORD);
                          setError(null);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-canvas"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold text-ink">{a.label}</span>
                          <span className="block truncate text-[10px] text-muted">{a.role}</span>
                        </span>
                        <span className="shrink-0 text-[10px] text-brand">Use</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-line pt-2.5 text-[10px] text-muted">
                    All demo accounts share the password <span className="font-mono font-semibold">{DEMO_PASSWORD}</span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
