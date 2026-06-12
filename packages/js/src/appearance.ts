import type {
  KicbacAppearance,
  KicbacAppearanceVariables,
  KicbacCollectCss,
  KicbacCollectCssOverrides,
} from "./types.js";

/**
 * CSS properties Collect.js accepts for customCss/invalidCss/validCss/focusCss
 * (verified verbatim against the Kicbac Collect.js PDF, "Styling Limitations",
 * pp. 30–32). Anything else is silently ignored by the gateway, so we drop it
 * here for predictability.
 */
export const COLLECT_CSS_ALLOWLIST: ReadonlySet<string> = new Set([
  "background-color",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "border-style",
  "border-radius",
  "border-color",
  "bottom",
  "box-shadow",
  "color",
  "cursor",
  "direction",
  "font-family",
  "font-kerning",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant-caps",
  "font-variant-numeric",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "margin-top",
  "margin-bottom",
  "opacity",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "pointer-events",
  "text-align",
  "text-align-last",
  "text-decoration",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-decoration-skip-ink",
  "text-underline-position",
  "text-indent",
  "text-rendering",
  "text-shadow",
  "text-size-adjust",
  "text-overflow",
  "text-transform",
  "transition",
  "vertical-align",
  "white-space",
  "will-change",
  "word-break",
  "word-spacing",
  "hyphens",
]);

/** The narrower allowlist for placeholderCss (PDF p. 32). */
export const PLACEHOLDER_CSS_ALLOWLIST: ReadonlySet<string> = new Set([
  "background-color",
  "font-family",
  "font-kerning",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant-caps",
  "font-variant-numeric",
  "font-weight",
  "word-spacing",
  "letter-spacing",
  "line-height",
  "text-decoration",
  "text-indent",
  "text-transform",
  "transition",
  "vertical-align",
  "opacity",
  "color",
]);

/** Kicbac brand defaults (todo.md Appendix D). */
export const DEFAULT_APPEARANCE_VARIABLES: Required<KicbacAppearanceVariables> = {
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
};

/** Google-hosted families we can load via Collect.js `googleFont`. */
const KNOWN_GOOGLE_FONTS = new Set(
  [
    "Inter",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Source Sans 3",
    "Source Sans Pro",
    "Nunito",
    "Raleway",
    "DM Sans",
    "Work Sans",
    "Manrope",
    "Karla",
    "Rubik",
    "Figtree",
    "IBM Plex Sans",
    "Space Grotesk",
  ].map((f) => f.toLowerCase()),
);

/** Merge defaults ← baseTheme.variables ← appearance.variables. */
export function resolveAppearanceVariables(
  appearance?: KicbacAppearance,
): Required<KicbacAppearanceVariables> {
  return {
    ...DEFAULT_APPEARANCE_VARIABLES,
    ...appearance?.baseTheme?.variables,
    ...appearance?.variables,
  };
}

/** Parse a CSS color to RGB; supports #rgb/#rrggbb/#rrggbbaa and rgb()/rgba(). */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (hex && hex[1]) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const fn = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i.exec(color.trim());
  if (fn) {
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) };
  }
  return null;
}

/** Compute an rgba() literal at the given alpha; null when the color can't be parsed. */
export function colorWithAlpha(color: string, alpha: number): string | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** First font family in a stack, unquoted. */
function firstFontFamily(stack: string): string {
  const first = stack.split(",")[0] ?? "";
  return first.trim().replace(/^['"]|['"]$/g, "");
}

function pxNumber(value: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return m && m[1] ? Number(m[1]) : null;
}

const FOUR_SIDES = ["top", "right", "bottom", "left"] as const;

function borderSides(color: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const side of FOUR_SIDES) {
    out[`border-${side}-color`] = color;
    out[`border-${side}-style`] = "solid";
    out[`border-${side}-width`] = "1px";
  }
  return out;
}

function borderSideColors(color: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const side of FOUR_SIDES) {
    out[`border-${side}-color`] = color;
  }
  return out;
}

/**
 * Filter a CSS object through an allowlist, dropping non-allowlisted
 * properties and any value referencing CSS custom properties (`var(...)`
 * cannot resolve inside the gateway's iframes) — silently, per spec.
 */
function filterCss(
  css: Record<string, string>,
  allowlist: ReadonlySet<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(css)) {
    if (!allowlist.has(prop)) continue;
    if (typeof value !== "string" || value.includes("var(")) continue;
    out[prop] = value;
  }
  return out;
}

function mergeOverride(
  base: Record<string, string>,
  ...overrides: Array<Record<string, string> | undefined>
): Record<string, string> {
  return Object.assign({}, base, ...overrides.filter(Boolean));
}

/**
 * Translate a `KicbacAppearance` into the five Collect.js CSS objects (plus a
 * derived `googleFont`). Values are resolved to literals — the gateway's
 * iframes cannot inherit the host page's CSS custom properties.
 */
export function appearanceToCollectCss(appearance?: KicbacAppearance): KicbacCollectCss {
  const v = resolveAppearanceVariables(appearance);
  const unit = pxNumber(v.spacingUnit) ?? 4;

  const customCss: Record<string, string> = {
    color: v.colorText,
    "background-color": v.colorBackground,
    "font-family": v.fontFamily,
    "font-size": v.fontSize,
    "border-radius": v.borderRadius,
    ...borderSides(v.borderColor),
    padding: `${unit * 3}px`,
    transition: "border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease",
    height: "44px",
  };

  const primaryRing = colorWithAlpha(v.colorPrimary, 0.16);
  const focusCss: Record<string, string> = {
    ...borderSideColors(v.colorPrimary),
    "background-color": v.colorBackground,
    "outline-style": "none",
    ...(primaryRing ? { "box-shadow": `0 0 0 3px ${primaryRing}` } : {}),
  };

  const dangerRing = colorWithAlpha(v.colorDanger, 0.14);
  const invalidCss: Record<string, string> = {
    ...borderSideColors(v.colorDanger),
    ...(dangerRing ? { "box-shadow": `0 0 0 3px ${dangerRing}` } : {}),
  };

  const validCss: Record<string, string> = {
    ...borderSideColors(v.colorSuccess),
  };

  const placeholderCss: Record<string, string> = {
    color: v.colorTextPlaceholder,
    "font-family": v.fontFamily,
    "font-size": v.fontSize,
  };

  const overrides: KicbacCollectCssOverrides = {
    ...appearance?.baseTheme?.collectCss,
    ...appearance?.collectCss,
  };

  const result: KicbacCollectCss = {
    customCss: filterCss(mergeOverride(customCss, overrides.customCss), COLLECT_CSS_ALLOWLIST),
    invalidCss: filterCss(mergeOverride(invalidCss, overrides.invalidCss), COLLECT_CSS_ALLOWLIST),
    validCss: filterCss(mergeOverride(validCss, overrides.validCss), COLLECT_CSS_ALLOWLIST),
    placeholderCss: filterCss(
      mergeOverride(placeholderCss, overrides.placeholderCss),
      PLACEHOLDER_CSS_ALLOWLIST,
    ),
    focusCss: filterCss(mergeOverride(focusCss, overrides.focusCss), COLLECT_CSS_ALLOWLIST),
  };

  const family = firstFontFamily(v.fontFamily);
  if (KNOWN_GOOGLE_FONTS.has(family.toLowerCase())) {
    result.googleFont = `${family}:400,500,600`;
  }
  return result;
}

/**
 * Translate a `KicbacAppearance` into `--kb-*` custom properties for the host
 * chrome (card, labels, button) rendered by `@kicbac/react`.
 */
export function appearanceToCssVars(appearance?: KicbacAppearance): Record<string, string> {
  const v = resolveAppearanceVariables(appearance);
  const vars: Record<string, string> = {
    "--kb-color-primary": v.colorPrimary,
    "--kb-color-text": v.colorText,
    "--kb-color-muted": v.colorTextMuted,
    "--kb-color-danger": v.colorDanger,
    "--kb-color-success": v.colorSuccess,
    "--kb-color-bg": v.colorBackground,
    "--kb-color-surface": v.colorSurface,
    "--kb-color-placeholder": v.colorTextPlaceholder,
    "--kb-color-border": v.borderColor,
    "--kb-radius": v.borderRadius,
    "--kb-radius-card": v.borderRadiusCard,
    "--kb-font": v.fontFamily,
    "--kb-font-size": v.fontSize,
    "--kb-spacing": v.spacingUnit,
    "--kb-gradient-cta": v.gradientCta,
  };
  const ring = colorWithAlpha(v.colorPrimary, 0.16);
  if (ring) vars["--kb-ring"] = ring;
  const dangerRing = colorWithAlpha(v.colorDanger, 0.14);
  if (dangerRing) vars["--kb-ring-danger"] = dangerRing;
  return vars;
}
