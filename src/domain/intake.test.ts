import test from "node:test";
import assert from "node:assert/strict";

import {
  dedupeTargets,
  parseCsvText,
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
    ["https://acme.com", "https://northshoreclinic.com"],
  );
});

test("parseTargetsFromCsvRows maps optional personalization columns", () => {
  const rows = parseCsvText(`website,company,first_name,last_name,role,goal,notes
acme.com,Acme Plumbing,Sarah,Lee,Founder,Book a call,Local expansion`);
  const targets = parseTargetsFromCsvRows(rows);

  assert.equal(targets[0]?.websiteUrl, "https://acme.com");
  assert.equal(targets[0]?.companyName, "Acme Plumbing");
  assert.equal(targets[0]?.firstName, "Sarah");
  assert.equal(targets[0]?.lastName, "Lee");
  assert.equal(targets[0]?.role, "Founder");
  assert.equal(targets[0]?.campaignGoal, "Book a call");
  assert.equal(targets[0]?.notes, "Local expansion");
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
