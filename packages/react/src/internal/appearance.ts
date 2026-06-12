import type { KicbacAppearance } from "@kicbac/js";

/** Shallow-merge two appearances; `override` wins per variables/elements key. */
export function mergeAppearance(
  base?: KicbacAppearance,
  override?: KicbacAppearance,
): KicbacAppearance {
  if (!base) return override ?? {};
  if (!override) return base;
  const baseTheme = override.baseTheme ?? base.baseTheme;
  return {
    ...(baseTheme ? { baseTheme } : {}),
    variables: { ...base.variables, ...override.variables },
    elements: { ...base.elements, ...override.elements },
    collectCss: { ...base.collectCss, ...override.collectCss },
  };
}

/** Join class names, skipping falsy values. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
