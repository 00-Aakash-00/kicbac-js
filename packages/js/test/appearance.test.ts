import { describe, expect, it } from "vitest";
import {
  appearanceToCollectCss,
  appearanceToCssVars,
  COLLECT_CSS_ALLOWLIST,
  PLACEHOLDER_CSS_ALLOWLIST,
} from "../src/index.js";
import type { KicbacAppearance, KicbacCollectCss } from "../src/index.js";

/** Inline equivalents of the @kicbac/themes presets (themes can't be imported here). */
const darkVariables = {
  colorBackground: "#0b0b22",
  colorSurface: "#141442",
  colorText: "#f2f2f8",
  colorTextMuted: "#9a9ab8",
  colorTextPlaceholder: "#9a9ab8",
  borderColor: "rgba(255, 255, 255, 0.14)",
};

const minimalVariables = {
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
};

function allValues(css: KicbacCollectCss): string[] {
  return [css.customCss, css.invalidCss, css.validCss, css.placeholderCss, css.focusCss].flatMap(
    (obj) => Object.values(obj),
  );
}

describe("appearanceToCollectCss", () => {
  it("matches the default theme snapshot", () => {
    expect(appearanceToCollectCss()).toMatchSnapshot();
  });

  it("matches the dark theme snapshot", () => {
    expect(appearanceToCollectCss({ variables: darkVariables })).toMatchSnapshot();
  });

  it("matches the minimal theme snapshot", () => {
    expect(appearanceToCollectCss({ variables: minimalVariables })).toMatchSnapshot();
  });

  it("never emits var() references — iframes cannot resolve host custom properties", () => {
    for (const appearance of [
      undefined,
      { variables: darkVariables },
      { variables: minimalVariables },
    ] as Array<KicbacAppearance | undefined>) {
      for (const value of allValues(appearanceToCollectCss(appearance))) {
        expect(value).not.toContain("var(");
      }
    }
  });

  it("drops non-allowlisted properties (z-index) from overrides without error", () => {
    const css = appearanceToCollectCss({
      collectCss: {
        customCss: { "z-index": "999", "letter-spacing": "0.01em" },
      },
    });
    expect(css.customCss["z-index"]).toBeUndefined();
    expect(css.customCss["letter-spacing"]).toBe("0.01em");
  });

  it("drops values containing var() from overrides", () => {
    const css = appearanceToCollectCss({
      collectCss: { customCss: { color: "var(--brand)" } },
    });
    // The var()-based override is dropped entirely.
    expect(css.customCss["color"]).toBeUndefined();
  });

  it("placeholderCss uses the narrower allowlist", () => {
    const css = appearanceToCollectCss({
      collectCss: {
        placeholderCss: { "border-radius": "4px", "font-style": "italic" },
      },
    });
    // border-radius is allowed in customCss but NOT in placeholderCss.
    expect(COLLECT_CSS_ALLOWLIST.has("border-radius")).toBe(true);
    expect(PLACEHOLDER_CSS_ALLOWLIST.has("border-radius")).toBe(false);
    expect(css.placeholderCss["border-radius"]).toBeUndefined();
    expect(css.placeholderCss["font-style"]).toBe("italic");
  });

  it("emits only allowlisted properties across every state object", () => {
    const css = appearanceToCollectCss({ variables: darkVariables });
    for (const obj of [css.customCss, css.invalidCss, css.validCss, css.focusCss]) {
      for (const prop of Object.keys(obj)) {
        expect(COLLECT_CSS_ALLOWLIST.has(prop), `${prop} must be allowlisted`).toBe(true);
      }
    }
    for (const prop of Object.keys(css.placeholderCss)) {
      expect(PLACEHOLDER_CSS_ALLOWLIST.has(prop), `${prop} must be placeholder-allowlisted`).toBe(true);
    }
  });

  it("computes the focus ring as an rgba literal at 16% alpha of colorPrimary", () => {
    const css = appearanceToCollectCss();
    expect(css.focusCss["box-shadow"]).toBe("0 0 0 3px rgba(240, 74, 196, 0.16)");
    expect(css.focusCss["border-top-color"]).toBe("#f04ac4");
    expect(css.focusCss["outline-style"]).toBe("none");
  });

  it("computes the invalid ring at 14% alpha of colorDanger", () => {
    const css = appearanceToCollectCss();
    expect(css.invalidCss["box-shadow"]).toBe("0 0 0 3px rgba(229, 72, 77, 0.14)");
    expect(css.invalidCss["border-left-color"]).toBe("#e5484d");
  });

  it("derives googleFont for Inter (the default) but not for system-only stacks", () => {
    expect(appearanceToCollectCss().googleFont).toBe("Inter:400,500,600");
    const system = appearanceToCollectCss({
      variables: { fontFamily: "'Helvetica Neue', Arial, sans-serif" },
    });
    expect(system.googleFont).toBeUndefined();
  });

  it("resolves padding from the spacing unit to a px literal", () => {
    expect(appearanceToCollectCss().customCss["padding"]).toBe("12px");
    const spaced = appearanceToCollectCss({ variables: { spacingUnit: "6px" } });
    expect(spaced.customCss["padding"]).toBe("18px");
  });

  it("baseTheme variables apply under appearance variables", () => {
    const css = appearanceToCollectCss({
      baseTheme: { variables: { colorText: "#f2f2f8", colorBackground: "#0b0b22" } },
      variables: { colorText: "#ffffff" },
    });
    expect(css.customCss["color"]).toBe("#ffffff");
    expect(css.customCss["background-color"]).toBe("#0b0b22");
  });
});

describe("appearanceToCssVars", () => {
  it("emits the full --kb-* variable set with brand defaults", () => {
    const vars = appearanceToCssVars();
    expect(vars["--kb-color-primary"]).toBe("#f04ac4");
    expect(vars["--kb-color-text"]).toBe("#141442");
    expect(vars["--kb-color-danger"]).toBe("#e5484d");
    expect(vars["--kb-color-success"]).toBe("#30a46c");
    expect(vars["--kb-color-bg"]).toBe("#ffffff");
    expect(vars["--kb-color-placeholder"]).toBe("#989898");
    expect(vars["--kb-color-border"]).toBe("#e4e4ec");
    expect(vars["--kb-radius"]).toBe("10px");
    expect(vars["--kb-radius-card"]).toBe("16px");
    expect(vars["--kb-font"]).toContain("Inter");
    expect(vars["--kb-font-size"]).toBe("16px");
    expect(vars["--kb-spacing"]).toBe("4px");
    expect(vars["--kb-gradient-cta"]).toBe(
      "linear-gradient(280deg, #f8b345 -25%, #f23fe5 34.64%, #ad4ef8 62.57%, #6dacff 109%)",
    );
    expect(vars["--kb-ring"]).toBe("rgba(240, 74, 196, 0.16)");
    expect(vars["--kb-ring-danger"]).toBe("rgba(229, 72, 77, 0.14)");
  });

  it("reflects variable overrides", () => {
    const vars = appearanceToCssVars({ variables: minimalVariables });
    expect(vars["--kb-color-primary"]).toBe("#141442");
    expect(vars["--kb-gradient-cta"]).toBe("#141442");
    expect(vars["--kb-radius"]).toBe("6px");
  });
});
