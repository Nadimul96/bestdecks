import test from "node:test";
import assert from "node:assert/strict";

import {
  CsvIntakeError,
  dedupeTargets,
  parseCsvText,
  parseTargetsFromIntakeDraft,
  parseTargetsFromCsvRows,
  parseTargetsFromMultilineInput,
} from "./intake";

test("parseTargetsFromMultilineInput normalizes missing protocols", () => {
  const targets = parseTargetsFromMultilineInput(`
    acme.com
    https://northshoreclinic.com
  `);

  assert.deepEqual(
    targets.map((target) => target.websiteUrl),
    ["https://acme.com/", "https://northshoreclinic.com/"],
  );
});

test("parseTargetsFromCsvRows maps optional personalization columns", () => {
  const rows = parseCsvText(`website,company,first_name,last_name,role,goal,notes
acme.com,Acme Plumbing,Sarah,Lee,Founder,Book a call,Local expansion`);
  const targets = parseTargetsFromCsvRows(rows);

  assert.equal(targets[0]?.websiteUrl, "https://acme.com/");
  assert.equal(targets[0]?.companyName, "Acme Plumbing");
  assert.equal(targets[0]?.firstName, "Sarah");
  assert.equal(targets[0]?.lastName, "Lee");
  assert.equal(targets[0]?.role, "Founder");
  assert.equal(targets[0]?.campaignGoal, "Book a call");
  assert.equal(targets[0]?.notes, "Local expansion");
});

test("parseCsvText preserves quoted commas, escaped quotes, and quoted newlines", () => {
  const rows = parseCsvText(`website,company,notes
acme.com,"Acme, Inc.","The buyer said ""review it"".
Follow up next week."`);

  assert.deepEqual(rows, [{
    websiteUrl: "acme.com",
    companyName: "Acme, Inc.",
    notes: "The buyer said \"review it\".\nFollow up next week.",
  }]);
});

test("parseCsvText fails closed on malformed quotes and row-width mismatches", () => {
  for (const input of [
    `website,notes\nacme.com,"unfinished`,
    `website,notes\nacme.com`,
    `website,notes\nacme.com,one,extra`,
    `website,notes\nacme.com,un"quoted`,
    `website,notes\nacme.com,"closed"suffix`,
  ]) {
    assert.throws(
      () => parseCsvText(input),
      (error) => error instanceof CsvIntakeError && error.code === "malformed_csv",
    );
  }
});

test("target CSV rejects recipient-email header variants without reading row values", () => {
  for (const header of ["email", "recipient_email", "work-email-address"]) {
    assert.throws(
      () => parseCsvText(`website,${header}\nacme.com,fixture-value`),
      (error) =>
        error instanceof CsvIntakeError && error.code === "recipient_email_column",
    );
  }
});

test("target CSV rejects unbounded metadata columns before raw draft persistence", () => {
  assert.throws(
    () => parseCsvText("website,phone\nacme.com,fixture-value"),
    (error) =>
      error instanceof CsvIntakeError && error.code === "unsupported_csv_column",
  );
});

test("target CSV rejects rows beyond the run target limit", () => {
  const rows = Array.from(
    { length: 101 },
    (_, index) => `target-${index}.example.test`,
  );
  assert.throws(
    () => parseCsvText(`website\n${rows.join("\n")}`),
    (error) =>
      error instanceof CsvIntakeError && error.code === "csv_row_limit_exceeded",
  );
});

test("simple run intake uses canonical CSV parsing and hostname matching", () => {
  const targets = parseTargetsFromIntakeDraft(
    "acme.com\nhttps://www.northshoreclinic.com",
    `website,company,notes
https://www.acme.com,"Acme, Inc.","Uses ""quoted"", structured notes"
northshoreclinic.com,North Shore Clinic,Expansion`,
  );

  assert.deepEqual(targets.map(({ websiteUrl, companyName, notes }) => ({
    websiteUrl,
    companyName,
    notes,
  })), [
    {
      websiteUrl: "https://acme.com/",
      companyName: "Acme, Inc.",
      notes: "Uses \"quoted\", structured notes",
    },
    {
      websiteUrl: "https://www.northshoreclinic.com/",
      companyName: "North Shore Clinic",
      notes: "Expansion",
    },
  ]);
});

test("dedupeTargets keeps one row per hostname", () => {
  const deduped = dedupeTargets([
    { websiteUrl: "https://www.acme.com" },
    { websiteUrl: "https://acme.com" },
    { websiteUrl: "https://northshoreclinic.com" },
  ]);

  assert.equal(deduped.length, 2);
  assert.deepEqual(
    deduped.map((target) => target.websiteUrl),
    ["https://www.acme.com", "https://northshoreclinic.com"],
  );
});
