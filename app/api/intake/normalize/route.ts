import { NextResponse } from "next/server";

import {
  dedupeTargets,
  parseCsvText,
  parseTargetsFromCsvRows,
  parseTargetsFromMultilineInput,
} from "@/src/domain/intake";
import { getSession } from "@/src/server/auth";
import { readBoundedJson, RequestBodyTooLargeError } from "@/src/server/request-body";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await readBoundedJson(request)) as {
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
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    return NextResponse.json(
      { error: "Unable to normalize intake rows. Check the submitted URLs and CSV format." },
      { status: 400 },
    );
  }
}
