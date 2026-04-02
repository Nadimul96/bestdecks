import { NextResponse } from "next/server";

import {
  dedupeTargets,
  parseCsvText,
  parseTargetsFromCsvRows,
  parseTargetsFromMultilineInput,
} from "@/src/domain/intake";
import { getSession } from "@/src/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      mode: "multiline" | "csv";
      input: string;
    };

    const parsed =
      body.mode === "csv"
        ? parseTargetsFromCsvRows(parseCsvText(body.input))
        : parseTargetsFromMultilineInput(body.input);

    const normalized = dedupeTargets(parsed).slice(0, 100);

    return NextResponse.json({
      ok: true,
      count: normalized.length,
      targets: normalized,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to normalize intake rows.",
      },
      { status: 400 },
    );
  }
}
