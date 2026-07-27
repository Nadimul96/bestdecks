export interface AlaiThemeSummary {
  id?: string;
  name: string;
}

export interface AlaiPreviewTheme extends AlaiThemeSummary {
  key: string;
  description: string;
  family: "light" | "dark";
  accent: string;
  accentSoft: string;
  surface: string;
  surfaceAlt: string;
  surfaceGlow: string;
  border: string;
}

export const alaiPreviewThemes: AlaiPreviewTheme[] = [
  {
    key: "simple-dark",
    name: "Simple Dark",
    description: "Clean boardroom contrast",
    family: "dark",
    accent: "#5EA5FF",
    accentSoft: "#93C5FD",
    surface: "#08111F",
    surfaceAlt: "#0E1A2D",
    surfaceGlow: "rgba(94, 165, 255, 0.22)",
    border: "rgba(148, 163, 184, 0.2)",
  },
  {
    key: "simple-light",
    name: "Simple Light",
    description: "Minimal editorial light",
    family: "light",
    accent: "#2563EB",
    accentSoft: "#60A5FA",
    surface: "#F8FAFC",
    surfaceAlt: "#EFF6FF",
    surfaceGlow: "rgba(37, 99, 235, 0.12)",
    border: "rgba(37, 99, 235, 0.14)",
  },
  {
    key: "royal-blue",
    name: "Royal Blue",
    description: "Bold enterprise navy, high contrast",
    family: "light",
    accent: "#1E3A8A",
    accentSoft: "#2563EB",
    surface: "#EBF0FA",
    surfaceAlt: "#D6E2F5",
    surfaceGlow: "rgba(30, 58, 138, 0.18)",
    border: "rgba(30, 58, 138, 0.22)",
  },
  {
    key: "aurora-flux",
    name: "Aurora Flux",
    description: "Modern neon energy",
    family: "dark",
    accent: "#8B5CF6",
    accentSoft: "#22D3EE",
    surface: "#090A1A",
    surfaceAlt: "#11152B",
    surfaceGlow: "rgba(139, 92, 246, 0.24)",
    border: "rgba(167, 139, 250, 0.22)",
  },
  {
    key: "prismatica",
    name: "Prismatica",
    description: "Expressive, bright, colorful",
    family: "light",
    accent: "#F43F5E",
    accentSoft: "#F59E0B",
    surface: "#FFF7FB",
    surfaceAlt: "#FFF1F2",
    surfaceGlow: "rgba(244, 63, 94, 0.14)",
    border: "rgba(244, 63, 94, 0.16)",
  },
  {
    key: "midnight-ember",
    name: "Midnight Ember",
    description: "Warm premium dark",
    family: "dark",
    accent: "#F97316",
    accentSoft: "#F59E0B",
    surface: "#120B08",
    surfaceAlt: "#1C120F",
    surfaceGlow: "rgba(249, 115, 22, 0.22)",
    border: "rgba(251, 146, 60, 0.2)",
  },
];

const previewThemeByKey = new Map(alaiPreviewThemes.map((theme) => [theme.key, theme]));
const previewThemeByName = new Map(
  alaiPreviewThemes.map((theme) => [normalizeThemeName(theme.name), theme]),
);

function normalizeThemeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getAlaiPreviewTheme(key?: string) {
  if (!key) return alaiPreviewThemes[0]!;
  return previewThemeByKey.get(key) ?? alaiPreviewThemes[0]!;
}

export function getSupportedAlaiPreviewThemes(themes: AlaiThemeSummary[]) {
  const matched = new Map<string, AlaiPreviewTheme>();

  for (const theme of themes) {
    const previewTheme = previewThemeByName.get(normalizeThemeName(theme.name));
    if (!previewTheme) continue;

    const existing = matched.get(previewTheme.key);
    const incoming = { ...previewTheme, id: theme.id, name: theme.name };

    if (!existing || normalizeThemeName(theme.name) === normalizeThemeName(previewTheme.name)) {
      matched.set(previewTheme.key, incoming);
    }
  }

  const ordered = alaiPreviewThemes
    .map((theme) => matched.get(theme.key))
    .filter((theme): theme is AlaiPreviewTheme => Boolean(theme));

  return ordered.length > 0 ? ordered : alaiPreviewThemes;
}
