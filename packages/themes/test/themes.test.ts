import { describe, expect, it } from "vitest";
import { appearanceToCollectCss, appearanceToCssVars } from "@kicbac/js";
import { createTheme, darkTheme, defaultTheme, minimalTheme } from "../src/index.js";

describe("themes", () => {
  it("appearanceToCollectCss(darkTheme) snapshot", () => {
    expect(appearanceToCollectCss(darkTheme)).toMatchSnapshot();
  });

  it("defaultTheme matches the built-in defaults exactly", () => {
    expect(appearanceToCollectCss(defaultTheme)).toEqual(appearanceToCollectCss());
    expect(appearanceToCssVars(defaultTheme)).toEqual(appearanceToCssVars());
  });

  it("minimalTheme removes the gradient and tightens radii", () => {
    const vars = appearanceToCssVars(minimalTheme);
    expect(vars["--kb-gradient-cta"]).toBe("#141442");
    expect(vars["--kb-radius"]).toBe("6px");
    expect(vars["--kb-radius-card"]).toBe("6px");
  });

  it("darkTheme keeps the Kicbac accent and gradient", () => {
    const vars = appearanceToCssVars(darkTheme);
    expect(vars["--kb-color-primary"]).toBe("#f04ac4");
    expect(vars["--kb-gradient-cta"]).toContain("linear-gradient");
    expect(vars["--kb-color-surface"]).toBe("#141442");
    expect(vars["--kb-color-bg"]).toBe("#0b0b22");
  });

  it("createTheme shallow-merges variables over defaultTheme", () => {
    const theme = createTheme({ variables: { colorPrimary: "#123456" } });
    expect(theme.variables?.colorPrimary).toBe("#123456");
    expect(theme.variables?.colorText).toBe("#141442");
    expect(theme.variables?.gradientCta).toContain("linear-gradient");
    // The source themes are untouched.
    expect(defaultTheme.variables?.colorPrimary).toBe("#f04ac4");
  });

  it("themes work as a baseTheme with appearance-level overrides on top", () => {
    const css = appearanceToCollectCss({
      baseTheme: darkTheme,
      variables: { colorText: "#ffffff" },
    });
    expect(css.customCss["color"]).toBe("#ffffff");
    expect(css.customCss["background-color"]).toBe("#0b0b22");
  });
});
