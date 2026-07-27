import { z } from "zod";

/**
 * Immutable v0.1 visual contract. Bestdecks owns the inline layout geometry;
 * the digest-pinned Presenton runtime only converts the closed JSON UI into a
 * static PPTX package. Generated or remotely fetched media is out of profile.
 */
export const RICH_STATIC_VISUAL_PROFILE = Object.freeze({
  schemaVersion: 1,
  profileId: "rich_static_v1",
  verificationMethod: "pptx_ooxml_rich_static_v2",
  rendererMode: "deterministic_create_update_export_v1",
  upstreamPackageProfileId: "python_pptx_2013_static_v1",
  presentonSourceCommit: "882a826f274ddbd4650cdb21b3a9ff4d16276fe9",
  presentonImage:
    "ghcr.io/presenton/presenton@sha256:8757c5d0b842e4572aeaa6bbc79817ee201a05c73909fb46bb2972165eac0a88",
  templateId: "bestdecks_inline_vector_v1",
  templateSha256: "3e229b0b08e9e89b834d0fa54fa54a8df76200795b0a7acd15ce98bb47a12d2f",
  themeId: "bestdecks_green_v1",
  layoutIds: [
    "bestdecks_split_panel_v1",
    "bestdecks_card_grid_v1",
    "bestdecks_index_grid_v1",
    "bestdecks_spotlight_v1",
  ],
  palette: [
    "111827",
    "168C2A",
    "0B3D1F",
    "1B8C2D",
    "D8F3DC",
    "F2F7F3",
    "B7E4C7",
    "FFFFFF",
  ],
  fontFamilies: ["Arial"],
  imagePolicy: "never",
  visualDensity: "rich",
  visualContentTypes: [],
} as const);

/** SHA-256 of JSON.stringify(RICH_STATIC_VISUAL_PROFILE). */
export const RICH_STATIC_VISUAL_PROFILE_SHA256 =
  "b823d08063d0b57924b27a953d2fb4cf6585edf5297cd4b5560cf335db864cd4" as const;

export const richStaticLayoutIdSchema = z.enum(
  RICH_STATIC_VISUAL_PROFILE.layoutIds,
);

export const measuredRichnessSchema = z.object({
  slideCount: z.number().int().positive().max(60),
  vectorShapeCount: z.number().int().nonnegative(),
  styledTextRunCount: z.number().int().nonnegative(),
  slidesWithBackground: z.number().int().nonnegative(),
  slidesWithVectorAccents: z.number().int().nonnegative(),
  distinctLayoutSignatures: z.number().int().nonnegative(),
  distinctPaletteColors: z.number().int().nonnegative(),
}).strict().superRefine((metrics, context) => {
  if (
    metrics.slidesWithBackground > metrics.slideCount
    || metrics.slidesWithVectorAccents > metrics.slideCount
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Visual-profile slide metrics cannot exceed the slide count.",
    });
  }
});

export const visualProfileVerificationSchema = z.object({
  id: z.literal(RICH_STATIC_VISUAL_PROFILE.profileId),
  manifestSha256: z.literal(RICH_STATIC_VISUAL_PROFILE_SHA256),
  templateId: z.literal(RICH_STATIC_VISUAL_PROFILE.templateId),
  templateSha256: z.literal(RICH_STATIC_VISUAL_PROFILE.templateSha256),
  themeId: z.literal(RICH_STATIC_VISUAL_PROFILE.themeId),
  layoutIds: z.array(richStaticLayoutIdSchema).min(1).max(60),
  measuredRichness: measuredRichnessSchema,
}).strict().superRefine((profile, context) => {
  if (
    profile.measuredRichness.slideCount !== profile.layoutIds.length
    || profile.measuredRichness.slidesWithBackground !== profile.layoutIds.length
    || profile.measuredRichness.slidesWithVectorAccents !== profile.layoutIds.length
    || profile.measuredRichness.styledTextRunCount < profile.layoutIds.length
    || profile.measuredRichness.vectorShapeCount < profile.layoutIds.length * 2
    || profile.measuredRichness.distinctPaletteColors < 2
    || (profile.layoutIds.length > 1
      && profile.measuredRichness.distinctLayoutSignatures < 2)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The artifact does not meet the mandatory rich-static visual threshold.",
      path: ["measuredRichness"],
    });
  }
});

export type VisualProfileVerification = z.infer<typeof visualProfileVerificationSchema>;
export type RichStaticLayoutId = z.infer<typeof richStaticLayoutIdSchema>;

export function selectRichStaticLayoutIds(slideCount: number): RichStaticLayoutId[] {
  if (!Number.isInteger(slideCount) || slideCount < 1 || slideCount > 60) {
    throw new RangeError("The visual profile requires between 1 and 60 slides.");
  }
  return Array.from(
    { length: slideCount },
    (_unused, index) => RICH_STATIC_VISUAL_PROFILE.layoutIds[
      index % RICH_STATIC_VISUAL_PROFILE.layoutIds.length
    ]!,
  );
}

export function isRichStaticQuestionnaire(input: {
  imagePolicy: string;
  visualContentTypes?: readonly string[];
  visualDensity?: string;
}) {
  return input.imagePolicy === RICH_STATIC_VISUAL_PROFILE.imagePolicy
    && input.visualDensity === RICH_STATIC_VISUAL_PROFILE.visualDensity
    && input.visualContentTypes?.length === 0;
}
