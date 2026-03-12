import { LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SidebarSupportCard() {
  return (
    <Card size="sm" className="shadow-none group-data-[collapsible=icon]:hidden">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Start with onboarding</CardTitle>
        <CardDescription>
          Capture credentials, seller defaults, and import sources before you launch the first run.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <Button asChild variant="outline" size="sm" className="w-full">
          <a href="#onboarding">
            <LifeBuoy />
            Open onboarding
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
