import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCompanyBriefMarkdown,
  buildDeckInputText,
  buildPresentationAdditionalInstructions,
} from "./deck";
import type { CompanyBrief, DeckGenerationInput } from "../integrations/providers";

const baseBrief: CompanyBrief = {
  websiteUrl: "https://acme.com",
  companyName: "Acme Corp",
  industry: "SaaS",
  offer: "CRM for plumbers",
  locale: "Portland, OR",
  likelyBuyer: "Owner",
  whyNow: "Expanding to multi-location",
  painPoints: ["Manual scheduling", "Lost leads"],
  proofPoints: ["500 users", "4.8 star rating"],
  pitchAngles: ["Automate follow-ups"],
  sourceUrls: ["https://acme.com", "https://acme.com/about"],
};

const baseDeckInput: DeckGenerationInput = {
  companyBrief: baseBrief,
  sellerPositioningSummary: "We build tailored decks.",
  archetype: "cold_outreach",
  objective: "Book a call",
  audience: "Founder",
  cardCount: 8,
  callToAction: "Schedule a 15-minute demo",
  tone: "consultative",
  visualStyle: "premium_modern",
  mustInclude: ["Specific revenue numbers"],
  mustAvoid: ["Generic buzzwords"],
  outputFormat: "bestdecks_editor",
  imagePolicy: "auto",
};

test("buildCompanyBriefMarkdown includes all brief sections", () => {
  const md = buildCompanyBriefMarkdown(baseBrief);

  assert.match(md, /# Acme Corp/);
  assert.match(md, /Website: https:\/\/acme\.com/);
  assert.match(md, /Industry: SaaS/);
  assert.match(md, /Offer: CRM for plumbers/);
  assert.match(md, /Locale: Portland, OR/);
  assert.match(md, /Likely buyer: Owner/);
  assert.match(md, /Why now: Expanding to multi-location/);
  assert.match(md, /## Pain points/);
  assert.match(md, /- Manual scheduling/);
  assert.match(md, /- Lost leads/);
  assert.match(md, /## Proof points/);
  assert.match(md, /- 500 users/);
  assert.match(md, /## Pitch angles/);
  assert.match(md, /- Automate follow-ups/);
  assert.match(md, /## Sources/);
  assert.match(md, /- https:\/\/acme\.com\/about/);
});

test("buildCompanyBriefMarkdown uses websiteUrl when companyName is missing", () => {
  const brief: CompanyBrief = {
    ...baseBrief,
    companyName: undefined,
  };

  const md = buildCompanyBriefMarkdown(brief);
  assert.match(md, /# https:\/\/acme\.com/);
});

test("buildCompanyBriefMarkdown shows Unknown for missing optional fields", () => {
  const brief: CompanyBrief = {
    ...baseBrief,
    locale: undefined,
    likelyBuyer: undefined,
    whyNow: undefined,
  };

  const md = buildCompanyBriefMarkdown(brief);
  assert.match(md, /Locale: Unknown/);
  assert.match(md, /Likely buyer: Unknown/);
  assert.match(md, /Why now: Not established/);
});

test("buildCompanyBriefMarkdown outputs - None for empty arrays", () => {
  const brief: CompanyBrief = {
    ...baseBrief,
    painPoints: [],
    proofPoints: [],
    pitchAngles: [],
  };

  const md = buildCompanyBriefMarkdown(brief);
  // After each heading, should have "- None"
  const sections = md.split("## ");
  const painSection = sections.find((s) => s.startsWith("Pain points"));
  assert.ok(painSection?.includes("- None"));
});

test("buildDeckInputText includes all required sections", () => {
  const text = buildDeckInputText(baseDeckInput);

  assert.match(text, /# Tailored proposal for Acme Corp/);
  assert.match(text, /## Seller positioning/);
  assert.match(text, /We build tailored decks\./);
  assert.match(text, /## Target company brief/);
  assert.match(text, /## Required structure/);
  assert.match(text, /Audience: Founder/);
  assert.match(text, /Objective: Book a call/);
  assert.match(text, /Call to action: Schedule a 15-minute demo/);
  assert.match(text, /Card count target: 8/);
  assert.match(text, /## Must include/);
  assert.match(text, /- Specific revenue numbers/);
  assert.match(text, /## Must avoid/);
  assert.match(text, /- Generic buzzwords/);
});

test("buildDeckInputText appends image URLs when provided", () => {
  const text = buildDeckInputText(baseDeckInput, [
    "https://cdn.example.com/hero.png",
    "https://cdn.example.com/logo.svg",
  ]);

  assert.match(text, /Images approved for use:/);
  assert.match(text, /- https:\/\/cdn\.example\.com\/hero\.png/);
  assert.match(text, /- https:\/\/cdn\.example\.com\/logo\.svg/);
});

test("buildDeckInputText omits image block when no URLs provided", () => {
  const text = buildDeckInputText(baseDeckInput, []);
  assert.doesNotMatch(text, /Images approved for use:/);
});

test("buildPresentationAdditionalInstructions maps all visual styles", () => {
  const styles = [
    "auto",
    "minimal",
    "editorial",
    "sales_polished",
    "premium_modern",
    "playful",
    "custom",
  ] as const;

  for (const style of styles) {
    const text = buildPresentationAdditionalInstructions({
      archetype: "cold_outreach",
      tone: "consultative",
      visualStyle: style,
      imagePolicy: "auto",
      cardCount: 8,
    });

    assert.match(text, /Create a cold outreach presentation with 8 slides/);
    assert.match(text, /Tone: consultative/);
    assert.match(text, /Visual direction:/);
    assert.match(text, /DESIGN QUALITY/);
  }
});

test("buildPresentationAdditionalInstructions excludes images for never policy", () => {
  const text = buildPresentationAdditionalInstructions({
    archetype: "cold_outreach",
    tone: "consultative",
    visualStyle: "premium_modern",
    imagePolicy: "never",
    cardCount: 6,
  });

  assert.match(text, /Do not include images/);
  assert.doesNotMatch(text, /Use high-quality, relevant images/);
});

test("buildPresentationAdditionalInstructions includes images for auto policy", () => {
  const text = buildPresentationAdditionalInstructions({
    archetype: "cold_outreach",
    tone: "consultative",
    visualStyle: "premium_modern",
    imagePolicy: "auto",
    cardCount: 6,
  });

  assert.match(text, /Use high-quality, relevant images/);
  assert.doesNotMatch(text, /Do not include images/);
});

test("buildPresentationAdditionalInstructions replaces underscores in archetype", () => {
  const text = buildPresentationAdditionalInstructions({
    archetype: "competitive_displacement",
    tone: "bold",
    visualStyle: "auto",
    imagePolicy: "auto",
    cardCount: 10,
  });

  assert.match(text, /competitive displacement presentation/);
  assert.doesNotMatch(text, /competitive_displacement/);
});
