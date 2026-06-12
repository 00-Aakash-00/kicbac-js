/**
 * Prebuilt appearance presets for Kicbac payment components.
 *
 * Usage: `<KicbacProvider appearance={{ baseTheme: darkTheme }}>` or
 * `appearanceToCollectCss(darkTheme)` for vanilla integrations.
 */
import type { KicbacAppearanceVariables, KicbacTheme } from "@kicbac/js";

export type { KicbacAppearance, KicbacAppearanceVariables, KicbacTheme } from "@kicbac/js";

/**
 * The Kicbac brand look: white card, indigo text, signature pink accent and
 * the CTA gradient. This matches the built-in defaults — use it as the
 * starting point for `createTheme`.
 */
export const defaultTheme: KicbacTheme = {
  variables: {
    colorPrimary: "#f04ac4",
    colorText: "#141442",
    colorTextMuted: "#757575",
    colorDanger: "#e5484d",
    colorSuccess: "#30a46c",
    colorBackground: "#ffffff",
    colorSurface: "#ffffff",
    colorTextPlaceholder: "#989898",
    fontFamily: "'Inter', -apple-system, 'Segoe UI', sans-serif",
    fontSize: "16px",
    borderRadius: "10px",
    borderRadiusCard: "16px",
    borderColor: "#e4e4ec",
    spacingUnit: "4px",
    gradientCta:
      "linear-gradient(280deg, #f8b345 -25%, #f23fe5 34.64%, #ad4ef8 62.57%, #6dacff 109%)",
  },
};

/** Deep navy surfaces with the same Kicbac accent and CTA gradient. */
export const darkTheme: KicbacTheme = {
  variables: {
    colorBackground: "#0b0b22",
    colorSurface: "#141442",
    colorText: "#f2f2f8",
    colorTextMuted: "#9a9ab8",
    colorTextPlaceholder: "#9a9ab8",
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
};

/** Understated neutral grays, indigo primary, solid button, 6px radii. */
export const minimalTheme: KicbacTheme = {
  variables: {
    colorPrimary: "#141442",
    colorText: "#1a1a1a",
    colorTextMuted: "#6b6b6b",
    colorBackground: "#ffffff",
    colorSurface: "#ffffff",
    colorTextPlaceholder: "#9b9b9b",
    borderColor: "#d9d9de",
    borderRadius: "6px",
    borderRadiusCard: "6px",
    gradientCta: "#141442",
  },
};

/**
 * Build a custom theme by shallow-merging variable/element overrides onto
 * `defaultTheme`.
 */
export function createTheme(overrides: KicbacTheme): KicbacTheme {
  const variables: KicbacAppearanceVariables = {
    ...defaultTheme.variables,
    ...overrides.variables,
  };
  const theme: KicbacTheme = { variables };
  if (overrides.elements) theme.elements = { ...overrides.elements };
  if (overrides.collectCss) theme.collectCss = { ...overrides.collectCss };
  return theme;
}
