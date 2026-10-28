import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  // The demo panel lists seeded accounts and their shared password. That is
  // useful for a demo and a disclosure in a real deployment, so it is shown
  // only outside production unless explicitly re-enabled with
  // SHOW_DEMO_ACCOUNTS=true.
  const showDemo = process.env.SHOW_DEMO_ACCOUNTS
    ? process.env.SHOW_DEMO_ACCOUNTS === "true"
    : process.env.NODE_ENV !== "production";

  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <LoginForm showDemoAccounts={showDemo} />
    </Suspense>
  );
}
