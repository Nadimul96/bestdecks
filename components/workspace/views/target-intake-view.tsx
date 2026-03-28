"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  LoaderCircle,
  Play,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dispatchRunStart } from "@/lib/run-launch";
import { ViewLayout, SectionCard, FieldGroup } from "../view-layout";
import { viewMeta, type Notice } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta["target-intake"];

const targetExamples = `https://acmeplumbing.com
https://northshoreclinic.com
https://sunsetlogistics.io`;

/* ─── Simple CSV/TSV parser ─── */
function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? "\t" : ",";

  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);

  return { headers, rows };
}

/* ─── Expected column mappings ─── */
const EXPECTED_COLUMNS = [
  "websiteUrl",
  "companyName",
  "firstName",
  "lastName",
  "role",
  "email",
  "campaignGoal",
  "notes",
];

function normalizeHeader(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mappings: Record<string, string> = {
    websiteurl: "websiteUrl",
    website: "websiteUrl",
    url: "websiteUrl",
    site: "websiteUrl",
    companyname: "companyName",
    company: "companyName",
    firstname: "firstName",
    first: "firstName",
    fname: "firstName",
    lastname: "lastName",
    last: "lastName",
    lname: "lastName",
    role: "role",
    title: "role",
    jobtitle: "role",
    position: "role",
    email: "email",
    emailaddress: "email",
    campaigngoal: "campaignGoal",
    goal: "campaignGoal",
    campaign: "campaignGoal",
    notes: "notes",
    note: "notes",
    comments: "notes",
  };
  return mappings[h] ?? header;
}

interface FileUploadState {
  file: File | null;
  headers: string[];
  mappedHeaders: string[];
  rows: string[][];
  confirmed: boolean;
}

export function TargetIntakeView() {
  const [websitesText, setWebsitesText] = React.useState("");
  const [contactsCsvText, setContactsCsvText] = React.useState("");
  const [showCsv, setShowCsv] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // File upload state
  const [upload, setUpload] = React.useState<FileUploadState>({
    file: null,
    headers: [],
    mappedHeaders: [],
    rows: [],
    confirmed: false,
  });
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const websiteCount = websitesText
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        toast.error("Could not read file.");
        return;
      }

      const { headers, rows } = parseDelimited(text);
      if (headers.length === 0) {
        toast.error("No data found in file.");
        return;
      }

      const mapped = headers.map(normalizeHeader);

      setUpload({
        file,
        headers,
        mappedHeaders: mapped,
        rows,
        confirmed: false,
      });
      setShowCsv(true);

      toast.success(`Loaded ${rows.length} rows with ${headers.length} columns.`);
    };
    reader.onerror = () => toast.error("Error reading file.");
    reader.readAsText(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["csv", "tsv", "txt"].includes(ext ?? "")) {
        toast.error(
          ext === "xlsx"
            ? "XLSX isn't supported yet — please export as CSV from your spreadsheet."
            : "Please upload a CSV or TSV file.",
        );
        return;
      }
      processFile(file);
    }
  }

  function confirmHeaders() {
    // Convert the parsed data to CSV text that the existing pipeline expects
    const csvLines = [upload.mappedHeaders.join(",")];
    for (const row of upload.rows) {
      csvLines.push(
        row.map((cell) => {
          // Escape cells that contain commas or quotes
          if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(","),
      );
    }
    setContactsCsvText(csvLines.join("\n"));

    // Also extract website URLs if not already present
    const urlColIndex = upload.mappedHeaders.indexOf("websiteUrl");
    if (urlColIndex >= 0 && !websitesText.trim()) {
      const urls = upload.rows
        .map((r) => r[urlColIndex])
        .filter((u) => u && u.length > 0);
      if (urls.length > 0) {
        setWebsitesText(urls.join("\n"));
        toast.success(`Extracted ${urls.length} target URLs from your file.`);
      }
    }

    setUpload((prev) => ({ ...prev, confirmed: true }));
    toast.success("Column mapping confirmed!");
  }

  function removeFile() {
    setUpload({
      file: null,
      headers: [],
      mappedHeaders: [],
      rows: [],
      confirmed: false,
    });
    setContactsCsvText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (websiteCount === 0) {
      setNotice({ type: "error", message: "Add at least one target URL." });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    // ── Pre-flight: check onboarding completeness before hitting API ──
    try {
      const [scRes] = await Promise.all([
        fetch("/api/onboarding/seller-context"),
        fetch("/api/onboarding/questionnaire"),
      ]);

      const missingSteps: string[] = [];

      if (scRes.ok) {
        const sc = await scRes.json();
        if (!sc.companyName && !sc.websiteUrl) {
          missingSteps.push("Your Business — add your company name or website");
        }
      } else {
        missingSteps.push("Your Business — complete your business profile");
      }

      if (missingSteps.length > 0) {
        setNotice({
          type: "error",
          message: `Please complete setup before launching:\n• ${missingSteps.join("\n• ")}`,
        });
        toast.error("Please complete your business profile first.", {
          action: {
            label: "Go to Your Business",
            onClick: () => { window.location.hash = "seller-context"; },
          },
        });
        setSubmitting(false);
        return;
      }
    } catch {
      // Network error on pre-flight — let the main request handle it
    }

    // ── Main request ──
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websitesText,
          contactsCsvText: contactsCsvText || undefined,
          autoLaunch: false,
        }),
      });

      const payload = await res.json().catch(() => null) as
        | { runId?: string; error?: string; insufficientCredits?: boolean }
        | null;

      if (res.ok && payload?.runId) {
        dispatchRunStart(payload.runId);
        toast.success(
          `Run starting with ${websiteCount} target${websiteCount > 1 ? "s" : ""}.`,
        );
        setWebsitesText("");
        setContactsCsvText("");
        removeFile();
        // Auto-navigate to pipeline page so user can see progress
        window.location.hash = "pipeline";
      } else {
        const errorMsg = payload?.error ?? "Failed to create run.";
        setNotice({
          type: "error",
          message: errorMsg,
        });

        // Special handling for insufficient credits
        if (payload?.insufficientCredits || res.status === 402) {
          toast.error(errorMsg, {
            action: {
              label: "Upgrade",
              onClick: () => { window.location.hash = "billing"; },
            },
            duration: 8000,
          });
        } else {
          toast.error(errorMsg);
        }
      }
    } catch {
      setNotice({ type: "error", message: "Network error." });
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      actions={
        <Button
          onClick={handleSubmit}
          disabled={submitting || websiteCount === 0}
        >
          {submitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Creating run…
            </>
          ) : (
            <>
              <Play className="size-4" />
              Launch run
              {websiteCount > 0 && (
                <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                  {websiteCount}
                </span>
              )}
            </>
          )}
        </Button>
      }
    >
      {/* Notice */}
      {notice && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-[13px] animate-fade-in",
            notice.type === "success" &&
              "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
            notice.type === "error" &&
              "border-destructive/20 bg-destructive/5 text-destructive",
            notice.type === "info" &&
              "border-primary/20 bg-primary/5 text-primary",
          )}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            {notice.message}
            {notice.link && (
              <a
                href={notice.link.hash}
                className="ml-1 font-medium underline underline-offset-2 hover:opacity-80"
              >
                {notice.link.label}
              </a>
            )}
          </span>
        </div>
      )}

      {/* Websites — primary input */}
      <SectionCard
        title="Target websites"
        description="Paste one URL per line. These are the companies you want personalized decks for."
      >
        <FieldGroup
          label="Website URLs"
          hint={
            websiteCount > 0
              ? `${websiteCount} target${websiteCount > 1 ? "s" : ""}`
              : "Required"
          }
        >
          <Textarea
            value={websitesText}
            onChange={(e) => setWebsitesText(e.target.value)}
            placeholder={targetExamples}
            className="min-h-[160px] resize-none font-mono text-xs leading-relaxed"
          />
        </FieldGroup>
      </SectionCard>

      {/* File upload for contacts */}
      <SectionCard
        title="Contact list"
        description="Upload a CSV, TSV, or Excel file with contact details. We'll auto-detect your column headers."
      >
        <div className="space-y-4">
          {/* File drop zone */}
          {!upload.file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed py-10 transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40",
              )}
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted/60">
                <Upload className="size-5 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Drop your file here or click to browse
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Supports CSV, TSV files • We&apos;ll auto-detect your columns
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx"
                onChange={handleFileInput}
                className="hidden"
                aria-label="Upload contact list file"
              />
            </div>
          ) : (
            /* File loaded — show info bar */
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="size-5 text-primary" />
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    {upload.file.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {upload.rows.length} rows • {upload.headers.length} columns
                    {upload.confirmed && (
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                        ✓ Confirmed
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={removeFile}
                aria-label="Remove uploaded file"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Column mapping preview */}
          {upload.file && !upload.confirmed && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-foreground">
                  Column mapping preview
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Review the detected headers and confirm
                </p>
              </div>

              {/* Header mapping table */}
              <div className="overflow-hidden rounded-lg border border-border/40">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Your column
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Maps to
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {upload.headers.map((h, i) => {
                      const mapped = upload.mappedHeaders[i];
                      const isKnown = EXPECTED_COLUMNS.includes(mapped);
                      return (
                        <tr
                          key={i}
                          className="border-t border-border/20"
                        >
                          <td className="px-3 py-2 font-mono text-foreground">
                            {h}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 font-mono text-[11px]",
                                isKnown
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                              )}
                            >
                              {mapped}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {isKnown ? (
                              <CheckCircle2 className="size-3.5 text-emerald-500" />
                            ) : (
                              <span className="text-[11px] text-amber-500">
                                Custom field
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Data preview — first 5 rows */}
              {upload.rows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border/40">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          #
                        </th>
                        {upload.mappedHeaders.map((h, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {upload.rows.slice(0, 5).map((row, ri) => (
                        <tr key={ri} className="border-t border-border/20">
                          <td className="px-3 py-2 text-muted-foreground">
                            {ri + 1}
                          </td>
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className="max-w-[200px] truncate px-3 py-2 text-foreground"
                            >
                              {cell || (
                                <span className="text-muted-foreground/40">
                                  —
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {upload.rows.length > 5 && (
                    <div className="border-t border-border/20 bg-muted/20 px-3 py-2 text-center text-[11px] text-muted-foreground">
                      + {upload.rows.length - 5} more rows
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={removeFile}>
                  Cancel
                </Button>
                <Button size="sm" onClick={confirmHeaders}>
                  <CheckCircle2 className="size-3.5" />
                  Confirm mapping
                </Button>
              </div>
            </div>
          )}

          {/* Fallback: manual CSV paste (collapsible) */}
          {!upload.file && (
            <div className="rounded-lg border border-border/30">
              <button
                type="button"
                onClick={() => setShowCsv(!showCsv)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/20"
              >
                <div>
                  <p className="text-[12px] font-medium text-foreground">
                    Prefer to paste CSV data manually?
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Copy-paste your spreadsheet data directly
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    showCsv && "rotate-180",
                  )}
                />
              </button>
              {showCsv && (
                <div className="border-t border-border/30 px-4 py-3 space-y-2">
                  <Textarea
                    value={contactsCsvText}
                    onChange={(e) => setContactsCsvText(e.target.value)}
                    placeholder={`websiteUrl,firstName,lastName,role,email\nhttps://acmeplumbing.com,Sarah,Lee,Founder,sarah@acmeplumbing.com`}
                    className="min-h-[120px] resize-none font-mono text-xs leading-relaxed"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Expected columns:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                      websiteUrl, firstName, lastName, role, email, campaignGoal, notes
                    </code>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ─── Bottom action bar ─── */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-xl border border-border/50 bg-card/95 px-6 py-4 shadow-lg backdrop-blur-sm">
        <p className="text-[13px] text-muted-foreground">
          {websiteCount > 0
            ? `${websiteCount} target${websiteCount > 1 ? "s" : ""} ready`
            : "Add target URLs or upload a contact file to get started"}
          {upload.confirmed && ` • ${upload.rows.length} contacts mapped`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => (window.location.hash = "run-settings")}
          >
            Back to Deck Style
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || websiteCount === 0}
          >
            {submitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Creating run…
              </>
            ) : (
              <>
                <Play className="size-4" />
                Launch run
                {websiteCount > 0 && (
                  <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                    {websiteCount}
                  </span>
                )}
              </>
            )}
          </Button>
        </div>
      </div>
    </ViewLayout>
  );
}
