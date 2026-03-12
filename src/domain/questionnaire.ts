import { z } from "zod";

import {
  deliveryFormatSchema,
  deckArchetypeSchema,
  imagePolicySchema,
  runQuestionnaireSchema,
  toneSchema,
  visualStyleSchema,
} from "./schemas";

const rawQuestionnaireSchema = z.object({
  goal: z.string().trim().min(1),
  audience: z.string().trim().min(1),
  deckType: deckArchetypeSchema,
  outputFormat: deliveryFormatSchema,
  tone: toneSchema,
  cardCount: z.number().int().min(4).max(20),
  callToAction: z.string().trim().min(1),
  visualStyle: visualStyleSchema,
  imagePolicy: imagePolicySchema,
  mustInclude: z.array(z.string().trim().min(1)).default([]),
  mustAvoid: z.array(z.string().trim().min(1)).default([]),
  extraInstructions: z.string().trim().min(1).optional(),
  optionalReview: z.boolean().default(true),
  allowUserApprovedCrawlException: z.boolean().default(false),
});

export type RawQuestionnaireAnswers = z.infer<typeof rawQuestionnaireSchema>;

export function normalizeQuestionnaireAnswers(input: RawQuestionnaireAnswers) {
  const normalized = runQuestionnaireSchema.parse({
    archetype: input.deckType,
    audience: input.audience,
    objective: input.goal,
    callToAction: input.callToAction,
    outputFormat: input.outputFormat,
    desiredCardCount: input.cardCount,
    tone: input.tone,
    visualStyle: input.visualStyle,
    imagePolicy: input.imagePolicy,
    mustInclude: input.mustInclude,
    mustAvoid: input.mustAvoid,
    extraInstructions: input.extraInstructions,
    optionalReview: input.optionalReview,
    allowUserApprovedCrawlException: input.allowUserApprovedCrawlException,
  });

  return normalized;
}

export const questionnairePrompts = [
  {
    id: "goal",
    label: "Goal",
    prompt: "What should this deck accomplish?",
  },
  {
    id: "audience",
    label: "Audience",
    prompt: "Who will read or present this deck?",
  },
  {
    id: "deckType",
    label: "Deck Type",
    prompt: "Choose the deck archetype.",
  },
  {
    id: "outputFormat",
    label: "Output Format",
    prompt: "Choose one output format for this run.",
  },
  {
    id: "tone",
    label: "Tone",
    prompt: "What tone should the deck use?",
  },
  {
    id: "cardCount",
    label: "Card Count",
    prompt: "How many cards should each deck target?",
  },
  {
    id: "callToAction",
    label: "CTA",
    prompt: "What action should the recipient take after reading?",
  },
  {
    id: "visualStyle",
    label: "Visual Style",
    prompt: "What visual style should the presentation engine aim for?",
  },
  {
    id: "imagePolicy",
    label: "Image Policy",
    prompt: "Should the system auto-decide, never use, or always use generated images?",
  },
  {
    id: "mustInclude",
    label: "Must Include",
    prompt: "List any sections or points that must appear.",
  },
  {
    id: "mustAvoid",
    label: "Must Avoid",
    prompt: "List anything that should not appear.",
  },
  {
    id: "extraInstructions",
    label: "Extra Instructions",
    prompt: "Add any extra guidance for the system.",
  },
];
