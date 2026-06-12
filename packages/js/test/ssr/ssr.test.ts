// @vitest-environment node
import { describe, expect, it } from "vitest";

describe("SSR safety (node environment, no window)", () => {
  it("importing every public module touches no window", async () => {
    expect(typeof window).toBe("undefined");
    await expect(import("../../src/index.js")).resolves.toBeDefined();
    await expect(import("../../src/testing.js")).resolves.toBeDefined();
  });

  it("loadKicbac resolves null on the server", async () => {
    const { loadKicbac } = await import("../../src/index.js");
    await expect(loadKicbac("any-key")).resolves.toBeNull();
  });

  it("appearance translation works without a DOM", async () => {
    const { appearanceToCollectCss, appearanceToCssVars } = await import("../../src/index.js");
    expect(appearanceToCollectCss().customCss["height"]).toBe("44px");
    expect(appearanceToCssVars()["--kb-color-primary"]).toBe("#f04ac4");
  });
});
