import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { getSession } from "@/src/server/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const session = await getSession();
  if (session?.user) {
    redirect("/console");
  }

  const params = await searchParams;
  const referralCode = params.ref || null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Soft gradient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 size-[600px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute -bottom-32 -right-32 size-[500px] rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Grid pattern */}
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
            Create your account
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Get 3 free decks when you sign up — no credit card required
          </p>
          {referralCode && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
              🎁 Referral bonus: +20 extra credits on your first plan
            </div>
          )}
        </div>

        {/* Auth form */}
        <AuthForm mode="signup" referralCode={referralCode} />

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground/60">
          By signing up you agree to our{" "}
          <a href="#" className="underline hover:text-foreground/60">Terms</a>
          {" "}and{" "}
          <a href="#" className="underline hover:text-foreground/60">Privacy Policy</a>
        </p>
      </div>
    </main>
  );
}
