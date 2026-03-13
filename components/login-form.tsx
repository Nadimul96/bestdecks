"use client";

import * as React from "react";
import { LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await authClient.signIn.email(
        {
          email,
          password,
          rememberMe: true,
        },
        {
          onError(context) {
            setError(context.error.message ?? "Unable to sign in.");
          },
          onSuccess() {
            router.replace("/");
            router.refresh();
          },
        },
      );

      if (result.error) {
        setError(result.error.message ?? "Unable to sign in.");
      }
    });
  }

  return (
    <div className="w-full max-w-sm">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="h-11 rounded-lg border-border/60 bg-white/80 pl-10 text-sm shadow-sm backdrop-blur transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-white dark:bg-card/50 dark:focus:bg-card/80"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">
            Password
          </label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-11 rounded-lg border-border/60 bg-white/80 pl-10 text-sm shadow-sm backdrop-blur transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-white dark:bg-card/50 dark:focus:bg-card/80"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div className="animate-fade-in rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Button
          type="submit"
          className="h-11 w-full rounded-lg text-sm font-semibold shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/25"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </div>
  );
}
