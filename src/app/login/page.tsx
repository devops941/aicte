import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  // The demo panel lists seeded accounts and their shared password.
  // Displayed by default in both development and production unless explicitly
  // disabled with SHOW_DEMO_ACCOUNTS=false.
  const showDemo = process.env.SHOW_DEMO_ACCOUNTS !== "false";

  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <LoginForm showDemoAccounts={showDemo} />
    </Suspense>
  );
}
