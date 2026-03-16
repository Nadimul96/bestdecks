import { NextResponse } from "next/server";

import { createRun, listRuns, getOnboarding } from "@/src/server/repository";
import { launchRunProcessing } from "@/src/server/run-executor";
import { getAdminSession } from "@/src/server/auth";
import type { IntakeRun } from "@/src/domain/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await listRuns();
  // Return as flat array so setup guide can check `Array.isArray(data) && data.length > 0`
  return NextResponse.json(Array.isArray(runs) ? runs : []);
}

/**
 * POST /api/runs
 * Accepts either:
 * A) Simple: { websitesText, contactsCsvText? } — builds IntakeRun from saved onboarding data
 * B) Full:   { run: IntakeRun, autoLaunch? } — uses the provided run directly
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    let intakeRun: IntakeRun;

    if (body.run) {
      // Full format: { run: IntakeRun }
      intakeRun = body.run as IntakeRun;
    } else if (body.websitesText) {
      // Simple format: { websitesText, contactsCsvText? }
      // Build the IntakeRun from saved onboarding data + target URLs
      const onboarding = await getOnboarding();

      if (!onboarding.sellerContext) {
        return NextResponse.json(
          { error: "Please complete the Business Context step first." },
          { status: 400 },
        );
      }

      if (!onboarding.questionnaire) {
        return NextResponse.json(
          { error: "Please complete the Deck Style (Run Settings) step first." },
          { status: 400 },
        );
      }

      // Parse website URLs from text
      const urls = (body.websitesText as string)
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      if (urls.length === 0) {
        return NextResponse.json(
          { error: "No target URLs provided." },
          { status: 400 },
        );
      }

      // Parse CSV contacts if provided
      const contactMap = new Map<string, Record<string, string>>();
      if (body.contactsCsvText) {
        const lines = (body.contactsCsvText as string).split("\n").filter((l: string) => l.trim());
        if (lines.length > 1) {
          const headers = lines[0].split(",").map((h: string) => h.trim());
          for (const line of lines.slice(1)) {
            const values = line.split(",").map((v: string) => v.trim().replace(/^"|"$/g, ""));
            const row: Record<string, string> = {};
            headers.forEach((h: string, i: number) => {
              if (values[i]) row[h] = values[i];
            });
            if (row.websiteUrl) {
              contactMap.set(row.websiteUrl, row);
            }
          }
        }
      }

      // Build targets array
      const targets = urls.map((url: string) => {
        // Normalize URL
        let normalizedUrl = url;
        if (!/^https?:\/\//i.test(normalizedUrl)) {
          normalizedUrl = `https://${normalizedUrl}`;
        }

        const contact = contactMap.get(url) || contactMap.get(normalizedUrl);
        return {
          websiteUrl: normalizedUrl,
          companyName: contact?.companyName || undefined,
          firstName: contact?.firstName || undefined,
          lastName: contact?.lastName || undefined,
          role: contact?.role || undefined,
          campaignGoal: contact?.campaignGoal || undefined,
          notes: contact?.notes || undefined,
        };
      });

      const sc = onboarding.sellerContext;
      const q = onboarding.questionnaire;

      // Normalize seller websiteUrl — DB may store it without protocol or as empty string
      const sellerWebsiteUrl = sc.websiteUrl && sc.websiteUrl.trim()
        ? (!/^https?:\/\//i.test(sc.websiteUrl) ? `https://${sc.websiteUrl}` : sc.websiteUrl)
        : undefined;

      intakeRun = {
        sellerContext: {
          websiteUrl: sellerWebsiteUrl,
          companyName: sc.companyName,
          offerSummary: sc.offerSummary ?? "",
          services: sc.services ?? [],
          differentiators: sc.differentiators ?? [],
          targetCustomer: sc.targetCustomer ?? "",
          desiredOutcome: sc.desiredOutcome ?? "",
          proofPoints: sc.proofPoints ?? [],
          constraints: sc.constraints ?? [],
        },
        questionnaire: {
          archetype: q.archetype ?? "cold_outreach",
          audience: q.audience ?? "",
          objective: q.objective ?? "",
          callToAction: q.callToAction ?? "",
          outputFormat: (q.outputFormat as string) === "presenton_editor"
            ? "bestdecks_editor"
            : (q.outputFormat ?? "bestdecks_editor"),
          desiredCardCount: Number(q.desiredCardCount) || 8,
          tone: q.tone ?? "consultative",
          visualStyle: q.visualStyle ?? "premium_modern",
          imagePolicy: q.imagePolicy ?? "auto",
          mustInclude: Array.isArray(q.mustInclude) ? q.mustInclude : [],
          mustAvoid: Array.isArray(q.mustAvoid) ? q.mustAvoid : [],
          extraInstructions: q.extraInstructions || undefined,
          customTone: q.customTone || undefined,
          customVisualStyle: q.customVisualStyle || undefined,
          visualContentTypes: q.visualContentTypes ?? [],
          visualDensity: q.visualDensity ?? "moderate",
          optionalReview: q.optionalReview ?? true,
          allowUserApprovedCrawlException: q.allowUserApprovedCrawlException ?? false,
        },
        targets,
      } as IntakeRun;
    } else {
      return NextResponse.json(
        { error: "Request must include either 'websitesText' or 'run'." },
        { status: 400 },
      );
    }

    const runId = await createRun(intakeRun);
    const shouldLaunch = body.autoLaunch !== false; // Default to auto-launch
    if (shouldLaunch) {
      launchRunProcessing(runId);
    }

    return NextResponse.json({
      ok: true,
      runId,
      launched: shouldLaunch,
    });
  } catch (error) {
    console.error("[runs] Error creating run:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create the run.",
      },
      { status: 400 },
    );
  }
}
