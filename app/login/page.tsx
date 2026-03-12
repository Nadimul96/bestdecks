import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getAdminSession } from "@/src/server/auth";

export default async function LoginPage() {
  const session = await getAdminSession();

  if (session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-16 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_28%)]" />
      <div className="relative z-10 flex w-full max-w-5xl flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-5">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-400">
            Bestdecks workspace
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Operator access only.
          </h1>
          <p className="text-base leading-7 text-zinc-300 sm:text-lg">
            The dashboard now requires a Better Auth session before anyone can touch
            onboarding, target intake, or run execution.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
