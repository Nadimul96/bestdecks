import { AppSidebar } from "@/components/app-sidebar";
import { RunBuilderShell } from "@/components/run-builder-shell";
import { SearchTrigger } from "@/components/search-trigger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getAdminSession } from "@/src/server/auth";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar
        variant="inset"
        user={{
          name: session.user.name || "Admin",
          email: session.user.email,
          avatar: session.user.image || "",
        }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <SearchTrigger />
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="hidden md:inline-flex">
                Cloudflare first
              </Badge>
              <Badge variant="secondary" className="hidden lg:inline-flex">
                Presenton delivery
              </Badge>
              <Button asChild size="sm">
                <a href="#onboarding">Begin onboarding</a>
              </Button>
            </div>
          </div>
        </header>

        <div className="h-full p-4 md:p-6">
          <RunBuilderShell
            currentUser={{
              name: session.user.name,
              email: session.user.email,
            }}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
