"use client";

import * as React from "react";
import { LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("nadimul96@gmail.com");
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
    <Card className="w-full max-w-md border-border/60 bg-card/95 shadow-2xl shadow-black/30">
      <CardHeader className="space-y-4">
        <Badge variant="secondary" className="w-fit">
          Admin access
        </Badge>
        <div className="space-y-2">
          <CardTitle className="text-3xl font-semibold tracking-tight">Sign in to Bestdecks</CardTitle>
          <CardDescription className="text-sm leading-6">
            Better Auth is now protecting the workspace. Use the seeded admin
            account to access onboarding, runs, and delivery controls.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="space-y-2 text-sm font-medium text-foreground">
            Email
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                required
                autoComplete="email"
                className="pl-9"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>

          <label className="space-y-2 text-sm font-medium text-foreground">
            Password
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                required
                autoComplete="current-password"
                className="pl-9"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Signing in
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
