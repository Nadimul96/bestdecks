import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { SetupGuide } from "@/components/setup-guide";
import { WorkspaceHeader } from "@/components/workspace-header";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BusinessProvider } from "@/lib/business-context";
import { getAdminSession } from "@/src/server/auth";
import { redirect } from "next/navigation";

export default async function ConsolePage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/login");
  }

  const user = {
    name: session.user.name || "Admin",
    email: session.user.email,
    avatar: session.user.image || "",
  };

  return (
    <BusinessProvider>
      <SidebarProvider defaultOpen>
        <AppSidebar variant="inset" user={user} />
        <SidebarInset>
          <WorkspaceHeader />

          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <WorkspaceShell
              currentUser={{
                name: session.user.name,
                email: session.user.email,
              }}
            />
          </div>

          <SetupGuide />
          <CommandMenu />
        </SidebarInset>
      </SidebarProvider>
    </BusinessProvider>
  );
}
