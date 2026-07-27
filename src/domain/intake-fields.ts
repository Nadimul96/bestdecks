export const TARGET_CSV_COLUMNS = [
  "websiteUrl",
  "companyName",
  "firstName",
  "lastName",
  "role",
  "campaignGoal",
  "notes",
] as const;

export type TargetCsvColumn = (typeof TARGET_CSV_COLUMNS)[number];

const targetCsvHeaderMap: Readonly<Record<string, TargetCsvColumn>> = {
  websiteurl: "websiteUrl",
  website: "websiteUrl",
  url: "websiteUrl",
  domain: "websiteUrl",
  site: "websiteUrl",
  companyname: "companyName",
  company: "companyName",
  name: "companyName",
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
  campaigngoal: "campaignGoal",
  goal: "campaignGoal",
  campaign: "campaignGoal",
  notes: "notes",
  note: "notes",
  comments: "notes",
};

export function normalizeTargetCsvHeaderToken(header: string): string {
  return header.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

export function canonicalizeTargetCsvHeader(header: string): string {
  const trimmed = header.trim();
  return targetCsvHeaderMap[normalizeTargetCsvHeaderToken(trimmed)] ?? trimmed;
}

export function isSupportedTargetCsvHeader(header: string): boolean {
  const canonical = canonicalizeTargetCsvHeader(header);
  return TARGET_CSV_COLUMNS.some((column) => column === canonical);
}

/**
 * Recipient delivery is outside the active product contract. Reject common
 * recipient-email header variants without looking at any row values.
 */
export function isRecipientEmailCsvHeader(header: string): boolean {
  const normalized = normalizeTargetCsvHeaderToken(header);
  return normalized === "email"
    || normalized.endsWith("email")
    || normalized.endsWith("emailaddress")
    || normalized === "recipientaddress";
}
