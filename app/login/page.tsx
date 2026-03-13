import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { getAdminSession } from "@/src/server/auth";

export default async function LoginPage() {
  const session = await getAdminSession();

  if (session) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Soft gradient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 size-[600px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute -bottom-32 -right-32 size-[500px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Grid pattern — subtle depth cue */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-6 py-16">
        {/* Logo & headline */}
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo size="lg" showText={false} className="mb-5" />

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome to bestdecks
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Sign in to build personalized decks at scale
          </p>
        </div>

        {/* Login form */}
        <LoginForm />

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground/60">
          Powered by research-driven AI personalization
        </p>
      </div>
    </main>
  );
}
