import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTokenizationKey } from "../src/index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveTokenizationKey", () => {
  it("prefers the explicit argument", () => {
    vi.stubEnv("NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY", "from-env");
    expect(resolveTokenizationKey("explicit")).toBe("explicit");
  });

  it("falls back to NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY", () => {
    vi.stubEnv("NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY", "from-env");
    expect(resolveTokenizationKey()).toBe("from-env");
  });

  it("returns undefined when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_KICBAC_TOKENIZATION_KEY", "");
    expect(resolveTokenizationKey()).toBeUndefined();
  });
});
