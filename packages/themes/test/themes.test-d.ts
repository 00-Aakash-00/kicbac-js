import { describe, expectTypeOf, it } from "vitest";
import type { KicbacAppearance, KicbacTheme } from "@kicbac/js";
import { createTheme, darkTheme, defaultTheme, minimalTheme } from "../src/index.js";

describe("theme types", () => {
  it("every preset satisfies KicbacTheme", () => {
    expectTypeOf(defaultTheme).toEqualTypeOf<KicbacTheme>();
    expectTypeOf(darkTheme).toEqualTypeOf<KicbacTheme>();
    expectTypeOf(minimalTheme).toEqualTypeOf<KicbacTheme>();
  });

  it("themes are usable directly as a KicbacAppearance and as baseTheme", () => {
    expectTypeOf(darkTheme).toExtend<KicbacAppearance>();
    expectTypeOf<KicbacAppearance>().toHaveProperty("baseTheme");
    const appearance: KicbacAppearance = { baseTheme: darkTheme };
    expectTypeOf(appearance.baseTheme).toEqualTypeOf<KicbacTheme | undefined>();
  });

  it("createTheme accepts overrides and returns a KicbacTheme", () => {
    expectTypeOf(createTheme).parameter(0).toExtend<KicbacTheme>();
    expectTypeOf(createTheme({ variables: { colorPrimary: "#000000" } })).toExtend<KicbacTheme>();
  });
});
