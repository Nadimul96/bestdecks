import { NextResponse } from "next/server";

import {
  dedupeTargets,
  parseCsvText,
  parseTargetsFromCsvRows,
  parseTargetsFromMultilineInput,
} from "@/src/domain/intake";

export async function POST(request: Request) {
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
}
