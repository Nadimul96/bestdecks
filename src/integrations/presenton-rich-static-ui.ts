import { z } from "zod";

import {
  RICH_STATIC_VISUAL_PROFILE,
  richStaticLayoutIdSchema,
  selectRichStaticLayoutIds,
  type RichStaticLayoutId,
} from "@/src/domain/visual-profile";

export const PRESENTON_RICH_STATIC_SLIDE_WIDTH = 1_280 as const;
export const PRESENTON_RICH_STATIC_SLIDE_HEIGHT = 720 as const;
export const PRESENTON_RICH_STATIC_LAYOUT_GROUP =
  "template-v2-bestdecks-rich-static-v1" as const;

const HEADLINE_MAX_LENGTH = 120;
const BULLET_MAX_LENGTH = 180;
const MAX_SLIDES = 60;

const COLORS = Object.freeze({
  background: "#FFFFFF",
  ink: "#111827",
  primary: "#168C2A",
  deep: "#0B3D1F",
  accent: "#1B8C2D",
  mint: "#D8F3DC",
  soft: "#F2F7F3",
  line: "#B7E4C7",
} as const);

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShapeBlueprint {
  type: "rectangle" | "ellipse";
  frame: Frame;
  color: (typeof COLORS)[keyof typeof COLORS];
}

interface LayoutBlueprint {
  description: string;
  component: {
    position: Pick<Frame, "x" | "y">;
    size: Pick<Frame, "width" | "height">;
  };
  shapes: readonly ShapeBlueprint[];
  headlineFrame: Frame;
  bulletFrames: readonly [Frame, Frame, Frame];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Canonical, content-free geometry attestation for the v0.1 renderer.
 *
 * The ordered shape list is also the z-order contract: every native-vector
 * decoration is emitted before any text. Consumers can map each pixel value to
 * OOXML EMUs with Presenton's pinned 9,525-EMU-per-pixel export transform.
 */
export const PRESENTON_RICH_STATIC_UI_TEMPLATE_SPEC = deepFreeze({
  schemaVersion: 1,
  templateId: RICH_STATIC_VISUAL_PROFILE.templateId,
  themeId: RICH_STATIC_VISUAL_PROFILE.themeId,
  layoutGroup: PRESENTON_RICH_STATIC_LAYOUT_GROUP,
  canvas: {
    width: PRESENTON_RICH_STATIC_SLIDE_WIDTH,
    height: PRESENTON_RICH_STATIC_SLIDE_HEIGHT,
  },
  fontFamily: "Arial",
  colors: COLORS,
  layouts: {
    bestdecks_split_panel_v1: {
      description: "Asymmetric editorial rail with three evidence lanes.",
      component: {
        position: { x: 0, y: 0 },
        size: {
          width: PRESENTON_RICH_STATIC_SLIDE_WIDTH,
          height: PRESENTON_RICH_STATIC_SLIDE_HEIGHT,
        },
      },
      shapes: [
        { type: "rectangle", frame: { x: 0, y: 0, width: 1_280, height: 720 }, color: COLORS.background },
        { type: "rectangle", frame: { x: 0, y: 0, width: 24, height: 720 }, color: COLORS.primary },
        { type: "rectangle", frame: { x: 72, y: 42, width: 196, height: 12 }, color: COLORS.line },
        { type: "rectangle", frame: { x: 64, y: 212, width: 70, height: 472 }, color: COLORS.soft },
        { type: "ellipse", frame: { x: 82, y: 256, width: 34, height: 34 }, color: COLORS.primary },
        { type: "ellipse", frame: { x: 82, y: 406, width: 34, height: 34 }, color: COLORS.deep },
        { type: "ellipse", frame: { x: 82, y: 556, width: 34, height: 34 }, color: COLORS.accent },
        { type: "rectangle", frame: { x: 1_120, y: 0, width: 160, height: 28 }, color: COLORS.deep },
      ],
      headlineFrame: { x: 80, y: 60, width: 1_080, height: 135 },
      bulletFrames: [
        { x: 160, y: 225, width: 1_040, height: 135 },
        { x: 160, y: 375, width: 1_040, height: 135 },
        { x: 160, y: 525, width: 1_040, height: 135 },
      ],
    },
    bestdecks_card_grid_v1: {
      description: "Three-column card field with a restrained geometric crown.",
      component: {
        position: { x: 0, y: 0 },
        size: {
          width: PRESENTON_RICH_STATIC_SLIDE_WIDTH,
          height: PRESENTON_RICH_STATIC_SLIDE_HEIGHT,
        },
      },
      shapes: [
        { type: "rectangle", frame: { x: 0, y: 0, width: 1_280, height: 720 }, color: COLORS.background },
        { type: "rectangle", frame: { x: 0, y: 0, width: 1_280, height: 18 }, color: COLORS.primary },
        { type: "ellipse", frame: { x: 1_100, y: 46, width: 98, height: 98 }, color: COLORS.mint },
        { type: "ellipse", frame: { x: 1_160, y: 84, width: 54, height: 54 }, color: COLORS.line },
        { type: "rectangle", frame: { x: 20, y: 252, width: 398, height: 428 }, color: COLORS.soft },
        { type: "rectangle", frame: { x: 441, y: 252, width: 398, height: 428 }, color: COLORS.mint },
        { type: "rectangle", frame: { x: 862, y: 252, width: 398, height: 428 }, color: COLORS.soft },
        { type: "rectangle", frame: { x: 20, y: 252, width: 398, height: 16 }, color: COLORS.primary },
        { type: "rectangle", frame: { x: 441, y: 252, width: 398, height: 16 }, color: COLORS.deep },
        { type: "rectangle", frame: { x: 862, y: 252, width: 398, height: 16 }, color: COLORS.accent },
      ],
      headlineFrame: { x: 54, y: 52, width: 1_000, height: 158 },
      bulletFrames: [
        { x: 34, y: 276, width: 370, height: 390 },
        { x: 455, y: 276, width: 370, height: 390 },
        { x: 876, y: 276, width: 370, height: 390 },
      ],
    },
    bestdecks_index_grid_v1: {
      description: "Indexed horizontal grid with a soft radial counterweight.",
      component: {
        position: { x: 0, y: 0 },
        size: {
          width: PRESENTON_RICH_STATIC_SLIDE_WIDTH,
          height: PRESENTON_RICH_STATIC_SLIDE_HEIGHT,
        },
      },
      shapes: [
        { type: "rectangle", frame: { x: 0, y: 0, width: 1_280, height: 720 }, color: COLORS.background },
        { type: "ellipse", frame: { x: 1_000, y: 0, width: 280, height: 280 }, color: COLORS.soft },
        { type: "ellipse", frame: { x: 1_105, y: 76, width: 112, height: 112 }, color: COLORS.mint },
        { type: "rectangle", frame: { x: 48, y: 42, width: 138, height: 10 }, color: COLORS.primary },
        { type: "rectangle", frame: { x: 56, y: 205, width: 1_168, height: 150 }, color: COLORS.soft },
        { type: "rectangle", frame: { x: 56, y: 365, width: 1_168, height: 150 }, color: COLORS.mint },
        { type: "rectangle", frame: { x: 56, y: 525, width: 1_168, height: 150 }, color: COLORS.soft },
        { type: "ellipse", frame: { x: 82, y: 244, width: 70, height: 70 }, color: COLORS.primary },
        { type: "ellipse", frame: { x: 82, y: 404, width: 70, height: 70 }, color: COLORS.deep },
        { type: "ellipse", frame: { x: 82, y: 564, width: 70, height: 70 }, color: COLORS.accent },
      ],
      headlineFrame: { x: 64, y: 58, width: 900, height: 130 },
      bulletFrames: [
        { x: 170, y: 210, width: 1_020, height: 140 },
        { x: 170, y: 370, width: 1_020, height: 140 },
        { x: 170, y: 530, width: 1_020, height: 140 },
      ],
    },
    bestdecks_spotlight_v1: {
      description: "Spotlight field with offset orbits and stacked proof bands.",
      component: {
        position: { x: 0, y: 0 },
        size: {
          width: PRESENTON_RICH_STATIC_SLIDE_WIDTH,
          height: PRESENTON_RICH_STATIC_SLIDE_HEIGHT,
        },
      },
      shapes: [
        { type: "rectangle", frame: { x: 0, y: 0, width: 1_280, height: 720 }, color: COLORS.background },
        { type: "rectangle", frame: { x: 0, y: 0, width: 1_280, height: 20 }, color: COLORS.deep },
        { type: "ellipse", frame: { x: 1_010, y: 482, width: 270, height: 238 }, color: COLORS.mint },
        { type: "ellipse", frame: { x: 1_080, y: 40, width: 160, height: 160 }, color: COLORS.soft },
        { type: "ellipse", frame: { x: 1_138, y: 98, width: 44, height: 44 }, color: COLORS.primary },
        { type: "rectangle", frame: { x: 48, y: 214, width: 8, height: 450 }, color: COLORS.primary },
        { type: "rectangle", frame: { x: 84, y: 220, width: 1_116, height: 140 }, color: COLORS.soft },
        { type: "rectangle", frame: { x: 84, y: 370, width: 1_116, height: 140 }, color: COLORS.mint },
        { type: "rectangle", frame: { x: 84, y: 520, width: 1_116, height: 140 }, color: COLORS.soft },
        { type: "rectangle", frame: { x: 84, y: 220, width: 18, height: 140 }, color: COLORS.primary },
        { type: "rectangle", frame: { x: 84, y: 370, width: 18, height: 140 }, color: COLORS.deep },
        { type: "rectangle", frame: { x: 84, y: 520, width: 18, height: 140 }, color: COLORS.accent },
      ],
      headlineFrame: { x: 64, y: 54, width: 980, height: 138 },
      bulletFrames: [
        { x: 120, y: 225, width: 1_040, height: 135 },
        { x: 120, y: 375, width: 1_040, height: 135 },
        { x: 120, y: 525, width: 1_040, height: 135 },
      ],
    },
  } satisfies Record<RichStaticLayoutId, LayoutBlueprint>,
} as const);

/** Stable per-layout geometry/fill/text-role data for artifact attestation. */
export const PRESENTON_RICH_STATIC_LAYOUT_ATTESTATIONS =
  PRESENTON_RICH_STATIC_UI_TEMPLATE_SPEC.layouts;

export const PRESENTON_RICH_STATIC_UI_TEMPLATE_SHA256 =
  "3e229b0b08e9e89b834d0fa54fa54a8df76200795b0a7acd15ce98bb47a12d2f" as const;

const canonicalUuidSchema = z.string().uuid().refine(
  (value) => value === value.toLowerCase(),
  "UUIDs must use their canonical lowercase form.",
);

function hasUnsafeTextSyntax(value: string) {
  return /[\u0000-\u001F\u007F\u2028\u2029]|[\u202A-\u202E\u2066-\u2069]|!?\[[^\]\r\n]{0,2000}\]\([^)\r\n]{1,8192}\)|!\[|^\s{0,3}\[[^\]\r\n]{1,2000}\]:|<\/?[a-z][^>\r\n]*>/imu.test(value);
}

function exactVisibleTextSchema(maxCodePoints: number, label: string) {
  return z.string().min(1).refine(
    (value) => value === value.trim(),
    `${label} must not have surrounding whitespace.`,
  ).refine(
    (value) => [...value].length <= maxCodePoints,
    `${label} must contain at most ${maxCodePoints} Unicode code points.`,
  ).refine(
    (value) => !hasUnsafeTextSyntax(value),
    `${label} cannot contain controls, bidirectional overrides, Markdown links, images, or HTML.`,
  );
}

export const presentonRichStaticSlideContentSchema = z.object({
  headline: exactVisibleTextSchema(HEADLINE_MAX_LENGTH, "Slide headlines"),
  bulletPoints: z.array(
    exactVisibleTextSchema(BULLET_MAX_LENGTH, "Slide bullets"),
  ).max(3),
}).strict();

export type PresentonRichStaticSlideContent = z.infer<
  typeof presentonRichStaticSlideContentSchema
>;

const pointSchema = z.object({
  x: z.number().int().nonnegative().max(PRESENTON_RICH_STATIC_SLIDE_WIDTH),
  y: z.number().int().nonnegative().max(PRESENTON_RICH_STATIC_SLIDE_HEIGHT),
}).strict();

const sizeSchema = z.object({
  width: z.number().int().positive().max(PRESENTON_RICH_STATIC_SLIDE_WIDTH),
  height: z.number().int().positive().max(PRESENTON_RICH_STATIC_SLIDE_HEIGHT),
}).strict();

const fillSchema = z.object({
  color: z.enum([
    COLORS.background,
    COLORS.ink,
    COLORS.primary,
    COLORS.deep,
    COLORS.accent,
    COLORS.mint,
    COLORS.soft,
    COLORS.line,
  ]),
  opacity: z.literal(1),
}).strict();

const shapeElementSchema = z.object({
  type: z.enum(["rectangle", "ellipse"]),
  position: pointSchema,
  size: sizeSchema,
  fill: fillSchema,
}).strict();

const fontSchema = z.object({
  size: z.number().int().min(16).max(72),
  family: z.literal("Arial"),
  color: z.literal(COLORS.ink),
  bold: z.boolean(),
  line_height: z.number().min(1).max(1.5),
}).strict();

const textElementSchema = z.object({
  type: z.literal("text"),
  position: pointSchema,
  size: sizeSchema,
  font: fontSchema,
  alignment: z.object({
    horizontal: z.enum(["left", "center"]),
    vertical: z.enum(["top", "middle"]),
  }).strict(),
  runs: z.array(z.object({
    text: exactVisibleTextSchema(BULLET_MAX_LENGTH, "Rendered text"),
    font: fontSchema,
  }).strict()).length(1),
  decorative: z.literal(false),
  name: z.string().regex(/^(?:headline|bullet_[1-3])$/u),
  max_length: z.union([
    z.literal(HEADLINE_MAX_LENGTH),
    z.literal(BULLET_MAX_LENGTH),
  ]),
  min_length: z.literal(1),
}).strict().superRefine((element, context) => {
  const isHeadline = element.name === "headline";
  if (
    element.max_length !== (isHeadline ? HEADLINE_MAX_LENGTH : BULLET_MAX_LENGTH)
    || element.font.bold !== isHeadline
    || element.runs[0]?.font.bold !== isHeadline
    || JSON.stringify(element.font) !== JSON.stringify(element.runs[0]?.font)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Rendered text style does not match its closed-set text role.",
    });
  }
});

const uiElementSchema = z.union([
  shapeElementSchema,
  textElementSchema,
]);

const presentonRichStaticUiSchema = z.object({
  id: richStaticLayoutIdSchema,
  description: z.string().min(1).max(200),
  components: z.array(z.object({
    id: z.string().regex(/^bestdecks_[a-z0-9_]+_canvas$/u),
    position: pointSchema,
    size: sizeSchema,
    elements: z.array(uiElementSchema).min(3).max(32),
  }).strict()).length(1),
}).strict().superRefine((ui, context) => {
  const component = ui.components[0];
  if (!component) return;
  const blueprint = PRESENTON_RICH_STATIC_LAYOUT_ATTESTATIONS[ui.id];
  if (
    component.position.x !== 0
    || component.position.y !== 0
    || component.size.width !== PRESENTON_RICH_STATIC_SLIDE_WIDTH
    || component.size.height !== PRESENTON_RICH_STATIC_SLIDE_HEIGHT
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The rich-static component must occupy the complete 1280x720 stage.",
      path: ["components", 0],
    });
  }
  if (
    ui.description !== blueprint.description
    || component.id !== `bestdecks_${ui.id}_canvas`
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "UI metadata must identify the selected Bestdecks layout exactly.",
    });
  }

  let seenText = false;
  let backgroundCount = 0;
  const textNames = new Set<string>();
  for (const [index, element] of component.elements.entries()) {
    if (
      element.position.x + element.size.width > component.size.width
      || element.position.y + element.size.height > component.size.height
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every rich-static element must remain inside the slide canvas.",
        path: ["components", 0, "elements", index],
      });
    }
    if (element.type === "text") {
      seenText = true;
      if (textNames.has(element.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Visible text roles must be unique per slide.",
          path: ["components", 0, "elements", index, "name"],
        });
      }
      textNames.add(element.name);
    } else {
      if (seenText) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Native vector decoration must precede all visible text.",
          path: ["components", 0, "elements", index],
        });
      }
      if (
        element.type === "rectangle"
        && element.position.x === 0
        && element.position.y === 0
        && element.size.width === PRESENTON_RICH_STATIC_SLIDE_WIDTH
        && element.size.height === PRESENTON_RICH_STATIC_SLIDE_HEIGHT
        && element.fill.color === COLORS.background
      ) {
        backgroundCount += 1;
      }
    }
  }
  if (backgroundCount !== 1 || !textNames.has("headline")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Every slide needs one white vector background and one headline.",
      path: ["components", 0, "elements"],
    });
  }

  const shapeElements = component.elements.filter((element) => element.type !== "text");
  if (
    shapeElements.length !== blueprint.shapes.length
    || shapeElements.some((element, index) => JSON.stringify(element)
      !== JSON.stringify(shapeFromBlueprint(blueprint.shapes[index]!)))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Native vector geometry must match the selected layout attestation.",
      path: ["components", 0, "elements"],
    });
  }

  const textElements = component.elements.filter((element) => element.type === "text");
  if (textElements.length < 1 || textElements.length > 4) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A slide must contain one headline and at most three bullets.",
      path: ["components", 0, "elements"],
    });
    return;
  }
  for (const [index, element] of textElements.entries()) {
    const name = index === 0
      ? "headline" as const
      : `bullet_${index as 1 | 2 | 3}` as const;
    const frame = index === 0
      ? blueprint.headlineFrame
      : blueprint.bulletFrames[index - 1]!;
    if (
      element.name !== name
      || JSON.stringify(element) !== JSON.stringify(
        textElement(name, element.runs[0]!.text, frame),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Visible text geometry and styling must match its exact layout role.",
        path: ["components", 0, "elements"],
      });
    }
  }
});

export const presentonRichStaticSlideSchema = z.object({
  id: canonicalUuidSchema,
  presentation: canonicalUuidSchema,
  layout_group: z.literal(PRESENTON_RICH_STATIC_LAYOUT_GROUP),
  layout: richStaticLayoutIdSchema,
  index: z.number().int().nonnegative().max(MAX_SLIDES - 1),
  content: z.object({}).strict(),
  html_content: z.null(),
  speaker_note: z.literal(""),
  properties: z.null(),
  ui: presentonRichStaticUiSchema,
}).strict().superRefine((slide, context) => {
  if (slide.layout !== slide.ui.id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Slide layout metadata and UI layout must match.",
      path: ["ui", "id"],
    });
  }
});

export type PresentonRichStaticSlide = z.infer<
  typeof presentonRichStaticSlideSchema
>;

export const presentonRichStaticSlidesInputSchema = z.object({
  presentationId: canonicalUuidSchema,
  slideIds: z.array(canonicalUuidSchema).min(1).max(MAX_SLIDES),
  slides: z.array(presentonRichStaticSlideContentSchema).min(1).max(MAX_SLIDES),
  layoutIds: z.array(richStaticLayoutIdSchema).min(1).max(MAX_SLIDES),
}).strict().superRefine((input, context) => {
  if (
    input.slideIds.length !== input.slides.length
    || input.layoutIds.length !== input.slides.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Slide IDs, visible content, and layout IDs must have equal lengths.",
    });
  }
  if (new Set(input.slideIds).size !== input.slideIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Every caller-supplied slide UUID must be unique.",
      path: ["slideIds"],
    });
  }
  if (input.slideIds.includes(input.presentationId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A slide UUID cannot reuse the presentation UUID.",
      path: ["slideIds"],
    });
  }
  if (input.slides.length > 0 && input.slides.length <= MAX_SLIDES) {
    const expected = selectRichStaticLayoutIds(input.slides.length);
    if (input.layoutIds.some((layoutId, index) => layoutId !== expected[index])) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Layout IDs must follow the deterministic rich-static sequence.",
        path: ["layoutIds"],
      });
    }
  }
});

export type PresentonRichStaticSlidesInput = z.input<
  typeof presentonRichStaticSlidesInputSchema
>;

function shapeFromBlueprint(blueprint: ShapeBlueprint) {
  return {
    type: blueprint.type,
    position: { x: blueprint.frame.x, y: blueprint.frame.y },
    size: { width: blueprint.frame.width, height: blueprint.frame.height },
    fill: { color: blueprint.color, opacity: 1 as const },
  };
}

function textElement(
  name: "headline" | `bullet_${1 | 2 | 3}`,
  text: string,
  frame: Frame,
) {
  const isHeadline = name === "headline";
  const font = {
    size: isHeadline ? 48 : 24,
    family: "Arial" as const,
    color: COLORS.ink,
    bold: isHeadline,
    line_height: isHeadline ? 1.08 : 1.25,
  };
  return {
    type: "text" as const,
    position: { x: frame.x, y: frame.y },
    size: { width: frame.width, height: frame.height },
    font,
    alignment: {
      horizontal: "left" as const,
      vertical: "middle" as const,
    },
    runs: [{ text, font: { ...font } }],
    decorative: false as const,
    name,
    max_length: isHeadline ? HEADLINE_MAX_LENGTH : BULLET_MAX_LENGTH,
    min_length: 1 as const,
  };
}

/**
 * Build exact SlideModel JSON for Presenton's deterministic create/update/export
 * path. The function performs no I/O, generates no identifiers, and never
 * writes user text anywhere except one headline run and one run per bullet.
 */
export function buildPresentonRichStaticSlides(
  input: PresentonRichStaticSlidesInput,
): PresentonRichStaticSlide[] {
  const parsed = presentonRichStaticSlidesInputSchema.parse(input);
  return parsed.slides.map((slide, index) => {
    const layoutId = parsed.layoutIds[index]!;
    const blueprint = PRESENTON_RICH_STATIC_LAYOUT_ATTESTATIONS[layoutId];
    const elements = [
      ...blueprint.shapes.map(shapeFromBlueprint),
      textElement("headline", slide.headline, blueprint.headlineFrame),
      ...slide.bulletPoints.map((bullet, bulletIndex) => textElement(
        `bullet_${(bulletIndex + 1) as 1 | 2 | 3}`,
        bullet,
        blueprint.bulletFrames[bulletIndex]!,
      )),
    ];
    return presentonRichStaticSlideSchema.parse({
      id: parsed.slideIds[index]!,
      presentation: parsed.presentationId,
      layout_group: PRESENTON_RICH_STATIC_LAYOUT_GROUP,
      layout: layoutId,
      index,
      content: {},
      html_content: null,
      speaker_note: "",
      properties: null,
      ui: {
        id: layoutId,
        description: blueprint.description,
        components: [{
          id: `bestdecks_${layoutId}_canvas`,
          position: { ...blueprint.component.position },
          size: { ...blueprint.component.size },
          elements,
        }],
      },
    });
  });
}
